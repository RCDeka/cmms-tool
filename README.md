# Small-CMMS

Computerized Maintenance Management System (CMMS) MVP for a bank's real estate: head offices, branches and data centers. It focuses on user experience: very fast browsing of assets and work orders from a local IndexedDB cache, offline use, conflict detection with supervisor arbitration, and a KPI dashboard.

"Small-CMMS" is a working title. This MVP is the first building block of a broader product vision: AI copilot, adaptive interface, IoT, digital twin (see `docs/SPEC_MVP_CMMS.md`).

> **Status:** specifications only. Implementation follows `docs/roadmap-mvp.md`, starting with Phase 0. The commands below become valid once Phase 0 is done.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js 24 LTS, Express 5 |
| Database | SQLite (`better-sqlite3`, WAL mode), plain SQL migrations |
| Frontend | HTML5, CSS3 (Grid), vanilla JavaScript (ES modules), no build step |
| Client storage | IndexedDB (`idb`), service worker for the app shell |
| Charts | Chart.js |
| Auth | Login + password (argon2), JWT (`jsonwebtoken`) |
| Validation | zod (API) |
| Tests | Vitest, Supertest, jsdom, fake-indexeddb |
| Hosting | Linux VPS, Nginx reverse proxy, systemd, Let's Encrypt |

## MVP features

- **Assets and work orders**: paginated tables (50 rows), table + detail split view, search, editing with per-role permissions and work order status workflow.
- **Local-first**: IndexedDB cache with prefetch of adjacent pages, silent revalidation, offline browsing and editing, sync queue.
- **Save modes**: standard (explicit save, drafts every 60 s) and power user (auto-save when leaving a record).
- **Conflicts**: optimistic versioning, accessible conflict indicators, supervisor console with side-by-side arbitration (A / B / merge).
- **Dashboard**: KPI tiles, work orders by category over 30 days, recent activity, "my work today".
- **Roles**: `TECHNICIAN`, `SUPERVISOR`, `ADMIN`.

Out of scope for the MVP: creating/deleting records, user administration, AI features, preventive maintenance, inventory, attachments (see the backlog in `docs/roadmap-mvp.md`).

## Run locally

Prerequisites: Node.js 24 LTS and npm.

```bash
cp .env.example .env                 # then set JWT_SECRET and SEED_PASSWORD
cd backend
npm install
npm run db:reset                     # create the database, migrate and seed mock data
npm run dev                          # API + frontend on http://localhost:3000
```

Mock users (password = `SEED_PASSWORD`): `admin`, `supervisor1`, `supervisor2`, `technician1`, `technician2`.

| URL | |
|---|---|
| http://localhost:3000 | application |
| http://localhost:3000/api/health | API health check |

### Useful commands

```bash
cd backend  && npm test              # backend unit + API tests
cd backend  && npm run lint
cd backend  && npm run db:migrate    # apply new migrations
cd backend  && npm run db:seed -- --with-conflicts   # also create demo conflicts
cd frontend && npm install && npm test               # frontend logic tests
```

### Environment variables (`.env.example`)

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | API port (default 3000) |
| `DATABASE_PATH` | SQLite file path |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | token signing secret and lifetime |
| `APP_TIMEZONE` | timezone for "today" and "this month" in KPIs |
| `SEED_PASSWORD` | password given to every mock user by the seed |

## Deployment

Nginx serves `frontend/` and proxies `/api` to the Node service run by systemd, with HTTPS from Let's Encrypt. Config files and step-by-step instructions are delivered in Phase 7 (`deploy/`).

## Repository structure

```
.
├── README.md
├── AGENTS.md                 rules for the coding agent (CLAUDE.md imports it)
├── docs/
│   ├── SPEC_MVP_CMMS.md      product brief (English translation of the French original)
│   ├── decisions.md          open questions, glossary FR→EN, deviations from the brief
│   ├── data-model.md
│   ├── api-design.md
│   ├── architecture.md       client/server, IndexedDB, sync, offline, conflicts
│   ├── ui-guidelines.md      layout, design tokens, accessibility
│   └── roadmap-mvp.md
├── .env.example
├── backend/
│   ├── src/
│   │   ├── config/           env loading and validation
│   │   ├── db/               connection, migrations/, seed/
│   │   ├── middleware/       auth, roles, validation, errors
│   │   ├── routes/           one router per resource
│   │   ├── services/         SQL and transactions
│   │   ├── rules/            pure business rules
│   │   └── lib/              helpers (dates, pagination)
│   └── test/                 unit/ and api/
├── frontend/
│   ├── index.html            app shell
│   ├── sw.js                 service worker
│   ├── assets/
│   │   ├── css/
│   │   ├── js/
│   │   ├── vendor/           idb, Chart.js
│   │   └── img/              logo, icons
│   └── test/
└── deploy/
    ├── nginx/
    └── systemd/
```

## Documentation

Start with `docs/decisions.md`, then `docs/architecture.md`. Agents implementing the project follow `AGENTS.md`.
