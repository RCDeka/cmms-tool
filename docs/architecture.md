# Architecture

## Overview

```
Browser                                        VPS
┌─────────────────────────────────┐   HTTPS   ┌─────────────────────────────────┐
│ index.html (shell)              │ ────────► │ Nginx                           │
│ Service worker (shell, D28)     │           │  /          → frontend/ (static) │
│ Vanilla JS modules              │           │  /api/*     → Express :3000      │
│ IndexedDB (pages, records,      │ ◄──────── │ Express (Node 24)               │
│   drafts, sync_queue, config)   │   JSON    │ better-sqlite3 → cmms.sqlite    │
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
  rules/               pure functions: enums, permissions, work-order-status, versioning, conflict diff, kpi
  lib/                 small helpers (dates in APP_TIMEZONE, pagination)
```

Request flow: `route → validate → service → rules → SQL`. Errors are thrown as `HttpError(status, message, details)` and formatted by the error handler.

## Frontend layout

```
frontend/
  index.html                  shell: sidebar, status bar, #main-content, #table-container, #detail-container
  sw.js                       service worker (must sit at the root for its scope)
  assets/css/                 base, layout, table, detail, components (brief) + dashboard, conflicts
  assets/js/
    app.js                    entry point: init DB, auth, router, network, queue flush
    config.js                 APP_NAME, API base, timeout, page size
    entities.js               entity config map (D18), table columns, detail fields
    enums.js, labels.js       enum codes, UI labels for fields and values
    api.js                    fetch wrapper: base URL, token, timeout, error mapping
    session.js                token and user in localStorage, token expiry
    auth.js                   login/logout, current user, roles
    login.js                  login page
    db.js                     IndexedDB access (brief API + drafts/queue helpers)
    sync.js                   revalidation server → IndexedDB
    preload.js                prefetch of adjacent pages and eviction
    network.js                online/offline detection, status bar, .ai-only toggling
    queue.js                  sync_queue: enqueue, flush, retry, result handling
    save-modes.js             drafts, leave decision (standard vs power user), debounce
    editor.js                 edit and creation flows in the detail panel, navigation guard
    form.js                   form controls generated from field definitions, errors
    rules.js                  copies of backend rules (transitions, permission matrix)
    refs.js                   sites and users for dropdowns, asset lookup by code
    router.js                 pushState / popstate, URL parsing
    table.js, detail.js       list and detail panel rendering
    format.js                 value formatting (dates, enums as badges, users)
    layout.js                 shell: sidebar, menu, title, status bar, live region, split view
    conflicts.js              conflict badges, banner, supervisor console
    dashboard.js              KPI tiles, chart, lists
    dom.js                    escapeHtml, element helpers
  assets/vendor/              idb, chart.js (vendored, D17)
  test/                       Vitest + fake-indexeddb + jsdom
```

The `frontend/assets/` folder holds static files for the web page. It has nothing to do with the "assets" entity.

### Entity config (D18)

```js
export const ENTITIES = {
  assets:      { prefix: 'asset', api: '/api/assets',      ui: '/assets' },
  work_orders: { prefix: 'wo',    api: '/api/work-orders', ui: '/work-orders' },
};
// stores: `${prefix}_pages`, `${prefix}_records`; page keys: `${prefix}-page-${n}`
```

## Client routes

