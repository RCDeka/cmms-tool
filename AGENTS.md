# AGENTS.md

Instructions for the coding agent implementing this project. Read `docs/data-model.md`, `docs/api-design.md` and `docs/roadmap-mvp.md` before writing code. These documents are the source of truth; if you must deviate, update the document in the same commit and state why.

## Project Summary

Internal CMMS MVP: assets, work orders, users/roles, KPI dashboard. Stack: NestJS + Prisma + PostgreSQL, React + TypeScript (Vite), Docker Compose. Keep it simple.

## Priority Rules

1. **Data model first.** Prisma schema and migrations must be complete and reviewed before any endpoint is written.
2. **API second.** Implement and test each backend module before the frontend consumes it.
3. **Frontend last.** Build UI against the already working API; do not mock endpoints that exist.
4. Work phase by phase following `docs/roadmap-mvp.md`. Do not start a phase until the previous one passes its acceptance criteria.
5. When in doubt, choose the simpler option. No speculative features, no premature abstraction.

## Non-Goals (do not implement)

Microservices, message queues, caching layers, GraphQL, multi-tenancy, preventive-maintenance scheduling, inventory, file uploads, websockets, i18n, refresh-token rotation.

## Code Conventions

### General
- TypeScript `strict: true` everywhere. No `any` unless justified in a comment.
- ESLint + Prettier are mandatory; code must pass `npm run lint` before commit.
- Language: code, comments, commits, docs in English.
- Prefer small, pure functions for business rules; keep controllers thin.

### Naming
- Files: `kebab-case` with Nest suffixes (`work-orders.service.ts`, `create-work-order.dto.ts`).
- Classes/types/enums: `PascalCase`. Variables/functions: `camelCase`. Enum values and constants: `UPPER_SNAKE_CASE`.
- Database: Prisma models `PascalCase` singular; DB tables mapped with `@@map("snake_case_plural")`; columns mapped with `@map("snake_case")`.
- REST paths: plural, kebab-case nouns (`/work-orders`). JSON fields: `camelCase`.
- React components: `PascalCase` files (`WorkOrderTable.tsx`); hooks: `useXxx`.

### Backend organization
- One Nest module per resource under `src/<resource>/`, containing: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, and `*.spec.ts`.
- Controllers: routing, DTO validation, auth decorators only. No Prisma calls, no business rules.
- Services: business rules and Prisma access. Throw Nest HTTP exceptions (`NotFoundException`, `ConflictException`, `BadRequestException`, `ForbiddenException`).
- Business rules that are pure (status transition table, KPI computations) live in dedicated files (`work-order-status.rules.ts`, `kpi.calculator.ts`) so they can be unit tested without a database.
- DTOs use `class-validator`; global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- Never return `passwordHash`. Use explicit Prisma `select` or response mappers.
- Authorization: global `JwtAuthGuard` + `RolesGuard`; routes are protected by default, public routes use `@Public()`; role restrictions use `@Roles(...)`.
- Errors: uniform body `{ "statusCode", "error", "message", "details?" }` via a global exception filter.
- List endpoints: pagination via `page` (default 1) and `pageSize` (default 20, max 100); response `{ data, meta: { page, pageSize, total } }`.
- Multi-step writes (e.g. status change + history row) use `prisma.$transaction`.
- Timestamps stored as UTC (`timestamptz`); API uses ISO 8601.

### Frontend organization
- Feature-based folders under `src/features/<feature>/` (components, hooks, pages, types).
- All HTTP goes through `src/api/client.ts`; server state via TanStack Query; no global state library.
- Forms: controlled components with zod validation mirroring backend rules.
- Route guards by role; hide UI actions the user cannot perform, but never rely on the UI for security.
- Types for API payloads defined in `src/api/types.ts`, kept consistent with `docs/api-design.md`.

### Git
- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). One logical change per commit.
- Migrations are committed, never edited after being merged; add a new one instead.

## Testing Guidelines

- **Unit tests (required)** on business logic: status transition rules, assignment rules, KPI calculations (MTTR, workload), permission checks. Pure functions, no DB, fast.
- **API tests (lightweight)** with Jest + Supertest against a test PostgreSQL database (Docker Compose service or `DATABASE_URL_TEST`), reset between suites. Cover per resource: happy path create/read/update, one validation failure (400), one auth failure (401/403), one not-found (404). For work orders also cover an invalid status transition (409).
- Do not mock Prisma in API tests; mock it only in isolated service unit tests when useful.
- Frontend: test only critical logic (form validation, role-based route guard). No snapshot tests, no E2E in the MVP.
- Every bug fix includes a regression test.
- Definition of done for a task: code, migration (if any), tests passing, lint passing, docs updated if behavior changed.

## Security Baseline

- Hash passwords with argon2; minimum length 10.
- JWT secret from env; never commit `.env`.
- Rate limiting on `POST /auth/login` (`@nestjs/throttler`).
- CORS restricted to `CORS_ORIGIN`.
- Deactivated users (`isActive=false`) cannot log in and existing tokens are rejected (check on each request in the JWT strategy).

## Working Procedure for Each Task

1. Re-read the relevant sections of the docs.
2. State the plan in a few lines.
3. Implement the smallest change that satisfies the acceptance criteria.
4. Run lint and tests.
5. Update docs if the contract changed.
