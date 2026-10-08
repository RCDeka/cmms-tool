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
  rules/               pure functions: enums, permissions, work-order-status, versioning, conflict diff, kpi,
                       planning (occurrence series, warnings, capacity, weekly figures and tiles)
  lib/                 small helpers (dates in APP_TIMEZONE, ISO weeks, pagination)
```

Request flow: `route → validate → service → rules → SQL`. Errors are thrown as `HttpError(status, message, details)` and formatted by the error handler.

## Frontend layout

```
frontend/
  index.html                  shell: sidebar, status bar, #main-content, #table-container, #detail-container
  sw.js                       service worker (must sit at the root for its scope)
  assets/css/                 base, layout, table, detail, components (brief), planning (year planner)
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
    requests.js               staff pages: open / all requests, request form, request page (D46)
    comments.js               work order conversation (staff request page, work order panel)
    review.js                 review box of a staff request: approve and assign, or reject (D47)
    planning.js               year planner: filters in the URL, tiles, load strip, 52-week grid (D48)
    plan-panel.js             plan panel (the visit clicked, details, next visits) and plan form
    planning-settings.js      planning settings page (administrators) with the capacity preview
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
| `/` | redirect to `/dashboard` (staff: `/requests`) |
| `/login` | login form |
| `/dashboard` | home dashboard |
| `/assets?page=N` | assets table |
| `/assets/:id?page=N` | table page N + asset detail (split view); `page` is optional and keeps the table where the user opened the record |
| `/work-orders?page=N` | work orders table |
| `/work-orders/new` | table + creation form in the detail panel; `?asset_id=N` pre-fills the asset ("New work order" button in an asset's detail panel) |
| `/work-orders/:id` | table + work order detail (`:id` may be a temporary `tmp-<uuid>` id, see Work order creation) |
| `/conflicts` | supervisor console: list of open conflicts (SUPERVISOR, ADMIN) |
| `/conflicts/:id` | side-by-side arbitration |
| `/audit-log?type=…` | global audit log (SUPERVISOR, ADMIN; `users` for ADMIN) |
| `/admin/users?q=…&role=…&active=…` | user administration (ADMIN, online only, D39) |
| `/admin/users/new`, `/admin/users/:id` | list + creation form or user panel (split view) |
| `/account` | change my password (every role) |
| `/admin/feedback?status=…` | suggestions sent with the top bar button (ADMIN, online only, D40) |
| `/requests?page=N` | staff home page: my open requests, with status and next step (STAFF, online only, D46) |
| `/requests/all?page=N` | all my requests (STAFF) |
| `/requests/new` | request form (STAFF) |
| `/requests/:id` | a request: progress, next step, details, history, comments (STAFF; the maintenance team is sent to `/work-orders/:id`) |
| `/planning?from=…\|year=…&group=…&site=…&category=…&type=…&performed_by=…&q=…` | year planner (maintenance roles, online only, D48) |
| `/planning/plans/new`, `/planning/plans/:id?occurrence=N` | planner + plan form or plan panel (split view; `occurrence`: the visit clicked) (creation: SUPERVISOR, ADMIN) |
| `/admin/planning` | planning settings (ADMIN, online only) |

Staff members only reach `/requests…` and `/account`; any other page sends them to `/requests`. The maintenance roles get a short notice on `/requests` and `/requests/new`.

All navigation goes through `router.navigate(url)` → `history.pushState` → render. `popstate` re-renders from the URL. On load, the router parses `location` and shows the matching view. The servers return `index.html` for any non-API path without a file extension (SPA fallback). The static folder `frontend/assets/` shares the `/assets` prefix with the asset routes, so the servers must never redirect a directory path: Express uses `express.static(..., { redirect: false })`, and Nginx must use `try_files $uri /index.html` (without `$uri/`).

## IndexedDB

Database `cmms`, versioned schema (`DB.init` upgrades it).

| Store | Key | Content |
|---|---|---|
| `asset_pages`, `wo_pages` | `pageKey` (`asset-page-3`) | `{ pageKey, page, pages, total, sort, order, scope, ids: [...], fetched_at }` (`scope`: query of the role's plain list, D44) |
| `asset_records`, `wo_records` | `id` | full record + `_fetched_at` |
| `config` | key | current page per entity, user id, form lists (`reference_data`, `assignable_users`), last dashboard and stats responses (`dashboard_cache`, for offline display) |
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
5. Only the plain list is cached: default order (assets by code, work orders newest first) and no filters except the role's default (technicians: their own work orders, D44). Each cached page records that query, so a page saved under another role is ignored. A table sorted from its column titles is fetched from the server like a filtered list (D42).

Prefetching runs after the visible content is rendered, one request at a time, and is skipped while offline.

## Search and filters (D38)

- The filter bar sits above the table; its values live in the URL query (`/assets?status=BROKEN_DOWN`, `/work-orders?q=leak&mine=true`), so they survive reloads and the back button and stay applied when a record is opened and closed. Typing in the search field updates the list 350 ms after the last key and replaces the history entry; other filter changes add one.
- Only **unfiltered** pages are cached in IndexedDB (prefetch, revalidation, offline). A filtered list is always fetched from the server; its records are stored so they open instantly. Offline, a filtered list says that search needs a connection and offers to clear the filters (the cached pages remain available).
- Technicians' default work order list is "Assigned to me" (D44): applied when the URL has no filter; `mine=false` turns it off; "Clear filters" returns to it.
- The table sort lives in the URL too (`/work-orders?sort=due_on&order=asc`, D42); the default order is left out. Filter changes keep the sort, "Clear filters" keeps it, and a new sort goes back to page 1. A sorted list follows the filtered-list rules above: fetched from the server, not cached; offline it offers "Default order".
- Pending creations are listed on the unfiltered work order list only.
- Dashboard tiles open the matching filtered list (e.g. "Overdue work orders" → `/work-orders?overdue=true`).

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

## Staff requests (D46)

- A request is a work order created by a `STAFF` user. Staff pages read `/api/requests` and need a connection: nothing is cached in IndexedDB for them (the request form and unsent comments keep their text while the app is open; the form reuses its `client_id` until the request is sent, so a retry after a lost answer never creates two).
- The status shown to staff is computed by `requestProgress()` in `requests.js`: Waiting for review → Approved (and assigned) → In progress / On hold → Done, or Rejected (with the supervisor's reason) or Cancelled, each with a "next step" sentence naming the technician and the planned date when known.
- Review (D47): a request waiting for review opens in the work order panel with a **review box** on top for supervisors and admins (approve with an assignee, or reject with a reason, `PUT /api/work-orders/:id/review`, online only); technicians see a notice instead. The edit form leaves out status and assignee until the review. The reviewed record is stored in IndexedDB and replaces the row on screen. The dashboard tile "Staff requests to review" opens `/work-orders?to_review=true`.
- The open-request list is fetched again when the window gets the focus back (at most every 10 s), so a staff member coming back to the tab sees the latest status.
- The work order panel of the maintenance team shows the same conversation (`comments.js`, loaded when the panel opens, online only) above the history, with the requester's comments marked.

## Conflicts

```
client A (v3) ─PUT v3─► server: v3 == v3 → apply, v4
client B (v3) ─PUT v3─► server: v3 != v4 → conflicts row (A = server v4, B = client changes), has_conflict = 1 → 409
supervisor   ─resolve─► apply A | B | MERGE → v5, has_conflict = 0, conflict RESOLVED
```

- Display (accessibility: never color alone): amber row background + ⚠ icon + text badge "Conflict" in the table. Banner and badge in the detail panel.
- Console `/conflicts`: list with the record, the author and timestamp of each version. The detail view shows the two versions side by side, highlights divergent fields (BR-V6) and offers **Accept version A**, **Accept version B**, **Merge manually** (choose the value per divergent field).

## Preventive maintenance (D48, D49)

- **Year planner** (`/planning`, Phase 17): reads `GET /api/planning/timeline`, which releases the work orders due first (BR-P6). Online only (P18): nothing is cached in IndexedDB; offline, the page says it needs a connection. The timeline is kept in memory while the user stays on the planner, so opening or closing a plan panel does not fetch it again (a filter change, a save or leaving the planner does). Plans are created and edited in the side panel (`POST`/`PUT /api/plans`), never queued offline.
- **Release job**: `npm run pm:release` (`node src/db/cli.js release`), run daily by `deploy/systemd/fast-cmms-pm-release.timer` (04:00, after the backup).
- **Planned**: `/schedule` (week scheduler, days × technicians) and `/my-week` for technicians (readable offline), Phases 18–20, `docs/spec-preventive-maintenance.md` §7–9.

## AI readiness (future)

- Buttons that need AI carry the `.ai-only` class and are disabled offline (see Network state).
- The detail panel has a reserved "AI assistant" area, hidden by a feature flag until the endpoints exist.

## Security

- JWT in `localStorage` (8 h expiry). Mitigation against script injection: all values escaped (D12), and a strict Content-Security-Policy set by `helmet` (no inline scripts or styles, `default-src 'self'`).
- `helmet`, `express-rate-limit` on login, JSON body limit 100 kB, prepared statements only (sort columns from a whitelist).
- Same origin in production (Nginx), so no CORS configuration is needed.
- The API listens on `127.0.0.1` only (D32); Nginx terminates HTTPS and sets the same security headers on the static shell. API answers are `Cache-Control: no-store`.
- Only the shell is public: `index.html`, `sw.js`, `assets/*` (D31).
- Logout clears the token and IndexedDB (D22). Confidential data must not be added to the mock dataset (brief: no sensitive data in IndexedDB).

## Performance budget

| Measure | Target | How it is checked |
|---|---|---|
| Table → detail panel, data cached | < 20 ms | `performance.mark/measure` around the click → render; logged in dev |
| Initial load | < 2 s | Lighthouse / DevTools on the VPS, cold cache, Fast 4G profile |
| Pages kept in IndexedDB | ≤ 5 per entity | unit test on the keep-set logic + manual check in DevTools |

The frontend has no build step. To keep the first load fast anyway:
- `index.html` lists every module with `<link rel="modulepreload">`, so the browser fetches the whole module graph in parallel instead of level by level (a test checks the list is complete).
- Responses are gzip-compressed (Express, and Nginx in production); the first load transfers about 120 KB (180 KB on the dashboard, Chart.js included).
- Chart.js is loaded on demand (script injected the first time the dashboard is shown), not at startup.

Measured in Phase 7 on a local server, empty cache, logged-in first visit:

| Network profile | Assets table usable | Dashboard usable / chart drawn |
|---|---|---|
| Fast 4G (60 ms, 9 Mbps), the budget's profile | 1.2 s | 1.5 s / 1.6 s |
| Slow 4G (150 ms, 1.6 Mbps), stress test | 2.0 s | 2.1 s / 2.3 s |
| Office network (20 ms, 30 Mbps) | 0.6 s | 0.7 s / 0.7 s |

To be measured again on the VPS (HTTP/2 through Nginx should improve these figures).
