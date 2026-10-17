# AGENTS.md

Instructions for the coding agent implementing this project.

## Reading the docs

The docs are large (`decisions.md` 85 KB, `api-design.md` 61 KB, `data-model.md` 58 KB, `ui-guidelines.md` 48 KB, `architecture.md` 37 KB). **Do not read whole docs.** Find the section the task needs with `grep -n` (a decision `D42`, a rule `BR-W4`, an endpoint, a table, a heading) and read only that part. List a doc's headings with `grep -n '^#' docs/<file>.md`.

| Topic | Where |
|---|---|
| Tables, columns, constraints, enum values | `data-model.md` → Tables, Enumerated values |
| Business rules (`BR-…`), KPI definitions | `data-model.md` → Business rules |
| Endpoint shapes, 409 conflict body, error format | `api-design.md` → the endpoint's heading, Conventions, Shared shapes |
| Who may do what | `api-design.md` → Permission matrix |
| Backend and frontend file layout, request flow | `architecture.md` → Backend layout, Frontend layout |
| Client routes, IndexedDB, sync queue, save modes, offline | `architecture.md` → the matching heading |
| Design tokens, badges, accessibility, page layouts | `ui-guidelines.md` |
| Why something differs from the brief; French → English glossary | `decisions.md` → grep the `D` number or the term |
| Which document prevails when two disagree | `decisions.md` → Reference hierarchy |
| Current phase, open work, backlog | `roadmap.md` (short); done phases in `roadmap-done.md` |
| Feature specs | `spec-preventive-maintenance.md`, `spec-dashboards.md`, `spec-ai-assistant.md`, `spec-locations.md` |

Do not read unless the task is about them: `SPEC_MVP_CMMS.md` (historical brief), `roadmap-done.md`, `test-protocol.md` (manual test protocol), `showcase.md`, `desktop-review.md`, `mobile-review.md`.

If you must deviate from the docs, update them and `docs/decisions.md` (new `D` row) in the same commit and state why.

## Project summary

Tacto: a maintenance management application for a bank's real estate (head offices, branches, data centers), focused on very fast, local-first browsing of assets and work orders, work order creation, staff requests (D46), offline use, concurrent-edit conflicts with supervisor arbitration, and a dashboard.

Stack: Node.js 24 LTS + Express 5 + better-sqlite3 (SQLite) on the backend; HTML + CSS + vanilla JavaScript (ES modules) + IndexedDB (`idb`) + Chart.js on the frontend; Nginx + systemd on a Linux VPS. Keep it simple.

## Priority rules

1. **Data model first.** A new migration implements `docs/data-model.md` fully (constraints included) before any endpoint is written.
2. **API second.** Implement and test each endpoint before the frontend uses it.
3. **Frontend last.** Build UI against the working API; do not mock endpoints that exist.
4. Work phase by phase following `docs/roadmap.md`. Do not start a phase until the previous one meets its acceptance criteria.
5. When in doubt, choose the simpler option. No speculative features, no premature abstraction.

## Non-goals (do not implement)

Frontend frameworks (React, Vue, …), bundlers or any frontend build step, TypeScript, ORMs, PostgreSQL, Docker, microservices, websockets, GraphQL, message queues, multi-tenancy, interface languages other than English and French (D85), deleting work orders or users (D35, D39), AI features beyond the assistant of D66, inventory, file uploads. Status of the specified features: `docs/roadmap.md`.

## Code conventions

### General
- JavaScript ES modules everywhere (`"type": "module"`), `const`/`let`, `async`/`await`. JSDoc types on exported functions.
- **Language (D16)**: everything in English: code, comments, table/column/JSON names, URLs, UI text, docs and commits. Content typed by users is never translated. Enumerated values are stored as `UPPER_SNAKE_CASE` codes; the UI shows labels from `labels.js`.
- Small, pure functions for business rules; thin routes.

