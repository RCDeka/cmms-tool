# MVP Roadmap

Phases are sequential. Each phase has an objective, tasks and acceptance criteria. A phase starts only when the previous one meets its acceptance criteria. Order of work inside the project: data model, then API, then frontend (see `AGENTS.md`).

## Phase 0: Project setup, database, seed

**Objective:** a clean clone runs the API and serves the empty shell with a migrated, seeded SQLite database.

Tasks:
- `backend/package.json` (ES modules, Node 24), ESLint + Prettier, Vitest + Supertest; scripts `dev`, `start`, `test`, `lint`, `db:migrate`, `db:seed`, `db:reset`.
- Config module: load `.env`, validate with zod, fail fast on missing values.
- SQLite connection with pragmas; migration runner; `001_init.sql` with every table, `CHECK`, index and foreign key from `docs/data-model.md`.
- Deterministic seed (5 users, 500 équipements, 200 BT, optional conflicts).
- Express app: `helmet`, JSON limit, error handler, `GET /api/health`, static serving of `frontend/` with SPA fallback.
- `frontend/package.json` (dev tools only: ESLint, Prettier, Vitest, jsdom, fake-indexeddb) and a placeholder `index.html`.

Acceptance: `npm run db:reset && npm run dev` works from a clean clone; `/api/health` returns ok; the database has 5 users, 500 équipements and 200 BT, and every BT follows BR-B4 to BR-B8; inserting an invalid enum value fails on the `CHECK`.

## Phase 1: Authentication and read API

**Objective:** logged-in users can read all business data through the API, with roles enforced.

Tasks:
- `POST /api/auth/login` (argon2, rate limit), `POST /api/auth/logout`, `GET /api/auth/me`; JWT middleware; `requireRole`.
- Read endpoints: équipements (list, search, detail), BT (list, stats, detail with équipement), `referentiels`, `users`.
- Pagination and sort whitelist helpers.
- Tests: unit tests (pagination math, sort whitelist); API tests (login ok / wrong password 401 / 429, 401 without token, list shape and `pages`, search filters, 404, `stats` sums equal BT counts in the period, `/users` 403 for operateur).

Acceptance: every read endpoint in `docs/api-design.md` responds with the documented shape; `password_hash` never appears in any response.

## Phase 2: Shell, router, table and fiche (online)

**Objective:** users log in and browse équipements and BT in the table/fiche split view, with no page reloads.

Tasks:
- `index.html`, CSS files (`base`, `layout`, `table`, `fiche`, `components`) following `docs/ui-guidelines.md`.
- `api.js`, `auth.js` (login page, token, 401 handling), `router.js` (all routes in `docs/architecture.md`), `entities.js`, `labels.js`, `enums.js`, `dom.js`.
- `table.js`: 50 rows, pagination controls, badges, keyboard navigation, selected row. `fiche.js`: generated from the field list, close button, escaping (D12), BT fiche showing its équipement.
- Responsive behavior < 768 px; sidebar navigation.
- Tests: router URL parsing, `escapeHtml`, badge class naming.

Acceptance: from `/equipements?page=3`, clicking a row opens `/equipements/:id` in split view; back/forward buttons work; deep links open the right view after a reload; keyboard-only navigation works.

## Phase 3: Local-first (IndexedDB, preload, revalidation, offline)

**Objective:** browsing is instant from IndexedDB and keeps working offline.

Tasks:
- `db.js` (brief API + stores in `docs/architecture.md`), `preload.js` (keep-set, eviction), `sync.js` (stale-while-revalidate, "Mise à jour disponible" badge), in-memory current-page map.
- `network.js`: offline detection, status bar message, `.ai-only` toggling, health ping.
- Service worker: shell precache, SPA fallback offline, update notice.
- Tests (Vitest + fake-indexeddb): keep-set computation (first/last/middle/1-page cases), eviction keeps the current page and protected fiches, revalidation updates only rows with a newer `updated_at`.

Acceptance: a cached table → fiche opening measures < 20 ms; IndexedDB never holds more than 5 pages per entity; with the network cut (DevTools offline), a reload still shows cached pages and fiches with the offline message.

## Phase 4: Editing, save modes and sync queue

