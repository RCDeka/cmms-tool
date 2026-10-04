# MVP Roadmap

Phases are sequential. Each phase lists a one-sentence objective, tasks, and acceptance criteria. Follow the priority order in `AGENTS.md`: data model, then API, then frontend.

## Phase 0: Project Setup, Database, Migrations

**Objective:** Provide a running monorepo skeleton where `docker compose up` starts PostgreSQL, the backend, and the frontend with the complete schema migrated and seeded.

Tasks:
- Create `backend/` (NestJS, TypeScript strict, ESLint/Prettier, Jest) and `frontend/` (Vite React TS, ESLint/Prettier, Vitest).
- Write Dockerfiles and `docker-compose.yml` (services: `db`, `backend`, `frontend`; healthcheck on `db`; named volume).
- Add `.env.example`, config module with env validation, `GET /health`.
- Write the full `schema.prisma` from `docs/data-model.md` (all enums, tables, indexes, constraints).
- Generate the initial migration; write `seed.ts` (admin user, categories, root location).
- Set up the global ValidationPipe, exception filter, Swagger.

Acceptance: `docker compose up --build` works from a clean clone; `/health` returns ok; DB contains all tables and the seeded admin.

## Phase 1: Authentication and Roles

**Objective:** Let users log in with email and password and enforce ADMIN / MANAGER / TECHNICIAN permissions on every route.

Tasks:
- Users module: create, list, get, update (deactivate), `assignable`; argon2 hashing; last-admin and open-work-order rules.
- Auth module: `login`, `me`, `change-password`; JWT strategy that re-checks `isActive`; throttling on login.
- Global `JwtAuthGuard`, `@Public()`, `RolesGuard`, `@Roles()`, `@CurrentUser()`.
- Frontend: login page, auth provider (token in memory + localStorage), API client with 401 handling, protected routes, app layout with role-aware navigation, users admin page.
- Tests: unit tests on role/permission logic and last-admin rule; API tests for login success/failure and 403 on admin routes.

Acceptance: seeded admin can log in, create a technician, and the technician is denied on `/users`.

## Phase 2: Asset CRUD

**Objective:** Allow managers to maintain the asset register with categories and locations through API and UI.

Tasks:
- Locations and asset-categories modules (CRUD with referential rules BR-A5, cycle check).
- Assets module: CRUD, filters, search, pagination, soft delete, uniqueness of `code`.
- Frontend: assets list (filters, pagination), asset create/edit form, asset detail page (placeholder for work-order history), simple locations/categories management.
- Tests: unit tests for deletion guards; API tests for create/list/update/delete and duplicate `code` (409).

Acceptance: a manager creates an asset with category and location, filters the list, and soft-deletes it; a technician has read-only access.

## Phase 3: Work Order CRUD and Status Workflow

**Objective:** Implement work order creation, assignment, and a validated status workflow with a complete audit history.

Tasks:
- Pure module `work-order-status.rules.ts` (transition table, required comment/notes rules) with exhaustive unit tests.
- Work-orders module: create (asset and assignee mandatory), list with filters, get, patch, `POST /:id/status`, `GET /:id/history`; transactions for status change + history row; `startedAt` / `completedAt` handling.
- Permission rules: technician restricted to own orders' status changes and `resolutionNotes`.
- `GET /assets/:id/work-orders`.
- Frontend: work-orders list (status/priority/assignee filters, "mine" toggle), create form, detail page with status action buttons showing only valid transitions, history timeline, asset detail work-order tab.
- Tests: API tests for creation validation (missing asset/assignee → 400), valid and invalid transitions (409), technician permission (403), terminal-order immutability.

Acceptance: a full lifecycle OPEN → IN_PROGRESS → ON_HOLD → IN_PROGRESS → COMPLETED works with the history recorded; illegal transitions are rejected.

## Phase 4: Dashboard and KPIs

**Objective:** Provide managers with accurate KPIs on work-order volume, repair time, and technician workload.

Tasks:
- `kpi.calculator.ts` pure functions (MTTR, counts, period handling) with unit tests including empty-period and boundary cases.
- Dashboard module: `/dashboard/kpis`, `/workload`, `/my-workload`, `/work-orders-trend` using aggregate queries (Prisma `groupBy` or `$queryRaw` for the trend).
- Frontend: dashboard page with KPI cards, workload table/bar chart, trend chart (one lightweight chart library), date range selector (default 30 days); technician sees "my workload" view only.
- Tests: unit tests on KPI math; one API test seeding known orders and asserting exact KPI values.

Acceptance: KPI values match hand-computed numbers on a seeded dataset; technician cannot access manager-level dashboard endpoints.

## Phase 5: Tests and Polish

**Objective:** Make the MVP reliable and releasable by closing test gaps, hardening behavior, and finalizing documentation.

Tasks:
- Fill test gaps against the guidelines in `AGENTS.md`; add a CI-ready `npm test` script for both packages.
- Review indexes against real query patterns; verify pagination limits and sort whitelists.
- Frontend: loading, empty, and error states; form error display; responsive layout check.
- Security pass: CORS, rate limiting, no password hash leakage, secrets only from env.
- Add production-oriented Docker settings (multi-stage builds, non-root user, `prisma migrate deploy` on start).
- Update `README.md` and docs to match the final behavior; add a short demo seed script (optional) with sample assets and work orders.

Acceptance: all tests and lint pass; clean-clone run works from README instructions; no TODOs left in the critical path.

## Post-MVP Backlog (not scheduled)

Preventive maintenance schedules, comments and attachments, e-mail notifications, CSV import/export of assets, audit log for non-work-order entities, spare parts, SSO.