### Naming
- Files: `kebab-case.js`. Variables/functions: `camelCase`. Classes: `PascalCase`. Constants: `UPPER_SNAKE_CASE`.
- Database and JSON fields: `snake_case` as in `docs/data-model.md`.
- API paths as in `docs/api-design.md` (`/api/assets`, `/api/work-orders`). UI paths as in `docs/architecture.md` (`/assets`, `/work-orders`).
- CSS: classes `kebab-case`; badge classes `badge-<field>-<slug>`; IDs only for the layout regions named in the brief.

### Backend
- Routes: parse and validate input (zod), check roles, call a service, send the response. No SQL and no business rules in routes.
- Services: SQL with **prepared statements only**; never build SQL from user input (sort columns come from a whitelist). Multi-step writes in `db.transaction(...)`.
- Pure rules in `src/rules/`, unit-tested without a database.
- Errors: throw `HttpError(status, message, details)`; the error handler formats `{ statusCode, error, message, details? }`. Version conflicts use the 409 body of `docs/api-design.md`.
- Never return `password_hash`; select explicit columns.
- Datetimes: ISO 8601 UTC set by the application; "today"/"this month" through the date helper in `APP_TIMEZONE`.

### Frontend
- No global mutable state outside the module that owns it (`auth.js` owns the user, `router.js` the current route, etc.).
- All HTTP goes through `api.js`; all IndexedDB access through `db.js`.
- **Never insert unescaped data into HTML** (D12): use `textContent`, or `escapeHtml` from `dom.js` inside template strings.
- **Every interface text goes through `t()`, `tn()` or `tx()`** (`i18n.js`, D85) with a constant English key, `{name}` placeholders and whole sentences; add the French text to `i18n-fr.js` (`test/i18n.test.js` checks it). Never compare a server message to English text: `api.js` translates it.
- No inline scripts, inline styles or inline event handlers (CSP).
- Third-party libraries are vendored in `assets/vendor/` with their version in the file name or a header comment (D17). No CDN.
- Hide actions the user cannot perform, but never rely on the UI for security.

### Git
- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). One logical change per commit.
- Migrations are never edited once committed; add a new numbered file instead.
- Never commit `.env` or database files.

## Testing

- **Vitest** in both packages; **Supertest** for API tests (fresh migrated and seeded SQLite file per test file, never a mocked database); **jsdom + fake-indexeddb** for frontend modules.
- Required: unit tests on pure rules; per endpoint, success shape, 400, 401/403, 404 and the specific rule codes (409 conflict/locked, 422 rule). Frontend: critical logic only. No snapshot or E2E tests.
- Every bug fix includes a regression test.
- **While iterating, run only the affected test files**: `npx vitest run test/unit/asset-creation.test.js` (backend) or `npx vitest run test/queue.test.js` (frontend), from the package directory. Run the full `npm test` and `npm run lint` in each changed package once, before committing.

## License and security

- Every new source file starts with the two SPDX lines `SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)` and `SPDX-License-Identifier: AGPL-3.0-or-later` in its language's comment syntax (after a shebang or `<!doctype html>`); see an existing file. Keep the `license` field of both `package.json` files and the license notice in the status bar (`frontend/index.html`). New dependencies must be AGPL-compatible (MIT, BSD, Apache-2.0, LGPL, GPL-3.0; check anything else).
- Security baseline (in place, keep it): argon2 hashes, passwords ≥ 10 characters, JWT secret and expiry from env, `helmet` strict CSP, login rate limit, 100 kB JSON limit, same origin and no CORS, logout clears the token and IndexedDB, no real data in the mock dataset.

## Working procedure for each task

1. Find the relevant doc sections (table above) and read only those.
2. State the plan in a few lines.
3. Implement the smallest change that satisfies the acceptance criteria.
4. Run the affected tests, then the full tests and lint before committing.
5. Update docs if behavior or the contract changed. When a phase is done, move it to `docs/roadmap-done.md`.

Definition of done: code, migration (if any), tests passing, lint passing, docs updated, phase acceptance criteria checked.