| URL | View |
|---|---|
| `/` | redirect to `/dashboard` |
| `/login` | login form |
| `/dashboard` | home dashboard |
| `/assets?page=N` | assets table |
| `/assets/:id?page=N` | table page N + asset detail (split view); `page` is optional and keeps the table where the user opened the record |
| `/work-orders?page=N` | work orders table |
| `/work-orders/new` | table + creation form in the detail panel; `?asset_id=N` pre-fills the asset ("New work order" button in an asset's detail panel) |
| `/work-orders/:id` | table + work order detail (`:id` may be a temporary `tmp-<uuid>` id, see Work order creation) |
| `/conflicts` | supervisor console: list of open conflicts (SUPERVISOR, ADMIN) |
| `/conflicts/:id` | side-by-side arbitration |

All navigation goes through `router.navigate(url)` → `history.pushState` → render. `popstate` re-renders from the URL. On load, the router parses `location` and shows the matching view. The servers return `index.html` for any non-API path without a file extension (SPA fallback). The static folder `frontend/assets/` shares the `/assets` prefix with the asset routes, so the servers must never redirect a directory path: Express uses `express.static(..., { redirect: false })`, and Nginx must use `try_files $uri /index.html` (without `$uri/`).

## IndexedDB

Database `cmms`, versioned schema (`DB.init` upgrades it).

| Store | Key | Content |
|---|---|---|
| `asset_pages`, `wo_pages` | `pageKey` (`asset-page-3`) | `{ pageKey, page, pages, total, sort, order, ids: [...], fetched_at }` |
| `asset_records`, `wo_records` | `id` | full record + `_fetched_at` |
| `config` | key | current page per entity, sort, user preferences, last user id, last dashboard and stats responses (for offline display) |
| `drafts` (D10) | `${entity}:${id}` | `{ entity, id, base_version, changes, updated_at }` (`id` = `new` for an unsaved creation form) |
| `sync_queue` (D10) | auto id | `{ op: 'create' \| 'update', entity, record_id, client_id?, base_version, changes, edited_at, attempts, next_try_at, last_error }` |

Pages store row ids only; the rows themselves live in the record stores. This way a record shows the same values in the table and in the detail panel.

A small in-memory `Map` holds the current page's records, so opening a detail panel from the current page doesn't need an IndexedDB read (target < 20 ms).

## Preload and eviction

When page N of an entity is shown (P = number of pages):
1. Keep set K = {1, N−1, N, N+1, P} ∩ [1, P]: at most 5 pages.
2. Prefetch the pages of K not yet cached. One request per page; the rows are stored as records directly (D7).
3. Evict pages not in K. **The current page N is part of K** (the brief's sample code would have evicted it).
4. Evict records that belong to no kept page, unless they have a draft, a queued write, or are open in the detail panel.
5. The page cache is valid for one `sort`/`order` combination. Changing the sort clears that entity's page store.

Prefetching runs after the visible content is rendered, one request at a time, and is skipped while offline.

## Revalidation (stale-while-revalidate)

- Triggers: showing a cached page or record; the window regaining focus (at most every 10 s); the network coming back. A page fetched from the server in the same navigation is not revalidated again.
- Fetch the page (or record), then compare each row's `updated_at` with the local copy, and update only what changed. If `total`/`pages` changed, update the pagination.
- If the record shown in the detail panel changed: show the discreet badge **"Update available"** (an action that reloads the record). If the user has unsaved edits on that record, keep the badge and their edits. The server will detect a conflict when they save, if there is one.
- Rows with `has_conflict = true` get the conflict styling right after revalidation.

## Service worker (D9, D28)

- `frontend/sw.js` precaches the shell (HTML, CSS, JS, `idb`) on install and takes over at once.
- Navigations (any client route) and `/assets/*` files: network first with a 4 s timeout; a successful answer refreshes the cache, a failure or timeout answers from the cache. Navigations are cached under `/index.html`.
- `/api/*` is never handled by the service worker: API data is cached in IndexedDB only.

## Network state

- Offline when `navigator.onLine` is false **or** an API call fails with a network error or times out (5 s). While offline, `GET /api/health` is pinged every 15 s.
- Offline: `<body>` gets `is-offline`, the status bar shows **"Offline mode — local data"**, and every `.ai-only` button is disabled (`disabled` + `aria-disabled`, with a tooltip explaining why).
- Back online: flush the queue, then revalidate the current view.

## Save modes

Both modes write through the same queue (D11). They differ only in what triggers a save.

**Standard mode** (`power_user = false`):
- Editing a field marks the record as dirty. 1 s after the last edit, the changes are saved as a draft in `drafts` (D29).
- **Save** button → enqueue the changes → flush.
- Closing the detail panel, opening another record, or navigating away while dirty → confirmation dialog "Unsaved changes" (Save / Discard / Cancel). Leaving the page uses the browser's `beforeunload` prompt.
- When a record with a draft is opened → banner "Unsaved draft from <date>": Restore / Discard.

**Power-user mode** (`power_user = true`):
- Edits are saved to `drafts` 1 s after the last edit (D29), and immediately when the tab is hidden or closed, so nothing is lost.
- Leaving the detail panel (close, open another record, route change) → the draft is enqueued and flushed automatically.
- At startup, any power-user draft left over (tab closed before leaving the record) is enqueued automatically.

## Work order creation (D15, D26)

- "New work order" opens the creation form in the detail panel (`/work-orders/new`). The fields come from the same field definitions as editing, and the form follows the same save mode as editing: drafts in standard mode, explicit **Create** button in both modes. A creation is never sent automatically on leaving the form, because a half-filled form must not become a real work order.
- On **Create**, the client generates `client_id` (`crypto.randomUUID()`), stores a temporary record in `wo_records` with id `tmp-<client_id>`, adds a `create` entry to the queue, and switches the panel to `/work-orders/tmp-<client_id>`.
- Until the server answers, the work order shows "Pending creation" instead of a number, and pending creations are listed at the top of the work order table. Edits made to it meanwhile are merged into the `create` entry (no `update` is queued for a record that doesn't exist on the server yet).
- When the server answers (`201`, or `200` for a replay): replace the temporary record with the server record, move any open panel to `/work-orders/:id` with `history.replaceState`, and refresh page 1 of the work orders cache.

## Sync queue

- One queue entry per record: new edits to a record not yet sent are merged into its existing entry, keeping the original `base_version`. Edits made while that entry is being sent go into a follow-up entry, which waits for the answer: on success it gets the new version (and the real id after a creation); after a refused creation it is folded into the kept draft.
- Flush: FIFO, one request at a time. Runs on enqueue (if online), on reconnect, at startup, and every 30 s while the queue isn't empty.
- Display: queued edits are shown immediately in the detail panel, marked "Pending sync". The status bar shows the number of pending writes.

| Server response | Client action |
|---|---|
| 200 / 201 | Store the returned `item` as the record (for a `create`, replacing the temporary record, see Work order creation), update its row, delete the queue entry and the draft. |
| 409 conflict (`update` only) | Delete the queue entry, store the server version, mark the record as in conflict, tell the user that a supervisor will arbitrate. |
| 409 locked | Same as conflict. The edits are kept as a draft so they can be re-applied after arbitration. |
| 400 / 403 / 404 / 422 | Delete the queue entry, keep the edits as a draft, show the error in the detail panel. For a `create`, the temporary record stays visible, marked "Creation failed", until the user fixes it and retries or discards it. |
| 401 | Pause the queue, ask the user to log in again, then resume. |
| Network error / 5xx | Keep the entry; retry with backoff (5 s, 15 s, 60 s, then every 5 min). |

## Conflicts

```
client A (v3) ─PUT v3─► server: v3 == v3 → apply, v4
client B (v3) ─PUT v3─► server: v3 != v4 → conflicts row (A = server v4, B = client changes), has_conflict = 1 → 409
supervisor   ─resolve─► apply A | B | MERGE → v5, has_conflict = 0, conflict RESOLVED
```

- Display (accessibility: never color alone): amber row background + ⚠ icon + text badge "Conflict" in the table. Banner and badge in the detail panel.
- Console `/conflicts`: list with the record, the author and timestamp of each version. The detail view shows the two versions side by side, highlights divergent fields (BR-V6) and offers **Accept version A**, **Accept version B**, **Merge manually** (choose the value per divergent field).

## AI readiness (future)

- Buttons that need AI carry the `.ai-only` class and are disabled offline (see Network state).
- The detail panel has a reserved "AI assistant" area, hidden by a feature flag until the endpoints exist.

## Security

- JWT in `localStorage` (8 h expiry). Mitigation against script injection: all values escaped (D12), and a strict Content-Security-Policy set by `helmet` (no inline scripts or styles, `default-src 'self'`).
- `helmet`, `express-rate-limit` on login, JSON body limit 100 kB, prepared statements only (sort columns from a whitelist).
- Same origin in production (Nginx), so no CORS configuration is needed.
- Logout clears the token and IndexedDB (D22). Confidential data must not be added to the mock dataset (brief: no sensitive data in IndexedDB).

## Performance budget

| Measure | Target | How it is checked |
|---|---|---|
| Table → detail panel, data cached | < 20 ms | `performance.mark/measure` around the click → render; logged in dev |
| Initial load | < 2 s | Lighthouse / DevTools on the VPS, cold cache, Fast 4G profile |
| Pages kept in IndexedDB | ≤ 5 per entity | unit test on the keep-set logic + manual check in DevTools |

The frontend has no build step. Chart.js is loaded on demand (script injected the first time the dashboard is shown), not at startup.
