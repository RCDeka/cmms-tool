# API Design

Base path: `/api`. Format: JSON (UTF-8). Auth: `Authorization: Bearer <jwt>` on every endpoint except `POST /api/auth/login` and `GET /api/health`.

Endpoints from the product brief keep their behavior, with English paths (D18). Endpoints marked **(added)** are listed in decision D8.

## Conventions

- IDs: integers. Datetimes: ISO 8601 UTC. Dates: `YYYY-MM-DD`. Booleans: `true`/`false`. Enumerated values: codes from `docs/data-model.md`.
- JSON field names are the database column names (`snake_case`).
- Pagination (brief): `page` (default 1), `size` (default 50, max 100). Response: `{ "total", "page", "pages", "items": [...] }`. `pages` is at least 1, so an empty list reads "page 1 of 1". A `page` above `pages` returns an empty `items` array.
- Sorting: `sort` (whitelisted column, see each endpoint) and `order` (`asc`|`desc`). Any other value → 400. Enumerated columns (priority, criticality, status) sort in business order (e.g. `LOW` < `NORMAL` < `HIGH` < `URGENT`), not alphabetically. Ties are broken by `id` in the same direction, so pages stay stable.
- List items are **complete records**, identical to the `GET /:id` response (D7).
- Error body (all errors except version conflicts): `{ "statusCode": number, "error": string, "message": string, "details"?: object }`. `details` holds per-field validation errors or the violated business rule (e.g. `{ "rule": "BR-W4" }`).
- Status codes: `400` invalid input, `401` missing/invalid/expired token, `403` role or field not allowed, `404` not found, `409` version conflict or record locked by a conflict, `422` business rule violated (status transition, required field, invalid reference), `429` rate limit.
- Unknown body fields **and unknown query parameters** are rejected (400), which catches typos such as `pagesize`. The input is validated with zod. Route ids must be plain positive integers (400 otherwise).
- Without a valid token, every `/api` path except the public ones answers 401, including paths that don't exist, so the API doesn't reveal its routes.

## Permission matrix (D23)

| Action | STAFF | TECHNICIAN | SUPERVISOR | ADMIN |
|---|---|---|---|---|
| Read assets, work orders, dashboard, record history | no (403) | yes | yes | yes |
| Read reference data (`GET /reference-data`) | yes | yes | yes | yes |
| `/requests` (own requests: list, create, read, comment; D46) | yes | no | no | no |
| `GET/POST /work-orders/:id/comments` | no | yes | yes | yes |
| `PUT /work-orders/:id/review` (approve and assign, or reject a staff request; D47) | no | no | yes | yes |
| `PUT /assets/:id` | no | only `status`, `comment`, `last_serviced_on` | all editable fields | all editable fields |
| `POST /assets`, `DELETE /assets/:id` | no | no | yes | yes |
| `POST /work-orders` (create) | no | yes, assigned to themselves only (BR-W12) | yes | yes |
| `PUT /work-orders/:id` | no | only work orders assigned to them; only `status`, `started_on`, `actual_hours`, `work_report` | all editable fields | all editable fields |
| `GET /users` | no | no | yes | yes |
| `GET /audit-log` | no | no | yes, without user accounts | yes |
| `/admin/users` (user administration) | no | no | no | yes |
| `POST /auth/change-password` (own password) | yes | yes | yes | yes |
| `POST /feedback` (suggest an improvement) | yes | yes | yes | yes |
| `GET /feedback`, `PUT /feedback/:id` | no | no | no | yes |
| Conflict console and resolution | no | no | yes | yes |
| Read plans, the year planner and the planning settings (D48) | no | yes | yes | yes |
| `POST /plans`, `PUT /plans/:id`, `PUT /plans/:id/anchor`, `POST /planning/release` | no | no | yes | yes |
| Move, skip, restore a visit (`/plan-occurrences/:id…`); add or remove blocked weeks | no | no | yes | yes |
| `PUT /planning/settings` (reserve, daily capacity, release horizon, longest block) | no | no | no | yes |
| Read the week schedule (`GET /schedule`) and their own week (`GET /my-week`) (D52) | no | yes | yes | yes |
| Allocate, move, resize, remove blocks; capacity of a day; open weekends | no | no | yes | yes |
| Lock or unlock an appointment (`PUT /schedule/allocations/:id/lock`) | no | own blocks | yes | yes |
| Order a day (`PUT /schedule/day-order`) | no | own day | yes | yes |

Staff members are refused every path under `/api/assets`, `/api/work-orders`, `/api/conflicts`, `/api/dashboard`, `/api/audit-log`, `/api/plans`, `/api/plan-occurrences`, `/api/planning`, `/api/schedule` and `/api/my-week` (403), whatever the method (D46).

Editable fields:
- **Assets**: every column except `id`, `code`, `version`, `has_conflict`, `updated_by`, `created_at`, `updated_at`.
- **Work orders**: every column except `id`, `number`, `client_id`, `created_on`, `created_by`, `version`, `has_conflict`, `updated_by`, `created_at`, `updated_at`.

Sending a field the role may not edit → 403 with `details.fields`.

## Shared shapes

