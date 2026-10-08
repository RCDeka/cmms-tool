# MVP Roadmap

Phases are sequential. Each phase has an objective, tasks and acceptance criteria. A phase starts only when the previous one meets its acceptance criteria. Order of work inside the project: data model, then API, then frontend (see `AGENTS.md`).

## Phase 0: Project setup, database, seed

**Objective:** a clean clone runs the API and serves the empty shell with a migrated, seeded SQLite database.

Tasks:
- `backend/package.json` (ES modules, Node 24), ESLint + Prettier, Vitest + Supertest; scripts `dev`, `start`, `test`, `lint`, `db:migrate`, `db:seed`, `db:reset`.
- Config module: load `.env`, validate with zod, fail fast on missing values.
- SQLite connection with pragmas; migration runner; `001_init.sql` with every table, `CHECK`, index and foreign key from `docs/data-model.md`.
- Deterministic seed (5 users, 500 assets, 200 work orders, optional conflicts; 6 users and 207 work orders since Phases 15–16; 62 maintenance plans since Phase 17).
- Express app: `helmet`, JSON limit, error handler, `GET /api/health`, static serving of `frontend/` with SPA fallback.
- `frontend/package.json` (dev tools only: ESLint, Prettier, Vitest, jsdom, fake-indexeddb) and a placeholder `index.html`.

Acceptance: `npm run db:reset && npm run dev` works from a clean clone; `/api/health` returns ok; the database has 5 users, 500 assets and 200 work orders, and every work order follows BR-W4 to BR-W8; inserting an invalid enum value fails on the `CHECK`.

## Phase 1: Authentication and read API

**Objective:** logged-in users can read all business data through the API, with roles enforced.

Tasks:
- `POST /api/auth/login` (argon2, rate limit), `POST /api/auth/logout`, `GET /api/auth/me`; JWT middleware; `requireRole`.
- Read endpoints: assets (list, search, detail), work orders (list, stats, detail with asset), `reference-data`, `users`.
- Pagination and sort whitelist helpers.
- Tests: unit tests (pagination math, sort whitelist); API tests (login ok / wrong password 401 / 429, 401 without token, list shape and `pages`, search filters, 404, `stats` sums equal work order counts in the period, `/users` 403 for a technician).

Acceptance: every read endpoint in `docs/api-design.md` responds with the documented shape; `password_hash` never appears in any response.

## Phase 2: Shell, router, table and detail panel (online)

**Objective:** users log in and browse assets and work orders in the table/detail split view, with no page reloads.

Tasks:
- `index.html`, CSS files (`base`, `layout`, `table`, `detail`, `components`) following `docs/ui-guidelines.md`.
- `api.js`, `auth.js` (login page, token, 401 handling), `router.js` (all routes in `docs/architecture.md`), `entities.js`, `labels.js`, `enums.js`, `dom.js`.
- `table.js`: 50 rows, pagination controls, badges, keyboard navigation, selected row. `detail.js`: generated from the field list, close button, escaping (D12), work order detail showing its asset.
- Responsive behavior < 768 px; sidebar navigation.
- Tests: router URL parsing, `escapeHtml`, badge class naming.

Acceptance: from `/assets?page=3`, clicking a row opens `/assets/:id` in split view; back/forward buttons work; deep links open the right view after a reload; keyboard-only navigation works.

## Phase 3: Local-first (IndexedDB, preload, revalidation, offline)

**Objective:** browsing is instant from IndexedDB and keeps working offline.

Tasks:
- `db.js` (brief API + stores in `docs/architecture.md`), `preload.js` (keep-set, eviction), `sync.js` (stale-while-revalidate, "Update available" badge), in-memory current-page map.
- `network.js`: offline detection, status bar message, `.ai-only` toggling, health ping.
- Service worker: shell precache, SPA fallback offline, network-first strategy (D28).
- Tests (Vitest + fake-indexeddb): keep-set computation (first/last/middle/1-page cases), eviction keeps the current page and protected records, revalidation updates only rows with a newer `updated_at`.

