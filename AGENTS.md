# AGENTS.md

Instructions for the coding agent implementing this project.

Before writing code, read `docs/decisions.md` (reference hierarchy and deviations from the brief), then the documents relevant to the task: `docs/data-model.md`, `docs/api-design.md`, `docs/architecture.md`, `docs/ui-guidelines.md`, `docs/roadmap.md`. The product brief is `docs/SPEC_MVP_CMMS.md`. If you must deviate from these documents, update them and `docs/decisions.md` in the same commit and state why.

## Project summary

Tacto: a maintenance management application for a bank's real estate (head offices, branches, data centers), focused on very fast, local-first browsing of assets and work orders, work order creation, staff requests (D46), offline use, concurrent-edit conflicts with supervisor arbitration, and a dashboard.

Stack: Node.js 24 LTS + Express 5 + better-sqlite3 (SQLite) on the backend; HTML + CSS + vanilla JavaScript (ES modules) + IndexedDB (`idb`) + Chart.js on the frontend; Nginx + systemd on a Linux VPS. Keep it simple.

## Priority rules

1. **Data model first.** The SQL migration must implement `docs/data-model.md` fully (constraints included) before any endpoint is written.
2. **API second.** Implement and test each endpoint before the frontend uses it.
3. **Frontend last.** Build UI against the working API; do not mock endpoints that exist.
4. Work phase by phase following `docs/roadmap.md`. Do not start a phase until the previous one meets its acceptance criteria.
5. When in doubt, choose the simpler option. No speculative features, no premature abstraction.

## Non-goals (do not implement)

Frontend frameworks (React, Vue, …), bundlers or any frontend build step, TypeScript, ORMs, PostgreSQL, Docker, microservices, websockets, GraphQL, message queues, multi-tenancy, i18n (the UI is English only), deleting work orders or users (D35, D39), AI features beyond the assistant of D66, inventory, file uploads. Preventive maintenance (D48, `docs/spec-preventive-maintenance.md`) and custom dashboards (D59, `docs/spec-dashboards.md`) are implemented (Phases 17–24). The AI assistant is specified as a draft (D66, `docs/spec-ai-assistant.md`): finding the work order is implemented without a real model yet (Phase 26, D67); the report formatting (Phase 25) and the first provider wait for the provider decision. See the backlog in `docs/roadmap.md`.

## Code conventions

### General
- JavaScript ES modules everywhere (`"type": "module"`), `const`/`let`, `async`/`await`. JSDoc types on exported functions.
- ESLint + Prettier are mandatory; code must pass `npm run lint` in each package before commit.
- **Language (D16)**: everything in English: code, comments, table/column/JSON names, URLs, UI text, docs and commits. Enumerated values are stored as `UPPER_SNAKE_CASE` codes; the UI shows labels from `labels.js`. The French terms of the original brief map to English through the glossary in `docs/decisions.md`.
- Small, pure functions for business rules; thin routes.

### Naming
- Files: `kebab-case.js`. Variables/functions: `camelCase`. Classes: `PascalCase`. Constants: `UPPER_SNAKE_CASE`.
- Database and JSON fields: `snake_case` as in `docs/data-model.md`.
- API paths as in `docs/api-design.md` (`/api/assets`, `/api/work-orders`). UI paths as in `docs/architecture.md` (`/assets`, `/work-orders`).
- CSS: classes `kebab-case`; badge classes `badge-<field>-<slug>`; IDs only for the layout regions named in the brief.

### Backend
- Structure and request flow: see `docs/architecture.md` → Backend layout.
- Routes: parse and validate input (zod), check roles, call a service, send the response. No SQL and no business rules in routes.
- Services: SQL with **prepared statements only**; never build SQL from user input (sort columns come from a whitelist). Multi-step writes in `db.transaction(...)`.
- Pure rules in `src/rules/` (permissions, work order status transitions, versioning decision, conflict diff, KPI), unit-tested without a database.
- Errors: throw `HttpError(status, message, details)`; the error handler formats `{ statusCode, error, message, details? }`. Version conflicts use the 409 body defined in `docs/api-design.md`.
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
- **Unit tests (required)** on pure rules: work order status transitions (every allowed and forbidden pair), permission matrix, version decision, conflict diff, KPI math, pagination and keep-set logic.
- **API tests**: each test file gets a fresh SQLite database (temporary file, migrated and seeded with a small fixture). Per endpoint: success shape, 400, 401/403, 404, plus the specific rule codes (409 conflict/locked, 422 rule). Do not mock the database in API tests.
- **Frontend tests**: only critical logic (router parsing, escaping, db/preload/eviction, queue merging and response handling, save-mode decisions). No snapshot tests and no E2E tests.
- Every bug fix includes a regression test.
- Definition of done: code, migration (if any), tests passing, lint passing, docs updated if behavior or contract changed, phase acceptance criteria checked.

## License

The project is licensed under the GNU AGPL v3 or later (`LICENSE`, D57). Every source file starts with the two SPDX lines `SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)` and `SPDX-License-Identifier: AGPL-3.0-or-later` in the comment syntax of its language (after a shebang or `<!doctype html>`); add them to every new file. Keep the `license` field of both `package.json` files and the license notice in the status bar (`frontend/index.html`). Vendored or new dependencies must be compatible with the AGPL (MIT, BSD, Apache-2.0, LGPL, GPL-3.0 are; check before adding anything else).

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
