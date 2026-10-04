# Architecture

## Overview

```
Browser                                        VPS
┌─────────────────────────────────┐   HTTPS   ┌─────────────────────────────────┐
│ index.html (shell)              │ ────────► │ Nginx                           │
│ Service worker (shell cache)    │           │  /          → frontend/ (static) │
│ Vanilla JS modules              │           │  /api/*     → Express :3000      │
│ IndexedDB (pages, fiches,       │ ◄──────── │ Express (Node 24)               │
│   drafts, sync_queue, config)   │   JSON    │ better-sqlite3 → gmao.sqlite    │
└─────────────────────────────────┘           └─────────────────────────────────┘
```

- **Server**: source of truth. It serves the static shell (Nginx in production, Express in development) and a JSON REST API. It never renders HTML for business views.
- **Client**: renders everything. IndexedDB is the **primary cache for browsing**; screens read local data first, then revalidate quietly in the background (stale-while-revalidate).
- **Offline**: browsing and editing keep working with local data. Writes are queued and sent when the network returns. AI features need a connection.

## Backend layout

```
backend/src/
  server.js            starts HTTP, graceful shutdown
  app.js               builds the Express app (used by tests without listening)
  config/              loads and validates env (zod)
  db/                  connection + pragmas, migration runner, migrations/*.sql, seed/
  middleware/          auth (JWT), require-role, validate (zod), error handler
  routes/              one router per resource: thin, no SQL
  services/            SQL (prepared statements) + transactions + calling rules
  rules/               pure functions: enums, permissions, bt-status, versioning, conflict diff, kpi
  lib/                 small helpers (dates in APP_TIMEZONE, pagination)
```

Request flow: `route → validate → service → rules → SQL`. Errors are thrown as `HttpError(status, message, details)` and formatted by the error handler.

## Frontend layout

```
frontend/
  index.html                  shell: sidebar, status bar, #main-content, #table-container, #fiche-container
  sw.js                       service worker (must sit at the root for its scope)
  assets/css/                 base, layout, table, fiche, components (brief) + dashboard, conflicts
  assets/js/
    app.js                    entry point: init DB, auth, router, network, queue flush
    entities.js               entity config map (D18)
    enums.js, labels.js       enumerated values, French field labels
    api.js                    fetch wrapper: base URL, token, timeout, error mapping
    auth.js                   login/logout, token storage, current user
    db.js                     IndexedDB access (brief API + drafts/queue helpers)
    sync.js                   revalidation server → IndexedDB
    preload.js                prefetch of adjacent pages and eviction
    network.js                online/offline detection, status bar, .ai-only toggling
    queue.js                  sync_queue: enqueue, flush, retry, result handling
    save-modes.js             standard vs power-user behavior, drafts, unsaved-changes guard
    router.js                 pushState / popstate, URL parsing
    table.js, fiche.js        list and detail rendering
    conflicts.js              conflict badges, banner, supervisor console
    dashboard.js              KPI tiles, chart, lists
    dom.js                    escapeHtml, element helpers
  assets/vendor/              idb, chart.js (vendored, D17)
  test/                       Vitest + fake-indexeddb + jsdom
```

### Entity config (D18)

```js
export const ENTITIES = {
  equipements:  { prefix: 'eq', api: '/api/equipements',  ui: '/equipements' },
  bons_travaux: { prefix: 'bt', api: '/api/bons_travaux', ui: '/bons-travaux' },
};
// stores: `${prefix}_pages`, `${prefix}_fiches`; page keys: `${prefix}-page-${n}`
```

## Client routes

| URL | View |
|---|---|
| `/` | redirect to `/dashboard` |
| `/login` | login form |
| `/dashboard` | home dashboard |
| `/equipements?page=N` | équipements table |
| `/equipements/:id` | table + fiche (split view) |
| `/bons-travaux?page=N` | BT table |
| `/bons-travaux/:id` | table + BT fiche |
| `/conflits` | supervisor console: list of open conflicts (superviseur, admin) |
| `/conflits/:id` | side-by-side arbitration |

All navigation goes through `router.navigate(url)` → `history.pushState` → render. `popstate` re-renders from the URL. On load, the router parses `location` and shows the matching view. The servers return `index.html` for any non-API path (SPA fallback).

## IndexedDB

Database `gmao`, versioned schema (`DB.init` upgrades it).

| Store | Key | Content |
|---|---|---|
| `eq_pages`, `bt_pages` | `pageKey` (`eq-page-3`) | `{ pageKey, page, pages, total, sort, order, ids: [...], fetched_at }` |
| `eq_fiches`, `bt_fiches` | `id` | full record + `_fetched_at` |
| `config` | key | current page per entity, sort, user preferences, last user id, last dashboard and stats responses (for offline display) |
| `drafts` (D10) | `${entity}:${id}` | `{ entity, id, base_version, changes, updated_at }` |
| `sync_queue` (D10) | auto id | `{ entity, record_id, base_version, changes, edited_at, attempts, next_try_at, last_error }` |

Pages store row ids only; the rows themselves live in the fiche stores. This way a record shows the same values in the table and in the fiche.

A small in-memory `Map` holds the current page's records, so opening a fiche from the current page doesn't need an IndexedDB read (target < 20 ms).

## Preload and eviction

