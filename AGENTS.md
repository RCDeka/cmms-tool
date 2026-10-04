# AGENTS.md

Instructions for the coding agent implementing this project.

Before writing code, read `docs/decisions.md` (reference hierarchy and deviations from the brief), then the documents relevant to the task: `docs/data-model.md`, `docs/api-design.md`, `docs/architecture.md`, `docs/ui-guidelines.md`, `docs/roadmap-mvp.md`. The original product brief is `docs/SPEC_MVP_GMAO.md` (French). If you must deviate from these documents, update them and `docs/decisions.md` in the same commit and state why.

## Project summary

Mini-GMAO: a maintenance management MVP for a bank's real estate (head offices, branches, data centers), focused on very fast, local-first browsing of équipements and bons de travaux, offline use, concurrent-edit conflicts with supervisor arbitration, and a dashboard.

Stack: Node.js 24 LTS + Express 5 + better-sqlite3 (SQLite) on the backend; HTML + CSS + vanilla JavaScript (ES modules) + IndexedDB (`idb`) + Chart.js on the frontend; Nginx + systemd on a Linux VPS. Keep it simple.

## Priority rules

1. **Data model first.** The SQL migration must implement `docs/data-model.md` fully (constraints included) before any endpoint is written.
2. **API second.** Implement and test each endpoint before the frontend uses it.
3. **Frontend last.** Build UI against the working API; do not mock endpoints that exist.
4. Work phase by phase following `docs/roadmap-mvp.md`. Do not start a phase until the previous one meets its acceptance criteria.
5. When in doubt, choose the simpler option. No speculative features, no premature abstraction.

## Non-goals (do not implement)

Frontend frameworks (React, Vue, …), bundlers or any frontend build step, TypeScript, ORMs, PostgreSQL, Docker, microservices, websockets, GraphQL, message queues, multi-tenancy, i18n (the UI is French only), record creation/deletion, user administration UI, AI features (only the `.ai-only` mechanism), preventive-maintenance scheduling, inventory, file uploads. See the backlog in `docs/roadmap-mvp.md`.

## Code conventions

### General
- JavaScript ES modules everywhere (`"type": "module"`), `const`/`let`, `async`/`await`. JSDoc types on exported functions.
- ESLint + Prettier are mandatory; code must pass `npm run lint` in each package before commit.
- **Language (D16)**: code identifiers, comments, docs and commits in English. Domain names from the brief stay in French: tables, columns, JSON fields, enum values, URLs, UI text.
- Small, pure functions for business rules; thin routes.

### Naming
- Files: `kebab-case.js`. Variables/functions: `camelCase`. Classes: `PascalCase`. Constants: `UPPER_SNAKE_CASE`.
- Database and JSON fields: `snake_case` as in `docs/data-model.md`.
- API paths as in `docs/api-design.md` (`/api/equipements`, `/api/bons_travaux`). UI paths as in `docs/architecture.md` (`/bons-travaux`).
- CSS: classes `kebab-case`; badge classes `badge-<field>-<slug>`; IDs only for the layout regions named in the brief.

### Backend
- Structure and request flow: see `docs/architecture.md` → Backend layout.
- Routes: parse and validate input (zod), check roles, call a service, send the response. No SQL and no business rules in routes.
- Services: SQL with **prepared statements only**; never build SQL from user input (sort columns come from a whitelist). Multi-step writes in `db.transaction(...)`.
- Pure rules in `src/rules/` (permissions, BT status transitions, versioning decision, conflict diff, KPI), unit-tested without a database.
- Errors: throw `HttpError(status, message, details)`; the error handler formats `{ statusCode, error, message, details? }`. Version conflicts use the brief's 409 body.
- Never return `password_hash`; select explicit columns.
- Datetimes: ISO 8601 UTC set by the application; "today"/"this month" through the date helper in `APP_TIMEZONE`.

### Frontend
- Module layout as in `docs/architecture.md`. No global mutable state outside the module that owns it (`auth.js` owns the user, `router.js` the current route, etc.).
- All HTTP goes through `api.js`; all IndexedDB access through `db.js`.
- **Never insert unescaped data into HTML** (D12): use `textContent`, or `escapeHtml` from `dom.js` inside template strings.
- No inline scripts, inline styles or inline event handlers (CSP).
- Third-party libraries are vendored in `assets/vendor/` with their version in the file name or a header comment (D17). No CDN.
- Hide actions the user cannot perform, but never rely on the UI for security.

### Git
- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). One logical change per commit.
- Migrations are never edited once committed; add a new numbered file instead.
- Never commit `.env` or database files.

## Testing guidelines

- Tool: **Vitest** in both packages; **Supertest** for API tests; **jsdom + fake-indexeddb** for frontend modules.
- **Unit tests (required)** on pure rules: BT status transitions (every allowed and forbidden pair), permission matrix, version decision, conflict diff, KPI math, pagination and keep-set logic.
- **API tests**: each test file gets a fresh SQLite database (temporary file, migrated and seeded with a small fixture). Per endpoint: success shape, 400, 401/403, 404, plus the specific rule codes (409 conflict/locked, 422 rule). Do not mock the database in API tests.
- **Frontend tests**: only critical logic (router parsing, escaping, db/preload/eviction, queue merging and response handling, save-mode decisions). No snapshot tests and no E2E in the MVP.
- Every bug fix includes a regression test.
- Definition of done: code, migration (if any), tests passing, lint passing, docs updated if behavior or contract changed, phase acceptance criteria checked.

## Security baseline

- argon2 password hashes; minimum length 10. JWT secret and expiry from env.
- `helmet` with a strict CSP; rate limit on `POST /api/auth/login`; JSON body limit 100 kB.
- Same-origin deployment behind Nginx with HTTPS (Let's Encrypt). No CORS.
- Logout clears the token and IndexedDB. No real or sensitive data in the mock dataset.

## Working procedure for each task

1. Re-read the relevant sections of the docs.
2. State the plan in a few lines.
3. Implement the smallest change that satisfies the acceptance criteria.
4. Run lint and tests.
5. Update docs if the contract changed.