```
User        { id, last_name, first_name, username, role, site, specialty, power_user, is_active }
UserRef     { id, last_name, first_name }
Asset       { id, code, name, site, building, floor, category, subcategory, criticality,
              status, brand, model, serial_number, commissioned_on, last_serviced_on,
              supplier, maintenance_contract, responsible_technician, exact_location,
              comment, version, has_conflict, updated_by: UserRef|null,
              created_at, updated_at }
WorkOrder   { id, number, type, status, priority, title, description,
              asset_id, asset: { id, code, name, site, status } | null,
              site, location, category,
              assignee_id, assignee: UserRef|null,
              supervisor_id, supervisor: UserRef|null,
              created_on, due_on, started_on, closed_on,
              estimated_hours, actual_hours, work_report,
              client_id, created_by: UserRef,
              review_status, reviewed_by: UserRef|null, reviewed_at, review_note,
              plan_id, plan: { id, code, title } | null, planned_week,
              version, has_conflict, updated_by: UserRef|null, created_at, updated_at }
Page<T>     { total, page, pages, items: T[] }
Request     { id, number, status, priority, title, description, site, location, category,
              created_on, due_on, started_on, closed_on, work_report, client_id,
              review_status, review_note, reviewed_at, assignee: UserRef|null, comment_count, last_comment_at, created_at, updated_at }
Comment     { id, work_order_id, body, user: UserRef, user_role, created_at }
Plan        { id, code, title, description, type, category, asset_id,
              asset: { id, code, name } | null, site, building, location, estimated_hours,
              frequency_weeks, anchor_week, end_week, schedule_mode, tolerance_weeks,
              season_from_week, season_to_week, performed_by, supplier, is_active, version,
              created_by: UserRef, updated_by: UserRef|null, created_at, updated_at,
              next_week, warnings: ['LONG_VISIT']? }
Occurrence  { id, due_week, week, status, skip_reason,
              work_order: { id, number, status } | null, moved_at, version,
              warnings: ('OUT_OF_SEASON' | 'BLOCKED_WEEK')[] }
              (GET /plan-occurrences/:id adds plan_id and moved_by: UserRef|null)
BlockedWeek { id, week, site | null, reason, created_by: UserRef, created_at }
Block       { id, kind, work_order_id, technician_id, day, hours, locked_start, locked_by: UserRef|null,
              position, note, version, updated_at,
              work_order: { id, number, title, site, building, location, status, priority,
                            category, type, estimated_hours, assignee_id } | null }
ScheduleDay { day, capacity, total, override: { hours, reason, note } | null, sites: string[],
              warnings: ('OVER_CAPACITY' | 'ABSENT' | 'WEEKEND_CLOSED' | 'SEVERAL_SITES')[] }
TrayItem    { id, number, title, type, status, priority, category, site, building, location, due_on,
              planned_week, plan_id, group: 'PLANNED' | 'CARRIED_OVER' | 'NOT_PLANNED', carried_from,
              estimated_hours, needed_hours, scheduled_hours, week_hours, hours_left,
              assignee: UserRef|null, version }
```

`password_hash` is never returned.

---

## Health (added)

### GET /api/health
- Public. `200 { "status": "ok", "time": "<ISO>" }`. The client also uses it to check whether the server can be reached.

## Authentication

### POST /api/auth/login
- Public, rate limited: 10 attempts per 15 min per IP, successful ones included. Rate-limit headers follow the IETF draft (`RateLimit-Policy`, `RateLimit`).
- Body: `{ "username": string, "password": string }`
- `200 { "token": string, "expires_in": number, "user": { id, last_name, first_name, role, power_user } }`
- Username is case-insensitive and trimmed (BR-U1).
- Errors: 400; 401 invalid credentials (same message for an unknown user and a wrong password); 429.

### POST /api/auth/logout
- `204`. JWTs are stateless: the server keeps no session, and the client deletes its token and local data (D22).

### GET /api/auth/me (added)
- `200 User`. Errors: 401.

Every authenticated request also answers 401 when the account was deactivated (BR-U7) or the token was issued before the last password change (BR-U8).

### POST /api/auth/change-password (added, D39)
- Every role. Body: `{ "current_password": string, "new_password": string }` (new password: at least 10 characters).
- `200 { "token": string, "expires_in": number }`: a new token for this session; earlier tokens stop working (BR-U8).
- Errors: 400 invalid body, or wrong current password (`details.fields.current_password`; 400, not 401, so the user stays logged in).

## Assets

### Search and filters (D38)
- `q`: full-text search (SQLite FTS5). Each word is a required prefix (`chil lyon` finds records containing a word starting with "chil" **and** one starting with "lyon"), case and accents are ignored (`defense` finds "Défense"), search syntax typed by users is treated as plain words. A `q` without any letter or digit matches nothing. Max 100 characters.
- Indexed text: assets → code, name, site, building, subcategory, brand, model, serial number, supplier, exact location, comment; work orders → number, title, description, site, work report, location. Database triggers keep the indexes in sync.
- Every enum filter, `site` and `assignee_id` take one value or several (D45): `status=OPEN,ON_HOLD`, `assignee_id=4,5`. Values of one filter are alternatives (OR); different filters combine with `q` and each other (AND). `site` values are separated by `|` instead of `,` because site names can contain commas. An invalid value, or more than 50 values, → 400.
- Filters combine with `q`, with each other (AND), with `sort` and with pagination: `total` and `pages` count the matching records.