When page N of an entity is shown (P = number of pages):
1. Keep set K = {1, N−1, N, N+1, P} ∩ [1, P]: at most 5 pages.
2. Prefetch the pages of K not yet cached. One request per page; the rows are stored as fiches directly (D7).
3. Evict pages not in K. **The current page N is part of K** (the brief's sample code would have evicted it).
4. Evict fiches that belong to no kept page, unless they have a draft, a queued write, or are open in the fiche panel.
5. The page cache is valid for one `sort`/`order` combination. Changing the sort clears that entity's page store.

Prefetching runs after the visible content is rendered, one request at a time, and is skipped while offline.

## Revalidation (stale-while-revalidate)

- Triggers: showing a cached page or fiche; the window regaining focus; the network coming back.
- Fetch the page (or record), then compare each row's `updated_at` with the local copy, and update only what changed. If `total`/`pages` changed, update the pagination.
- If the record shown in the fiche panel changed: show the discreet badge **"Mise à jour disponible"** (an action that reloads the fiche). If the user has unsaved edits on that fiche, keep the badge and their edits. The server will detect a conflict when they save, if there is one.
- Rows with `conflit = true` get the conflict styling right after revalidation.

## Network state

- Offline when `navigator.onLine` is false **or** an API call fails with a network error or times out (5 s). While offline, `GET /api/health` is pinged every 15 s.
- Offline: `<body>` gets `is-offline`, the status bar shows **"Mode hors ligne — données locales"**, and every `.ai-only` button is disabled (`disabled` + `aria-disabled`, with a tooltip explaining why).
- Back online: flush the queue, then revalidate the current view.

## Save modes

Both modes write through the same queue (D11). They differ only in what triggers a save.

**Standard mode** (`power_user = false`):
- Editing a field marks the fiche as dirty. Every 60 s, the dirty fiche is saved as a draft in `drafts`.
- **Sauvegarder** button → enqueue the changes → flush.
- Closing the fiche, opening another one, or navigating away while dirty → confirmation dialog "Modifications non sauvegardées" (Enregistrer / Abandonner / Annuler). Leaving the page uses the browser's `beforeunload` prompt.
- When a fiche with a draft is opened → banner "Brouillon non enregistré du <date>": Restaurer / Ignorer.

**Power-user mode** (`power_user = true`):
- Edits are saved to `drafts` continuously (debounced, 500 ms), so nothing is lost if the tab closes.
- Leaving the fiche (close, open another fiche, route change) → the draft is enqueued and flushed automatically.
- At startup, any power-user draft left over (tab closed before leaving the fiche) is enqueued automatically.

## Sync queue

- One queue entry per record: new edits to a record not yet sent are merged into its existing entry, keeping the original `base_version`.
- Flush: FIFO, one request at a time. Runs on enqueue (if online), on reconnect, at startup, and every 30 s while the queue isn't empty.
- Display: queued edits are shown immediately in the fiche, marked "En attente de synchronisation". The status bar shows the number of pending writes.

| Server response | Client action |
|---|---|
| 200 | Store the returned `item` as the fiche, update its row, delete the queue entry and the draft. |
| 409 conflict | Delete the queue entry, store the server version, mark the record as in conflict, tell the user that a supervisor will arbitrate. |
| 409 locked | Same as conflict. The edits are kept as a draft so they can be re-applied after arbitration. |
| 400 / 403 / 422 | Delete the queue entry, keep the edits as a draft, show the error on the fiche. |
| 401 | Pause the queue, ask the user to log in again, then resume. |
| Network error / 5xx | Keep the entry; retry with backoff (5 s, 15 s, 60 s, then every 5 min). |

## Conflicts

```
client A (v3) ─PUT v3─► server: v3 == v3 → apply, v4
client B (v3) ─PUT v3─► server: v3 != v4 → conflits row (A = server v4, B = client changes), conflit = 1 → 409
supervisor   ─resolve─► apply A | B | merge → v5, conflit = 0, conflit row resolu
```

- Display (accessibility: never color alone): amber row background + ⚠ icon + text badge "Conflit" in the table. Banner and badge in the fiche.
- Console `/conflits`: list with the record, the author and timestamp of each version. The detail view shows the two versions side by side, highlights divergent fields (BR-V6) and offers **Valider version A**, **Valider version B**, **Fusionner manuellement** (choose the value per divergent field).

## AI readiness (future)

- Buttons that need AI carry the `.ai-only` class and are disabled offline (see Network state).
- The fiche has a reserved "Assistant IA" area, hidden by a feature flag until the endpoints exist.

## Security

- JWT in `localStorage` (8 h expiry). Mitigation against script injection: all values escaped (D12), and a strict Content-Security-Policy set by `helmet` (no inline scripts or styles, `default-src 'self'`).
- `helmet`, `express-rate-limit` on login, JSON body limit 100 kB, prepared statements only (sort columns from a whitelist).
- Same origin in production (Nginx), so no CORS configuration is needed.
- Logout clears the token and IndexedDB (D22). Confidential data must not be added to the mock dataset (brief: no sensitive data in IndexedDB).

## Performance budget

| Measure | Target | How it is checked |
|---|---|---|
| Table → fiche, data cached | < 20 ms | `performance.mark/measure` around the click → render; logged in dev |
| Initial load | < 2 s | Lighthouse / DevTools on the VPS, cold cache, Fast 4G profile |
| Pages kept in IndexedDB | ≤ 5 per entity | unit test on the keep-set logic + manual check in DevTools |

The frontend has no build step. Chart.js is loaded on demand (script injected the first time the dashboard is shown), not at startup.
