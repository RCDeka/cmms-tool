# Data Model

Database: **SQLite** (one file, path from `DATABASE_PATH`), accessed with `better-sqlite3`. Schema changes are plain numbered SQL files in `backend/src/db/migrations/` (`001_init.sql`, `002_...sql`), applied in order by a small runner that records them in `schema_migrations`.

Connection pragmas, set on every open: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL`.

Conventions:
- Primary keys: `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Datetimes (`*_at`): `TEXT`, ISO 8601 UTC with milliseconds (`2026-10-04T08:15:30.123Z`), set by the application. Dates (`*_on`): `TEXT` `YYYY-MM-DD`.
- Booleans: `INTEGER` 0/1 in the database, `true`/`false` in JSON.
- Names are English `snake_case`. Enumerated values are `UPPER_SNAKE_CASE` codes; the UI shows labels (D16).
- Columns added to the brief are marked **(added)** with the decision ID in `docs/decisions.md`.

## Entity overview

```
users 1───* work_orders (assignee_id)
users 1───* work_orders (supervisor_id)
users 1───* assets / work_orders (updated_by)
assets 1───* work_orders (asset_id, optional)
assets / work_orders 1───* conflicts (entity_type + entity_id)
```

## Enumerated values

| Enum | Codes (UI label) |
|---|---|
| Role | `TECHNICIAN` (Technician), `SUPERVISOR` (Supervisor), `ADMIN` (Administrator) |
| Category | `HVAC` (HVAC), `ELECTRICAL` (Electrical), `FIRE_SAFETY` (Fire safety), `PLUMBING` (Plumbing), `NETWORK_CABLING` (Network cabling), `SECURITY` (Security) |
| Criticality | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| Asset status | `IN_SERVICE` (In service), `BROKEN_DOWN` (Broken down), `UNDER_MAINTENANCE` (Under maintenance), `OUT_OF_SERVICE` (Out of service) |
| Work order type | `CORRECTIVE`, `PREVENTIVE`, `IMPROVEMENT`, `REGULATORY` |
| Work order status | `OPEN` (Open), `IN_PROGRESS` (In progress), `ON_HOLD` (On hold), `CLOSED` (Closed), `CANCELLED` (Cancelled) |
| Work order priority | `LOW`, `NORMAL`, `HIGH`, `URGENT` |
| Conflict status | `OPEN`, `RESOLVED` |
| Conflict resolution | `A`, `B`, `MERGE` |

- Terminal work order statuses: `CLOSED`, `CANCELLED`. Non-terminal: `OPEN`, `IN_PROGRESS`, `ON_HOLD`.
- `FIRE_SAFETY` is the fire detection and alarm system; `NETWORK_CABLING` covers voice, data and video cabling.
- The values are defined once per side: `backend/src/rules/enums.js` and `frontend/assets/js/enums.js` (labels in `frontend/assets/js/labels.js`). Both must match this table.
- In the database, every enumerated column has a `CHECK (col IN (...))` constraint (D6).

## Tables

### users
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| last_name | TEXT | no | | |
| first_name | TEXT | no | | |
| username | TEXT | no | UNIQUE (stored lowercase) | |
| password_hash | TEXT | no | | argon2 **(added, D1)** |
| role | TEXT | no | CHECK Role | |
| site | TEXT | yes | | |
| specialty | TEXT | yes | CHECK Category | |
| power_user | INTEGER | no | default 0 | enables auto-save mode (D21) |
| created_at / updated_at | TEXT | no | default now | **(added)** |