### GET /api/assets
- Query: `page`, `size`, `sort` (`code`|`name`|`site`|`category`|`criticality`|`status`|`updated_at`, default `code`), `order` (default `asc`), and the filters `q?`, `site?`, `category?`, `status?`, `criticality?` (several values allowed).
- `200 Page<Asset>`

### GET /api/assets/search
- Query: the asset filters (`q?`, `site?`, `category?`, `status?`, `criticality?`), `limit` (default 50, max 200).
- `200 { "items": Asset[], "total": number }` (`total` = number of matches before `limit`), ordered by `code`.
- Declared before `/:id` in the router.

### GET /api/assets/:id
- `200 Asset`. Errors: 404.

### POST /api/assets (added, D34)
- Roles: SUPERVISOR, ADMIN. Online only in the interface.
- Body: `{ "code"?: string, "name": string, "site": string, "category": Category, "criticality": Criticality, "status"?: AssetStatus, ...any other editable asset field }` (BR-A4). Unknown or server-set fields (`id`, `version`, …) → 400.
- `201 { "created": true, "item": Asset }`
- Errors: 400; 403; 409 code already used (`details: { rule: "BR-A1", fields: { code } }`).

### DELETE /api/assets/:id?version=N (added, D35)
- Roles: SUPERVISOR, ADMIN. `version` (required) is the version the user saw.
- `204`. Errors: 400 missing `version`; 403; 404; 409 with `details.rule`: `BR-V1` (changed since), `BR-V4` (open conflict) or `BR-A3` (the asset has work orders: set it Out of service instead).

### PUT /api/assets/:id
- Body: `{ ...changed fields..., "version": number, "edited_at"?: ISO }`. `edited_at` is when the user made the edit (used for queued offline edits); it defaults to now.
- Checks, in this order: unknown field → 400; read-only field (`code`, `id`, timestamps, nested objects of the GET shape, …) or field the role may not edit → 403 with `details.fields`; missing `version`, no field to change, or invalid value → 400; record locked → 409; version mismatch → 409; business rule → 422.
- Blank text in an optional field is stored as `null`.
- `200 { "updated": true, "version": N+1, "item": Asset }`
- `409` version mismatch (BR-V3). The conflict is stored, and `server_version` is the record as now stored (`has_conflict: true`):
  ```
  { "conflict": true, "conflict_id": 12,
    "server_version": { ...Asset as stored... },
    "client_version": { ...fields sent by the client..., "version": N } }
  ```
- `409` record locked (BR-V4): `{ "conflict": true, "locked": true, "conflict_id": 12 }`
- Errors: 400; 403; 404; 422.

### PUT /api/assets/:id/resolve-conflict
- Roles: SUPERVISOR, ADMIN.
- Body: `{ "conflict_id": number, "choice": "A" | "B" | "MERGE", "fields"?: { ... } }`. `fields` is required for `MERGE`: the chosen value of fields of version B (other fields are refused with 400; fields left out keep version A). Values equal to the current record are not treated as changes.
- Version B or merged values go through the same business rules as a normal update: for work orders, a version B that is no longer valid on top of version A (e.g. closing an order that version A put on hold) is refused with 422 and the conflict stays open.
- `200 { "resolved": true, "version": N+1, "item": Asset }`
- Errors: 400; 403; 404 conflict or record not found; 409 conflict already resolved; 422 merged values break a rule.

## Work orders