Acceptance: opening a cached record from the table measures < 20 ms; IndexedDB never holds more than 5 pages per entity; with the network cut (DevTools offline), a reload still shows cached pages and records with the offline message.

## Phase 4: Editing, work order creation, save modes and sync queue

**Objective:** users edit records and create work orders safely online and offline, in standard and power-user modes.

Tasks:
- Backend: `PUT` endpoints with field whitelists per role, version check (BR-V1, BR-V2), work order rules (BR-W2 to BR-W8), transactions. `POST /api/work-orders` with number generation, idempotent `client_id` and technician restrictions (BR-W9 to BR-W13). Pure modules `rules/permissions.js`, `rules/work-order-status.js`, `rules/versioning.js`.
- Frontend: editable detail panel (inputs generated from the field definitions and enums), `save-modes.js` (dirty flag, 60 s drafts, unsaved-changes dialog, draft restore; power-user auto-save), `queue.js` (`create` and `update` entries, merge per record, flush, backoff, result handling table). "New work order" button (work order table and asset detail panel), creation form, temporary records and "Pending creation" display (`docs/architecture.md` → Work order creation).
- Tests: unit tests on every transition (allowed and forbidden), permission matrix, version decision; API tests for 200 + version increment, 403 forbidden field, 422 invalid transition, 422 closing without `work_report`; creation: 201 with `WO-YYYY-NNNNN` number, replayed `client_id` returns 200 with the same record, numbering restarts with a new year, technician assigning someone else 403, missing `asset_id` and `site` 400; frontend tests on queue merging (including edits to a pending creation) and response handling.

Acceptance: a technician edits a work order offline, comes back online and the edit is saved with a new version; a supervisor's edits are saved when leaving the record without pressing a button; a reload during unsaved standard-mode edits offers to restore the draft; a technician creates a work order from an asset while offline, it appears as "Pending creation", and after reconnecting it gets its number exactly once, even if the request is retried.

## Phase 5: Conflicts and arbitration

**Objective:** concurrent edits are detected, flagged accessibly and resolved by a supervisor.

Tasks:
- Backend: `GET /api/conflicts`, `GET /api/conflicts/:id`, `PUT .../resolve-conflict` (BR-V5), divergent-field computation (BR-V6). Conflict creation (BR-V3) and the lock (BR-V4) are already done in Phase 4 (D30).
- Frontend: conflict row style + icon + badge, detail panel banner, `/conflicts` list and side-by-side arbitration with A / B / field-by-field merge.
- Tests: unit test of the divergent-field diff; API tests for two clients editing the same version (second gets 409 with both versions), edit on a locked record (409 `locked`), each resolution choice, double resolution (409), technician denied (403).

Acceptance: two browser sessions edit the same asset; the second gets a conflict; the row shows amber + ⚠ + "Conflict"; a supervisor resolves it with a merge, and both sessions show the merged record after revalidation.

## Phase 6: Dashboard

**Objective:** a home page that gives each user an immediate view of activity.