### assets
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| code | TEXT | no | UNIQUE | e.g. `AST-0001`; immutable |
| name | TEXT | no | | e.g. "Fan coil unit, floor 3" |
| site | TEXT | no | | |
| building | TEXT | yes | | |
| floor | TEXT | yes | | e.g. `L3` |
| category | TEXT | no | CHECK Category | |
| subcategory | TEXT | yes | | |
| criticality | TEXT | no | CHECK Criticality | |
| status | TEXT | no | CHECK Asset status | |
| brand | TEXT | yes | | |
| model | TEXT | yes | | |
| serial_number | TEXT | yes | | |
| commissioned_on | TEXT | yes | | date |
| last_serviced_on | TEXT | yes | | date |
| supplier | TEXT | yes | | |
| maintenance_contract | INTEGER | no | default 0 | boolean |
| responsible_technician | TEXT | yes | | free text (D5) |
| exact_location | TEXT | yes | | |
| comment | TEXT | yes | | |
| version | INTEGER | no | default 1 | optimistic concurrency **(added, D2)** |
| has_conflict | INTEGER | no | default 0 | 1 while a conflict is open **(added, D2)** |
| updated_by | INTEGER | yes | FK → users.id | last writer **(added, D2)** |
| created_at / updated_at | TEXT | no | default now | |

Indexes: `code` (unique), `site`, `category`, `status`, `updated_at`.

### work_orders
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| number | TEXT | no | UNIQUE | e.g. `WO-2026-00001`; immutable |
| type | TEXT | no | CHECK Work order type | |
| status | TEXT | no | CHECK Work order status | |
| priority | TEXT | no | CHECK Work order priority | |
| title | TEXT | no | | |
| description | TEXT | yes | | |
| asset_id | INTEGER | yes | FK → assets.id | optional (brief) |
| site | TEXT | no | | equals the asset's site when `asset_id` is set |
| category | TEXT | yes | CHECK Category | technical trade |
| assignee_id | INTEGER | yes | FK → users.id | (D5) |
| supervisor_id | INTEGER | yes | FK → users.id | (D5) |
| created_on | TEXT | no | | date |
| due_on | TEXT | yes | | date |
| started_on | TEXT | yes | | date |
| closed_on | TEXT | yes | | date |
| estimated_hours | REAL | yes | CHECK ≥ 0 | |
| actual_hours | REAL | yes | CHECK ≥ 0 | |
| work_report | TEXT | yes | | |
| version | INTEGER | no | default 1 | |
| has_conflict | INTEGER | no | default 0 | |
| updated_by | INTEGER | yes | FK → users.id | **(added, D2)** |
| created_at / updated_at | TEXT | no | default now | |

Indexes: `number` (unique), `status`, `asset_id`, `assignee_id`, `created_on`, `updated_at`.

### conflicts (added, D3)
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| entity_type | TEXT | no | CHECK IN (`assets`, `work_orders`) | |
| entity_id | INTEGER | no | | id in the entity table |
| base_version | INTEGER | no | | version the client edited from |
| server_version | INTEGER | no | | version in the database when the conflict occurred |
| server_snapshot | TEXT | no | | JSON of the server record at that time ("version A") |
| client_changes | TEXT | no | | JSON of the fields the client tried to change ("version B") |
| server_updated_by | INTEGER | yes | FK → users.id | author of version A |
| server_updated_at | TEXT | no | | timestamp of version A |
| client_user_id | INTEGER | no | FK → users.id | author of version B |
| client_edited_at | TEXT | no | | when the client made the edit (may be earlier than the submission if it was queued offline) |
| status | TEXT | no | CHECK Conflict status, default `OPEN` | |
| resolution | TEXT | yes | CHECK Conflict resolution | |
| resolved_by | INTEGER | yes | FK → users.id | |
| resolved_at | TEXT | yes | | |
| created_at | TEXT | no | default now | |

Indexes: unique partial index on (`entity_type`, `entity_id`) `WHERE status = 'OPEN'` (at most one open conflict per record, D4); `status`.

### schema_migrations
| Column | Type | Notes |
|---|---|---|
| name | TEXT PK | migration file name |
| applied_at | TEXT | |

## Business rules

### Users and authentication
- BR-U1: `username` is unique and case-insensitive (stored lowercase).
- BR-U2: Passwords are hashed with argon2; minimum length 10.
- BR-U3: Users are created by the seed only in the MVP (no user management screen; see backlog).