### GET /api/work-orders
- Query: `page`, `size`, `sort` (`number`|`title`|`site`|`assignee`|`created_on`|`due_on`|`priority`|`status`|`updated_at`, default `created_on`), `order` (default `desc`), and the filters:
  - `q?` (full text), `status?`, `priority?`, `type?`, `category?`, `site?`, `assignee_id?` (each one value or several, e.g. `status=OPEN,IN_PROGRESS,ON_HOLD`);
  - `to_review?=true`: staff requests waiting for a review (`review_status = PENDING`, D47);
  - `mine?=true`: assigned to the current user (`false` = no filter; the client writes it to turn off technicians' default, D44); `overdue?=true`: same definition as the dashboard KPI (non-terminal, `due_on` before today in `APP_TIMEZONE`).
- `sort=assignee` orders by the assignee's displayed name (first then last name). For `assignee` and `due_on`, empty values (unassigned, no due date) come last in both orders (D42).
- `200 Page<WorkOrder>`. Errors: 400 for an unknown status or flag value.

### GET /api/work-orders/stats
- Query: `period` (days, default 30, max 365). Counts work orders whose `created_on` falls in the last `period` days, today included.
- `200`:
  ```
  { "period": 30,
    "by_category": [{ "category": "HVAC", "count": 42 }, ...],
    "by_status":   [{ "status": "OPEN", "count": 18 }, ...],
    "by_type":     [{ "type": "CORRECTIVE", "count": 120 }, ...] }
  ```
- Every enum value is listed in enum order, with zero counts included, so a chart always has the same bars. `UNSPECIFIED` is added at the end of `by_category` only when some work orders have no category.
- Declared before `/:id` in the router.

### POST /api/work-orders
- Roles: TECHNICIAN, SUPERVISOR, ADMIN (rules BR-W9 to BR-W13). Staff members use `POST /api/requests`.
- Body: `{ "client_id": uuid, "title": string, "type": WorkOrderType, "priority"?: WorkOrderPriority, "description"?: string, "asset_id"?: number, "site"?: string, "location"?: string, "category"?: Category, "assignee_id"?: number, "supervisor_id"?: number, "due_on"?: date, "estimated_hours"?: number, "edited_at"?: ISO }`. `asset_id` or `site` is required.
- `201 { "created": true, "item": WorkOrder }`
- `200 { "created": false, "item": WorkOrder }` when `client_id` was already used (replay, BR-W11).
- Errors: 400 invalid body or missing `client_id`/`title`/`type`/`asset_id`+`site`; 403 technician assigning someone else; 422 rule violated: unknown asset or site different from the asset's (BR-W2), assignee or supervisor not eligible (BR-W3), `due_on` before `created_on` (BR-W8), `edited_at` out of range (BR-W9).

### GET /api/work-orders/:id
- `200 WorkOrder` (with the linked asset). Errors: 404.

### PUT /api/work-orders/:id
- Same contract as `PUT /api/assets/:id`, plus the work order rules BR-W2 to BR-W8 (422 on violation).

### PUT /api/work-orders/:id/resolve-conflict
- Same contract as for assets.

### PUT /api/work-orders/:id/review (added, D47)
- Roles: SUPERVISOR, ADMIN. Rules BR-R6 to BR-R9. Online only in the interface.
- Approve: `{ "decision": "APPROVE", "version": number, "assignee_id": number, "supervisor_id"?: number | null, "type"?: WorkOrderType, "priority"?: WorkOrderPriority, "category"?: Category | null, "due_on"?: date | null }`. `supervisor_id` defaults to the reviewer.
- Reject: `{ "decision": "REJECT", "version": number, "reason": string (1–2000) }`. The work order becomes `CANCELLED`.
- `200 { "reviewed": true, "version": N+1, "item": WorkOrder }`.
- Errors: 400 invalid body (missing `assignee_id` or `reason`, unknown field); 403; 404; 409 already reviewed (`BR-R6`), changed since (`BR-V1`) or open conflict (`BR-V4`); 422 not a staff request (`BR-R6`), assignee or supervisor not eligible (`BR-W3`), due date before creation (`BR-W8`).
- `review_status`, `reviewed_by`, `reviewed_at` and `review_note` are read-only in `PUT /api/work-orders/:id` (403), as are `plan_id`, `plan` and `planned_week` (set by the release, D48, or by the first block of the week scheduler, D52).
- A plan's visit follows its work order: cancelling it skips the occurrence (BR-P7), closing it restarts a floating plan (BR-P5). While a request is `PENDING`, that `PUT` refuses `status` and `assignee_id` changes (422 `BR-R7`).

### GET /api/work-orders/:id/comments, POST /api/work-orders/:id/comments (added, D46)
- Roles: TECHNICIAN, SUPERVISOR, ADMIN, on any work order.
- `GET` → `200 { "items": [Comment] }`, oldest first.
- `POST` body: `{ "body": string }` (1–2000 characters, trimmed) → `201 { "created": true, "item": Comment }`. The work order itself is not changed (no new version).
- Errors: 400; 403 (staff); 404 work order not found.

## Staff requests (added, D46)

All routes: role STAFF (403 otherwise). A request is a work order the user created (BR-R1 to BR-R5 in `docs/data-model.md`); the maintenance team sees it under `/api/work-orders`.

### GET /api/requests
- Query: `page`, `size` (max 100), `scope` (`open` = `OPEN`, `IN_PROGRESS`, `ON_HOLD`, default; `all`).
- `200 Page<Request>`: the user's requests, newest first.

### POST /api/requests
- Body: `{ "client_id": uuid, "title": string, "site": string, "location": string, "description"?: string, "category"?: Category | null, "priority"?: WorkOrderPriority, "edited_at"?: ISO }`. Leaving out `category` or `priority` is the form's "I don't know".
- `201 { "created": true, "item": Request }`; `200 { "created": false, "item": Request }` when the `client_id` was already used (BR-W11).
- The work order gets `type = CORRECTIVE`, `status = OPEN`, `review_status = PENDING` (D47), no assignee, supervisor or asset.
- Errors: 400 invalid body (missing `title`, `site` or `location`; any other field such as `type`, `assignee_id` or `asset_id` is unknown); 403; 409 `client_id` used by someone else's work order; 422 `edited_at` out of range (BR-W9).

### GET /api/requests/:id
- `200 { ...Request, "status_history": [{ "status", "at" }], "comments": [Comment] }`. `status_history` lists the creation (`OPEN`), the review (`APPROVED` or `REJECTED`) and each status change, oldest first (BR-R5).
- Errors: 400 malformed id; 404 not found **or created by someone else**.

### POST /api/requests/:id/comments
- Body: `{ "body": string }` (1–2000 characters). `201 { "created": true, "item": Comment }`.
- Errors: 400; 404 not found or someone else's.

## Conflicts (added)

### GET /api/conflicts
- Roles: SUPERVISOR, ADMIN. Query: `status` (default `OPEN`).
- `200`:
  ```
  { "items": [{ "id", "entity_type", "entity_id", "label": "AST-0123 — Fan coil unit, floor 3",
                "server_updated_at", "server_updated_by": UserRef,
                "client_edited_at", "client_user": UserRef, "created_at" }] }
  ```

### GET /api/conflicts/:id
- Roles: SUPERVISOR, ADMIN.
- `200 { ...list item..., "base_version", "server_version", "version_a": { ...editable fields of the server record when the conflict happened... }, "version_b": { ...client changes... }, "current": { ...current record... }, "divergent_fields": ["status", "comment"] }`
- List items also carry `status`, `resolution`, `resolved_by` and `resolved_at` (null while open). Errors: 403 for technicians, 404.

## History and audit log (added, D37)

### GET /api/assets/:id/history, GET /api/work-orders/:id/history
- Roles: TECHNICIAN, SUPERVISOR, ADMIN (whoever can read the record).
- `200 { "items": [AuditEntry], "people": { "<id>": UserRef } }`, newest first. `people` names the users referenced in the changes (`assignee_id`, `supervisor_id`), so every role sees names instead of ids.
- The history of a deleted asset stays readable. Errors: 400 malformed id; 404 when the record never existed.

```
AuditEntry { id, entity_type, entity_id, action, changes: { field: { from, to } }, note,
             label, user: UserRef | null, version, at }
```

### GET /api/audit-log
- Roles: SUPERVISOR, ADMIN. Query: `page`, `size` (max 100), `entity_type?` (`assets` | `work_orders` | `users` | `maintenance_plans` | `plan_occurrences` | `allocations` | `planning_settings`).
- Changes to user accounts (`users`) are for administrators: supervisors don't get them in the list, and asking for `entity_type=users` answers 403 (D39). Password entries carry only `note: { password_reset: true }` or `{ password_changed: true }`.
- `200 { total, page, pages, items: [AuditEntry], people }`, newest first. Errors: 400; 403.

## Reference data and users (added)

### GET /api/reference-data
- `200 { "sites": string[], "categories": [...], "criticalities": [...], "asset_statuses": [...], "work_order_types": [...], "work_order_statuses": [...], "work_order_priorities": [...] }`. `sites` comes from the data; the other lists are the enum codes.

### GET /api/users
- Roles: SUPERVISOR, ADMIN. Returns the users that can be assigned to a work order (for dropdowns).
- `200 [{ id, last_name, first_name, role, site, specialty }]` (active users only).

## Suggestions (added, D40)

### POST /api/feedback
- Every role. Rate limited: 30 per hour per user (429).
- Body: `{ "message": string (1–2000, trimmed), "page_path": string ("/…", ≤ 500), "page_title": string (≤ 200), "viewport_width"?: integer | null }`.
- `201 { "created": true, "item": Feedback }`. Errors: 400; 401; 429.

### GET /api/feedback
- ADMIN. Query: `page`, `size` (max 100), `status?` (`NEW` | `PLANNED` | `DONE` | `DECLINED`), `role?`.
- `200 { total, page, pages, items: [Feedback] }`, newest first.

### PUT /api/feedback/:id
- ADMIN. Body: `{ "status": FeedbackStatus }`. `200 { "updated": true, "item": Feedback }`. Errors: 400; 404.

```
Feedback    { id, message, page_path, page_title, viewport_width, user: UserRef, user_role,
              status, created_at, updated_at }
```

## User administration (added, D39)

All routes: role ADMIN (403 otherwise). Rules BR-U1 to BR-U8 in `docs/data-model.md`.

### GET /api/admin/users
- Query: `page`, `size` (max 100), `q?` (part of the username, first or last name), `role?`, `is_active?` (`true` | `false`).
- `200 { total, page, pages, items: [User] }`: active users first, then by name.

### POST /api/admin/users
- Body: `{ username, password, first_name, last_name, role, site?, specialty?, power_user? }`. `username`: 3 to 50 of `a-z 0-9 . _ -`, stored lowercase. `power_user` defaults to `true` for supervisors and admins, `false` for technicians.
- `201 { "created": true, "item": User }`. Errors: 400; 409 username taken (`details.fields.username`).

### GET /api/admin/users/:id
- `200 User`. Errors: 404.

### PUT /api/admin/users/:id
- Body: any of `first_name`, `last_name`, `role`, `site`, `specialty`, `power_user`, `is_active` (the username cannot change: unknown field, 400).
- `200 { "updated": boolean, "item": User }` (`updated: false` when nothing changed). Errors: 400; 404; 409 with `details.rule` `BR-U4` (last active admin), `BR-U5` (unfinished work orders), `BR-U6` (own account).

### POST /api/admin/users/:id/password
- Body: `{ "password": string }` (at least 10 characters). `204`; the user's sessions end (BR-U8). Errors: 400; 404.

## Dashboard (added)

### GET /api/dashboard
- Maintenance roles (staff: 403).
- `200`:
  ```
  { "today": "2026-10-04", "generated_at": "2026-10-04T12:00:00.000Z",
    "kpis": { "open_work_orders": 18, "in_progress_work_orders": 25,
              "closed_this_month": 40, "assets_broken_down": 21,
              "overdue_work_orders": 9, "pending_conflicts": 2,
              "requests_to_review": 1 },
    "week_end": "2026-10-10",
    "recent_activity": [WorkOrder x5],
    "my_work_today": [WorkOrder],
    "my_work_week": [WorkOrder] }
  ```
- `pending_conflicts` and `requests_to_review` (staff requests waiting for a review, D47) are present for SUPERVISOR and ADMIN only. Definitions: `docs/data-model.md` → KPI definitions.
- `today` is the date in `APP_TIMEZONE` used for the figures. `my_work_today` and `my_work_week` are sorted by priority (URGENT first), then due date (undated last), then number. `my_work_week` covers the next 7 days, today included, up to `week_end` (D43).
- The charts use `GET /api/work-orders/stats?period=30` (`by_category` and `by_status`).

## Maintenance plans and the year planner (added, D48, D49)

Maintenance roles (staff: 403). Rules BR-P1 to BR-P9 and BR-Y1 to BR-Y4 in `docs/data-model.md`. Weeks are ISO weeks `YYYY-Www`; a week that does not exist (`2027-W53`) → 400. The week scheduler and My week are below (Phase 19); the balancing assistant (Phase 20) is specified in `docs/spec-preventive-maintenance.md` §6.

### GET /api/plans
- Query: `page`, `size`, `sort` (`code`|`title`|`site`|`category`, default `code`), `order` (default `asc`), and the filters `q?` (each word in the code, title, site, building, location or supplier), `site?` (`|`-separated), `building?` (`|`), `category?`, `type?` (`PREVENTIVE`|`REGULATORY`), `performed_by?` (`INTERNAL`|`CONTRACTOR`), `active?` (`true`|`false`; all when left out).
- `200 Page<Plan>`; `next_week` is the first visit from the current week on (skipped ones excluded).

### POST /api/plans
- Roles: SUPERVISOR, ADMIN.
- Body: `{ "title", "type", "estimated_hours", "frequency_weeks", "anchor_week", "asset_id"?, "site"?, "building"?, "category"?, "location"?, "description"?, "end_week"?, "schedule_mode"?, "tolerance_weeks"?, "season_from_week"?, "season_to_week"?, "performed_by"?, "supplier"? }`. `asset_id` or `site` is required; `category` is required without an asset (it defaults to the asset's); `tolerance_weeks` defaults to `min(8, floor(frequency_weeks / 4))`.
- `201 { "created": true, "item": Plan + { occurrences: Occurrence[] } }`: the code is automatic (`PM-0063`) and the visits are stored up to the horizon (BR-P1). `occurrences` lists the next 8 visits from the current week.
- Errors: 400 (unknown field, `estimated_hours` not in half hours, end before the anchor, half a season, contractor without `supplier`, neither asset nor site); 403; 422 `BR-P9` (unknown asset, or a site or building other than the asset's).

### GET /api/plans/:id, PUT /api/plans/:id
- `GET` → `200 Plan + { occurrences }` (next 8 visits). Errors: 400 malformed id, 404.
- `PUT` (SUPERVISOR, ADMIN): any field of the creation body and `is_active`, with `version` (required). `200 { "updated": boolean, "item" }` (`updated: false` when nothing changed). A change of `anchor_week`, `frequency_weeks`, `end_week` or `is_active` replaces the planned visits (BR-P2). Errors: 400 (no field, invalid value); 403; 404; 409 `BR-V1` (changed since the user opened it); 422 `BR-P9`.

### PUT /api/plans/:id/anchor (Phase 18)
- Roles: SUPERVISOR, ADMIN. Body: `{ "anchor_week": week, "version": number }` (nothing else). Moves the series (BR-P2, D51): what the year planner sends when the first planned visit of a row is dragged. Same answer and errors as `PUT /api/plans/:id`.

### GET /api/plan-occurrences/:id, PUT /api/plan-occurrences/:id (Phase 18)
- `GET` (maintenance roles) → `200 Occurrence`. Errors: 400, 404.
- `PUT` (SUPERVISOR, ADMIN): `{ "week": week, "version": number }` moves one visit (BR-P3, BR-P4); logged. `200 { "updated": true, "item": Occurrence }`; the warnings (blocked week, season) do not prevent the move. Errors: 400; 403; 404; 409 `BR-V1` (changed since); 422 `BR-P3` (outside the tolerance, later than a regulatory due week, in the past, with the reason as `message`), `BR-P4` (has a work order), `BR-P7` (skipped).

### POST /api/plan-occurrences/:id/skip, POST /api/plan-occurrences/:id/restore (Phase 18)
- SUPERVISOR, ADMIN. `skip`: `{ "reason": string (1–500), "version" }`; `restore`: `{ "version" }` (BR-P7). `200 { "updated": true, "item": Occurrence }`. Errors: 400 (no reason); 403; 404; 409 `BR-V1`; 422 `BR-P7` (skip: the visit has a work order or is already skipped; restore: not skipped, or skipped by cancelling its work order).

### GET/POST /api/planning/blocked-weeks, DELETE /api/planning/blocked-weeks/:id (Phase 18)
- `GET` (maintenance roles), query `from?`, `to?` (weeks; default from the current week on) → `200 { "items": BlockedWeek[] }`, by week then site (every site first).
- `POST` (SUPERVISOR, ADMIN): `{ "week", "site"?: string | null (left out or null: every site), "reason": 1–200 }` → `201 { "created": true, "item": BlockedWeek }`. Errors: 400; 403; 409 already blocked for that site (`details.fields.week`).
- `DELETE` (SUPERVISOR, ADMIN) → `204`. Errors: 403; 404.

### GET /api/planning/timeline
- Query: `from?` (first week, default the current week) **or** `year?` (calendar year: weeks 1 to 52 or 53 of that year; both → 400), `weeks?` (1–53, default 52; ignored with `year`), `group_by?` (`site` default, `building`, `category`), and the plan filters `q?`, `site?`, `building?`, `category?`, `type?`, `performed_by?`. The range must start between 104 weeks before and 52 weeks after the current week (400 otherwise). Only active plans are shown.
- Runs the release first (BR-P6), so the chips show every work order due.
- `200`:
  ```
  { "from": "2026-W41", "to": "2027-W39", "current_week": "2026-W41", "group_by": "site",
    "weeks": [{ "week": "2026-W41", "monday": "2026-10-05" }, ...],
    "settings": { daily_hours, reserve_percent, release_weeks_ahead, max_block_hours, version, updated_by, updated_at },
    "capacity": { "weekly": 98, "by_category": { "HVAC": 24.5, "ELECTRICAL": 49, "GENERAL": 24.5 } },
    "figures": [{ "week", "planned_hours", "by_category": { "HVAC": 40 }, "by_site": {...},
                  "capacity", "load", "level": "OK" | "TIGHT" | "OVER" | null,
                  "contractor_visits", "sites_visited" }, ...],
    "tiles": { "workload": { average_load, peak_load, weeks_over, weeks_tight },
               "trade_balance": [{ category, planned_hours, capacity_hours, load }],
               "peak_week": { week, load, planned_hours, capacity, excess_hours } | null,
               "site_spread": { average, peak },
               "contractor_visits": { total, peak, peak_week } },
    "blocked_weeks": [{ id, week, site | null, reason }],
    "groups": [{ "key", "site"? , "building"?, "category"?, "hours": [per week, internal only],
                 "plans": [{ id, code, title, type, category, site, building, estimated_hours,
                             frequency_weeks, anchor_week, end_week, tolerance_weeks,
                             season_from_week, season_to_week, schedule_mode, performed_by,
                             supplier, version, warnings, occurrences: Occurrence[] }] }] }
  ```
- `load` is null without capacity (e.g. a trade nobody has as specialty). Errors: 400.

### POST /api/planning/release
- Roles: SUPERVISOR, ADMIN. Releases now (BR-P6), in the name of the user. `200 { "released": 3, "work_order_ids": [...] }`; a second call answers `{ "released": 0, "work_order_ids": [] }`.
- The daily job `npm run pm:release` does the same in the name of each plan's author.

### GET /api/planning/settings, PUT /api/planning/settings
- `GET` (every maintenance role) → `200 { daily_hours, reserve_percent, release_weeks_ahead, max_block_hours, version, updated_by: UserRef|null, updated_at, capacity_people }` (`capacity_people`: active technicians and supervisors).
- `PUT` (ADMIN only, 403 for supervisors): `{ "reserve_percent"?: 0–80, "daily_hours"?: 0.5–12 (half hours), "release_weeks_ahead"?: 1–12, "max_block_hours"?: 0.5–8 (half hours), "version" }`. `200 { "updated": boolean, "item" }`; the change applies at once to every figure and is logged (`entity_type = planning_settings`). Errors: 400; 403; 409 `BR-V1`.

## Week scheduler and My week (added, D48, D52)

Maintenance roles (staff: 403). Rules BR-S1 to BR-S10 in `docs/data-model.md`. Days are dates `YYYY-MM-DD`; weeks ISO weeks (a week that does not exist → 400). Writes are not queued offline: the scheduler needs a connection (P18).

### GET /api/schedule
- Query: `week?` (default: the current week in `APP_TIMEZONE`). Every maintenance role. Runs the release first (BR-P6), so the week's preventive work orders are in the tray.
- `200`:
  ```
  { "week": "2026-W41", "current_week": "2026-W41",
    "days": [{ "day": "2026-10-05", "weekday": 1, "open": true }, ...],   // Mon–Fri, open weekend days, closed ones holding blocks
    "saturday_open": false, "sunday_open": false,
    "settings": { "daily_hours": 7, "max_block_hours": 3.5 },
    "people": [{ id, first_name, last_name, role, specialty, site, inactive?, week_total, week_capacity,
                 "days": ScheduleDay[], "blocks": Block[] }],                // technicians first, then supervisors
    "tray": TrayItem[],                                                      // planned, carried over, not planned; by priority, due date
    "tiles": { booked_hours, available_hours,
               hours_left: { planned, carried_over, not_planned },
               travel_share, sites_per_day: { average, worst }, carried_over } }
  ```
- A person's blocks of a day: appointments by start time, then work, then other time, each in the person's order. People deactivated since they got blocks this week are listed with `inactive: true`.

### POST /api/schedule/allocations
- SUPERVISOR, ADMIN. Body: `{ "blocks": [{ "kind", "work_order_id"? (WORK only, required for it), "technician_id", "day", "hours", "note"? }] }` (1–20 blocks: a split is one request, all or nothing).
- `201 { "created": true, "items": Block[] }`. The first block of a work order sets its `planned_week` and, when unassigned, its assignee (BR-S3).
- Errors: 400 (unknown field, hours not in half hours or outside 0.5–8, work order missing on WORK or given on other kinds); 403; 422 `BR-S1` (longer than `max_block_hours`), `BR-S2` (no estimate), `BR-S3` (not an active technician or supervisor), `BR-S4` (finished, waiting for review, or unknown work order).

### PUT /api/schedule/allocations/:id
- SUPERVISOR, ADMIN. `{ "day"?, "technician_id"?, "hours"?, "note"?, "version" }`. `200 { "updated": true, "item": Block }`. A block moved to another day or person goes to the end of that day.
- Errors: 400 (no field); 403; 404; 409 `BR-V1`; 422 `BR-S6` (locked), `BR-S4` (finished work order), `BR-S1`, `BR-S3`.

### DELETE /api/schedule/allocations/:id?version=N
- SUPERVISOR, ADMIN. `204`; its hours go back to the tray; logged with the last values. Errors: 400 (no version); 403; 404; 409 `BR-V1`; 422 `BR-S6`, `BR-S4`.

### PUT /api/schedule/allocations/:id/lock
- SUPERVISOR, ADMIN on any block; a TECHNICIAN on their own (403 otherwise). `{ "locked_start": "HH:MM" | null, "version" }`. `200 { "updated": true, "item": Block }`.
- Errors: 400 (not on the half hour, ending after midnight); 403; 404; 409 `BR-V1`, `BR-S6` (overlaps another appointment of the day); 422 `BR-S6` (not a work block).

### PUT /api/schedule/day-order
- Every maintenance role; technicians for their own day (403 otherwise). `{ "technician_id", "day", "ids": [] }`: every block of that day, in the new order. `200 { "items": Block[] }` (appointments still first). Not versioned, not logged. Errors: 400; 403; 409 when `ids` is not exactly the day's blocks.

### PUT /api/schedule/capacity
- SUPERVISOR, ADMIN. `{ "technician_id", "day", "hours": 0–12 (half hours) | null, "reason"? (required with hours), "note"? }`; `hours: null` goes back to the default. `200 { technician_id, day, override: { hours, reason, note } | null }`. Errors: 400; 403; 422 `BR-S3`.

### PUT /api/schedule/weeks/:week
- SUPERVISOR, ADMIN. `{ "saturday_open": boolean, "sunday_open": boolean }` → `200 { week, saturday_open, sunday_open }`. Errors: 400; 403.

### GET /api/my-week
- Every maintenance role, for themselves. Query `week?` (default the current week). `200 { week, current_week, generated_at, user: UserRef, days: [ScheduleDay + { weekday, blocks: Block[] }], week_total, week_capacity, work_orders: WorkOrder[] }`: appointments first, then the person's own order; the complete work orders of the blocks, so the client can open them offline.

## Future AI endpoints (not in the MVP)

`POST /api/assistant/format-report` and `POST /api/assistant/find-work-order` are described in the brief. They are not implemented. The UI only prepares the `.ai-only` mechanism (see `docs/architecture.md`).

## Endpoint summary

| Area | Endpoints |
|---|---|
| Ops | `GET /api/health` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Assets | `GET/POST /api/assets`, `GET /api/assets/search`, `GET/PUT/DELETE /api/assets/:id`, `PUT /api/assets/:id/resolve-conflict` |
| Work orders | `GET/POST /api/work-orders`, `GET /api/work-orders/stats`, `GET/PUT /api/work-orders/:id`, `PUT /api/work-orders/:id/resolve-conflict`, `PUT /api/work-orders/:id/review`, `GET/POST /api/work-orders/:id/comments` |
| Staff requests | `GET/POST /api/requests`, `GET /api/requests/:id`, `POST /api/requests/:id/comments` |
| Conflicts | `GET /api/conflicts`, `GET /api/conflicts/:id` |
| Reference | `GET /api/reference-data`, `GET /api/users` |
| Dashboard | `GET /api/dashboard` |
| History | `GET /api/assets/:id/history`, `GET /api/work-orders/:id/history`, `GET /api/audit-log` |
| Preventive maintenance | `GET/POST /api/plans`, `GET/PUT /api/plans/:id`, `PUT /api/plans/:id/anchor`, `GET/PUT /api/plan-occurrences/:id`, `POST /api/plan-occurrences/:id/skip`, `POST /api/plan-occurrences/:id/restore`, `GET /api/planning/timeline`, `POST /api/planning/release`, `GET/POST /api/planning/blocked-weeks`, `DELETE /api/planning/blocked-weeks/:id`, `GET/PUT /api/planning/settings` |
| Week scheduler | `GET /api/schedule`, `POST /api/schedule/allocations`, `PUT/DELETE /api/schedule/allocations/:id`, `PUT /api/schedule/allocations/:id/lock`, `PUT /api/schedule/day-order`, `PUT /api/schedule/capacity`, `PUT /api/schedule/weeks/:week`, `GET /api/my-week` |
