# Mini-CMMS

Web-based Computerized Maintenance Management System (CMMS) for internal use. It manages assets, maintenance work orders, and users with roles, and exposes a basic KPI dashboard.

This is an MVP: single tenant, single database, no background workers, no external integrations.

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js 20 LTS, NestJS, TypeScript (strict) |
| ORM / migrations | Prisma |
| Database | PostgreSQL 16 |
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query |
| Auth | Email + password (argon2 hash), JWT access token (Bearer) |
| Validation | class-validator / class-transformer (API), zod (frontend forms) |
| Tests | Jest + Supertest (API), Vitest (frontend, minimal) |
| Deployment | Docker, Docker Compose |

## MVP Features

- **Authentication**: login with email + password; JWT; `GET /auth/me`.
- **Roles**: `ADMIN`, `MANAGER`, `TECHNICIAN`, enforced server-side with guards.
- **Users** (admin): create, list, update, deactivate; role assignment.
- **Assets**: CRUD with category, location, status, manufacturer/model/serial number; soft delete.
- **Locations and categories**: simple reference data (hierarchical locations).
- **Work orders**: create, assign, update, status workflow, full status history, filters and pagination.
- **Dashboard**: open/closed counts, overdue count, MTTR, workload per technician.

Out of scope for the MVP: preventive maintenance scheduling, spare parts and inventory, file attachments, notifications, SSO, multi-tenancy, offline mobile app.

## Run Locally

Prerequisites: Docker and Docker Compose v2.

```bash
cp .env.example .env        # adjust secrets
docker compose up --build
```

On first start the backend container runs `prisma migrate deploy` and the seed script (creates an admin user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| API docs (Swagger) | http://localhost:3000/api/docs |
| PostgreSQL | localhost:5432 |

### Environment variables (`.env.example`)

```
POSTGRES_USER=cmms
POSTGRES_PASSWORD=change-me
POSTGRES_DB=cmms
DATABASE_URL=postgresql://cmms:change-me@db:5432/cmms
JWT_SECRET=change-me-long-random-string
JWT_EXPIRES_IN=8h
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me-now
CORS_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:3000/api/v1
```

### Useful commands

```bash
docker compose exec backend npx prisma migrate dev --name <name>   # create a migration
docker compose exec backend npm test                               # backend tests
docker compose exec frontend npm test                              # frontend tests
docker compose down -v                                             # stop and wipe DB volume
```

## Repository Structure

```
.
├── README.md
├── AGENTS.md
├── docs/
│   ├── data-model.md
│   ├── api-design.md
│   └── roadmap-mvp.md
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/          # guards, decorators, filters, pagination DTOs
│   │   ├── prisma/          # PrismaModule / PrismaService
│   │   ├── auth/
│   │   ├── users/
│   │   ├── locations/
│   │   ├── asset-categories/
│   │   ├── assets/
│   │   ├── work-orders/
│   │   └── dashboard/
│   └── test/                # e2e / API tests
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── app/             # router, providers, layout
        ├── api/             # typed API client + query hooks
        ├── features/
        │   ├── auth/
        │   ├── assets/
        │   ├── locations/
        │   ├── asset-categories/
        │   ├── work-orders/
        │   ├── users/
        │   └── dashboard/
        ├── components/      # shared UI components
        └── lib/             # utils, constants
```