### Versioning and conflicts (both entities)
- BR-V1: Every update request carries the `version` the client edited from. A missing `version` is rejected (400).
- BR-V2: If the request's `version` equals the stored `version`: apply the changes, `version = version + 1`, set `updated_at` and `updated_by`, in one transaction.
- BR-V3: If it differs: in one transaction, insert a `conflicts` row (version A = current server record, version B = client changes), set the entity's `has_conflict = 1` and its `updated_at` (but not `version`), and answer 409.
- BR-V4: While `has_conflict = 1`, every regular update is rejected with 409 and `locked: true` (D4).
- BR-V5: Resolution (supervisor or admin only) applies version A, version B, or a merged set of fields. Then `version = version + 1`, `has_conflict = 0`, and the `conflicts` row is marked `RESOLVED` with `resolution`, `resolved_by` and `resolved_at`, all in one transaction.
- BR-V6: The fields shown as "divergent" in arbitration are those in `client_changes` whose value differs from `server_snapshot`.

### Assets
- BR-A1: `code` is unique and immutable.
- BR-A2: Fields editable per role are listed in `docs/api-design.md` (permission matrix).

### Work orders
- BR-W1: `number` is unique and immutable; format `WO-YYYY-NNNNN`.
- BR-W2: If `asset_id` is set, it must reference an existing asset, and `site` takes the asset's site.
- BR-W3: `assignee_id` must reference a user with role `TECHNICIAN` or `SUPERVISOR`.
- BR-W4: Allowed status transitions (any other is rejected with 422):

| From | To |
|---|---|
| OPEN | IN_PROGRESS, CANCELLED |
| IN_PROGRESS | ON_HOLD, CLOSED, CANCELLED |
| ON_HOLD | IN_PROGRESS, CANCELLED |
| CLOSED | (terminal) |
| CANCELLED | (terminal) |

- BR-W5: Entering `IN_PROGRESS` for the first time sets `started_on` to today if it is empty.
- BR-W6: Entering `CLOSED` requires a non-empty `work_report` (already stored or sent in the same request) and sets `closed_on` to today if empty.
- BR-W7: Terminal work orders are read-only (except for conflict resolution).
- BR-W8: `due_on`, if set, is not earlier than `created_on`. `closed_on`, if set, is not earlier than `started_on`.

### KPI definitions (dashboard)
"Today" and "this month" use `APP_TIMEZONE` (D13).
- Open work orders: `status = 'OPEN'`. In progress: `status = 'IN_PROGRESS'`.
- Closed this month: `status = 'CLOSED'` and `closed_on` in the current calendar month.
- Assets broken down: `assets.status = 'BROKEN_DOWN'`.
- Overdue work orders: non-terminal and `due_on < today`.
- Pending conflicts: `conflicts.status = 'OPEN'` (only for supervisors and admins).
- Work orders by category / status / type (`stats?period=N`): work orders with `created_on` within the last N days. Work orders without `category` are counted under `UNSPECIFIED`.
- Recent activity: the 5 work orders with the most recent `updated_at`.
- My work today: non-terminal work orders with `assignee_id` = current user and (`due_on` ≤ today or empty), sorted by priority (`URGENT` first) then `due_on`.

## Seed data (mock)

Generated by `backend/src/db/seed/` with a fixed random seed (the output is the same on every run). All names are fictional (Q5).

- **5 sites**: Paris La Défense Headquarters, Saclay Data Center, Lyon Part-Dieu Branch, Marseille Prado Branch, Lille Grand Place Branch. Each has buildings, floors and exact locations.
- **5 users**: 1 `ADMIN`, 2 `SUPERVISOR`, 2 `TECHNICIAN`. Usernames: `admin`, `supervisor1`, `supervisor2`, `technician1`, `technician2`. The password is `SEED_PASSWORD` for all of them. `power_user = 1` for the admin and supervisors.
- **500 assets**, spread across all sites and categories, with realistic subcategories, brands and models per category (e.g. HVAC → air handling unit, fan coil unit, chiller). About 3–5 % are `BROKEN_DOWN`.
- **200 work orders**: `created_on` spread over the last 30 days, every status, type and priority represented, about 90 % linked to an asset. Dates and fields follow BR-W4 to BR-W8 (e.g. closed work orders have a `work_report` and a `closed_on`), and some are overdue.
- **0 conflicts** by default. A dev-only option (`npm run db:seed -- --with-conflicts`) creates 3 open conflicts to demonstrate the arbitration console.