Tasks:
- `GET /api/dashboard` (KPI definitions in `docs/data-model.md`) using pure functions in `rules/kpi.js` where useful; `stats` reused for the chart.
- Frontend: KPI tiles (conflict tile for SUPERVISOR/ADMIN only), horizontal bar chart "Work orders by category — last 30 days" (Chart.js loaded on demand), "Recent activity", "My work today". Tiles link to the matching list.
- Tests: KPI unit tests (month boundaries in `APP_TIMEZONE`, overdue at today's date); one API test on a hand-made dataset that asserts the exact values.

Acceptance: the KPI values equal hand-computed values on the test dataset; a technician doesn't see the conflict tile; the dashboard is readable offline from the last cached data.

## Phase 7: Hardening and deployment

**Status (2026-10-04):** everything that does not need a server is done and verified: accessibility audit (axe-core, 19 views and states: 0 violations; 44 px targets; reflow at 320 px), performance against the budget on a local server (Fast 4G: 1.2–1.5 s), security pass (D31–D32, dependency audit: 0 vulnerabilities), deployment files (Nginx parsed with crossplane, systemd units verified, exposure score 3.0 "OK"), nightly backups (D33), and the README deployment guide, rehearsed on a fresh clone in production mode. **Waiting for a VPS:** HTTPS deployment, `nginx -t` on the real server, and the load-time measure on the VPS.


**Objective:** the MVP runs over HTTPS on the VPS and meets the brief's non-functional requirements.

Tasks:
- Accessibility pass (keyboard, screen reader on the main flows, 44 px targets, contrast); performance measures against the budget in `docs/architecture.md`.
- Security pass: CSP, rate limit, no hash leaks, `.env` only on the server, dependency audit.
- `deploy/nginx/cmms.conf` (static + `/api` proxy + SPA fallback + caching headers), `deploy/systemd/cmms.service`, Let's Encrypt with certbot, daily SQLite backup (`.backup` with WAL-safe copy), deployment steps in `README.md`.
- Close remaining test gaps; README brought up to date.

Acceptance: HTTPS deployment reachable on the VPS; all tests and lint pass; initial load < 2 s on the VPS; a clean clone deploys by following the README alone.

## Post-MVP phases (product owner order, 2026-10-04)

- **Phase 8: create and delete assets** — done (D34–D36). Acceptance: a supervisor creates an asset (automatic or typed code, new site), a duplicate code is refused on its field, an asset created by mistake is deleted, an asset with work orders cannot be deleted and the reason is shown, technicians see neither action, and both actions are disabled offline.
- **Phase 9: work order status history and audit log** — done (D37, BR-L1 to BR-L4). Acceptance: the history of a closed work order tells its status story; a change made in the app appears at the top with its author; supervisors and admins browse the global log with a type filter and pages; technicians have no access to the global log.
- **Phase 10: filters and search on lists; full-text search (SQLite FTS5)** — done (D38). Acceptance: accent-insensitive prefix search, filters combined and kept in the URL (open/close a record, back/forward), "Clear filters", dashboard tiles open the matching list, technicians filter their own work, and a filtered list offline explains that search needs a connection.
- **Phase 11: user administration screen** — done (D39, BR-U3 to BR-U8). Acceptance: an admin lists and searches users, creates one who can then log in, edits role and profile; deactivating a user or resetting their password ends their session at once and the old password or inactive account is refused; the last admin, one's own account and users with unfinished work cannot be deactivated; every user changes their own password and stays logged in; technicians and supervisors have no access; account changes appear in the audit log for admins only.

- **Phase 12: suggestions from any page; Société Générale colors and a new logo** — done (D40, D41). Acceptance: from any page, every user opens "Suggest an improvement", sees the page it refers to, and sends an idea (empty text refused, unsent text kept, Send disabled offline); admins list, filter and triage the ideas and open the page they refer to; `npm run feedback:export` lists the open ideas; the tool uses black, red and white with a maintenance logo, at AA contrast.

- **Phase 13: first round of suggestions (#1, #4, #5, #6)** — done (D42, D43). Acceptance: clicking a column title of the asset or work order table sorts it, a second click reverses it, the arrow shows the order, and the sort is kept with the filters when a record is opened and closed; the page buttons also appear above long tables; supervisors and admins see the status pie with every value listed; technicians see no chart and switch "My work" between Today (default) and the next 7 days.
- **Phase 14: technicians' default list (#3)** — done (D44). Acceptance: a technician opening the work order list sees their own work with "Assigned to me" checked; unchecking shows every work order and survives reload and back; "Clear filters" returns to their own work; a dashboard tile opens the full matching list; their own work is available offline.

- **Phase 15: staff requests (product owner, 2026-10-08)** — done (D46, BR-R1 to BR-R5). Acceptance: a staff member (`user1`) logs in on their open requests, each with its status and next step; "All my requests" shows finished ones too; the request form accepts "I don't know" for the kind of problem and the urgency and requires a typed location; the request appears to the maintenance team as an unassigned corrective work order with its location (searchable); the requester and the team exchange comments, shown on both sides; staff get 403 on every maintenance endpoint and only see their own requests (404 otherwise); the migration keeps existing data and foreign keys.

- **Phase 16: review of staff requests (product owner, 2026-10-08)** — done (D47, BR-R6 to BR-R9). Acceptance: a new request is "Waiting for review" for the requester and counted on the supervisors' and admins' dashboard tile "Staff requests to review" (technicians have no tile); the tile opens the matching list; a request waiting for review can be neither assigned, started nor cancelled by a normal edit; a supervisor approves it only with a technician or supervisor assigned, or rejects it with a reason; the requester then sees "Approved" with the assignee, or "Rejected" with the reason; the count goes down; requests sent before the change are classified by the migration.

## Preventive maintenance phases (D48)

Specified in `docs/spec-preventive-maintenance.md` (section 11 holds the full acceptance criteria).

- **Phase 17: maintenance plans and the read-only year planner** — done (D49, BR-P1 to BR-P9, BR-Y1 to BR-Y4; migration `008`). Acceptance: a supervisor creates a quarterly plan for an asset and sees its 4 visits on the timeline; the load strip shows planned hours vs capacity per trade; four weeks before a visit, exactly one work order exists for it, even if the release runs twice; contractor plans appear without changing the load; a plan visit above 3 h 30 is flagged; supervisors' hours count in the capacity of their trade; when an administrator lowers the reserve from 30 % to 20 %, every week's capacity rises accordingly and the change appears in the audit log; a supervisor cannot change the reserve (403). Deployment adds the daily release timer (`fast-cmms-pm-release.timer`).
- **Phase 18: year planner editing** — done (D51, BR-P2 to BR-P4, BR-P7, BR-P8; migration `009`). Acceptance: dragging the first visit of a plan moves all its future visits; dragging one visit beyond its tolerance is refused with the reason; a regulatory visit cannot move later; the tiles change while dragging; everything can be done with the keyboard (moves, series moves, skip, undo, blocked weeks); undo restores the previous weeks. Also: blocked weeks (warning on the grid and the visits), skip and restore of a visit, "Move to week" and "Move the series" in the plan panel.
- **Phase 19: week scheduler and My week** — done (D52, BR-S1 to BR-S10; migration `010`). Acceptance: a 6 h work order dropped on Monday is proposed as 3 h 30 + 2 h 30; a 2 h work order with a 1 h 30 block is shown with "30 min left"; a day at 8 h 30 shows the overload; two sites in a day are flagged with "Add travel time"; a technician locks a 10:00 appointment, which the supervisor then cannot drag; Saturday appears only once opened; unfinished work appears in the next week's tray marked "carried over"; a technician reads their week offline. Also: travel, preparation and other time, leave and part-time hours per day, helpers on a job, the technician's own order of their day, and the visits due released when the scheduler opens.
- **Phase 20: balancing assistant**: "Suggest a smoother plan" within each plan's rules, shown before acceptance.

## Post-MVP backlog (not scheduled)

1. ~~Create assets; delete records~~ → Phase 8.
2. ~~User administration screen~~ → Phase 11.
3. ~~Work order status history and audit log~~ → Phase 9.
4. ~~Filters and search on lists; full-text search~~ → Phase 10.
5. AI assistant endpoints (`format-report`, `find-work-order`) and the detail panel "AI assistant" area.
6. Staff requests, next steps: notify the maintenance team of new comments (new requests now have their dashboard tile, D47), let a requester cancel their own request, room list instead of the free-text location, photos.
7. Adaptive home tiles, RAG copilot, natural-language work order creation, knowledge graph, IoT-triggered work orders, voice interface, BIM digital twin (product vision in the brief).