**Objective:** users edit fiches safely online and offline, in standard and power-user modes.

Tasks:
- Backend: `PUT` endpoints with field whitelists per role, version check (BR-V1, BR-V2), BT rules (BR-B2 to BR-B8), transactions. Pure modules `rules/permissions.js`, `rules/bt-status.js`, `rules/versioning.js`.
- Frontend: editable fiche (inputs generated from the field definitions and enums), `save-modes.js` (dirty flag, 60 s drafts, unsaved-changes dialog, draft restore; power-user auto-save), `queue.js` (merge per record, flush, backoff, result handling table).
- Tests: unit tests on every transition (allowed and forbidden), permission matrix, version decision; API tests for 200 + version increment, 403 forbidden field, 422 invalid transition, 422 closing without `compte_rendu`; frontend tests on queue merging and response handling.

Acceptance: an operator edits a BT offline, comes back online and the edit is saved with a new version; a supervisor's edits are saved when leaving the fiche without pressing a button; a reload during unsaved standard-mode edits offers to restore the draft.

## Phase 5: Conflicts and arbitration

**Objective:** concurrent edits are detected, flagged accessibly and resolved by a supervisor.

Tasks:
- Backend: conflict creation (BR-V3), lock (BR-V4), `GET /api/conflits`, `GET /api/conflits/:id`, `PUT .../resolve-conflict` (BR-V5), divergent-field computation (BR-V6).
- Frontend: conflict row style + icon + badge, fiche banner, `/conflits` list and side-by-side arbitration with A / B / field-by-field merge.
- Tests: unit test of the divergent-field diff; API tests for two clients editing the same version (second gets 409 with both versions), edit on a locked record (409 `locked`), each resolution choice, double resolution (409), operateur denied (403).

Acceptance: two browser sessions edit the same équipement; the second gets a conflict; the row shows amber + ⚠ + "Conflit"; a supervisor resolves it with a merge, and both sessions show the merged record after revalidation.

## Phase 6: Dashboard

**Objective:** a home page that gives each user an immediate view of activity.

Tasks:
- `GET /api/dashboard` (KPI definitions in `docs/data-model.md`) using pure functions in `rules/kpi.js` where useful; `stats` reused for the chart.
- Frontend: KPI tiles (conflict tile for superviseur/admin only), horizontal bar chart "BT par domaine technique — 30 derniers jours" (Chart.js loaded on demand), "Dernières activités", "Mes interventions du jour". Tiles link to the matching list.
- Tests: KPI unit tests (month boundaries in `APP_TIMEZONE`, overdue at today's date); one API test on a hand-made dataset that asserts the exact values.

Acceptance: the KPI values equal hand-computed values on the test dataset; an operator doesn't see the conflict tile; the dashboard is readable offline from the last cached data.

## Phase 7: Hardening and deployment

**Objective:** the MVP runs over HTTPS on the VPS and meets the brief's non-functional requirements.

Tasks:
- Accessibility pass (keyboard, screen reader on the main flows, 44 px targets, contrast); performance measures against the budget in `docs/architecture.md`.
- Security pass: CSP, rate limit, no hash leaks, `.env` only on the server, dependency audit.
- `deploy/nginx/gmao.conf` (static + `/api` proxy + SPA fallback + caching headers), `deploy/systemd/gmao.service`, Let's Encrypt with certbot, daily SQLite backup (`.backup` with WAL-safe copy), deployment steps in `README.md`.
- Close remaining test gaps; README brought up to date.

Acceptance: HTTPS deployment reachable on the VPS; all tests and lint pass; initial load < 2 s on the VPS; a clean clone deploys by following the README alone.

## Post-MVP backlog (not scheduled)

1. Create and delete équipements and BT (D15), with `numero` generation.
2. User administration screen.
3. BT status history and audit log.
4. Filters and search on BT lists; full-text search (SQLite FTS5).
5. AI assistant endpoints (`cr-format`, `find-bt`) and the fiche "Assistant IA" area.
6. Adaptive home tiles, RAG copilot, natural-language BT creation, knowledge graph, IoT-triggered BT, voice interface, BIM digital twin (product vision in the brief).
