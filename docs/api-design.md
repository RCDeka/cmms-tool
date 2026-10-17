# API Design

Base path: `/api`. Format: JSON (UTF-8). Auth: `Authorization: Bearer <jwt>` on every endpoint except `POST /api/auth/login` and `GET /api/health`.

Endpoints from the product brief keep their behavior, with English paths (D18). Endpoints marked **(added)** are listed in decision D8.

## Conventions

- IDs: integers. Datetimes: ISO 8601 UTC. Dates: `YYYY-MM-DD`. Booleans: `true`/`false`. Enumerated values: codes from `docs/data-model.md`.
- JSON field names are the database column names (`snake_case`).
- Pagination (brief): `page` (default 1), `size` (default 50, max 100). Response: `{ "total", "page", "pages", "items": [...] }`. `pages` is at least 1, so an empty list reads "page 1 of 1". A `page` above `pages` returns an empty `items` array.
- Sorting: `sort` (whitelisted column, see each endpoint) and `order` (`asc`|`desc`). Any other value → 400. Enumerated columns (priority, criticality, status) sort in business order (e.g. `LOW` < `NORMAL` < `HIGH` < `URGENT`), not alphabetically. Ties are broken by `id` in the same direction, so pages stay stable.
- List items are **complete records**, identical to the `GET /:id` response (D7).
- Error body (all errors except version conflicts): `{ "statusCode": number, "error": string, "message": string, "details"?: object }`. `details` holds per-field validation errors or the violated business rule (e.g. `{ "rule": "BR-W4" }`). Messages are always in English; the web client shows them in the user's language from its own dictionary (D85), so a new or changed message also needs its French text in `frontend/assets/js/i18n-fr.js` (`FR_SERVER`, or `FR_PATTERNS` when it holds a value).
- Status codes: `400` invalid input, `401` missing/invalid/expired token, `403` role or field not allowed, `404` not found, `409` version conflict or record locked by a conflict, `422` business rule violated (status transition, required field, invalid reference), `429` rate limit.
- Unknown body fields **and unknown query parameters** are rejected (400), which catches typos such as `pagesize`. The input is validated with zod. Route ids must be plain positive integers (400 otherwise).
- Without a valid token, every `/api` path except the public ones answers 401, including paths that don't exist, so the API doesn't reveal its routes.

## Permission matrix (D23)

| Action | STAFF | TECHNICIAN | SUPERVISOR | ADMIN |
|---|---|---|---|---|
| Read assets, work orders, dashboard, record history | no (403) | yes | yes | yes |
| Personal dashboards (`/dashboards`) and their widgets (`/dashboard/widgets…`) (D59) | no | no | yes | yes |
| Switch dashboard widgets on or off for supervisors (`/dashboards/widgets`, D65) | no | no | no | yes |
| Read reference data (`GET /reference-data`) | yes | yes | yes | yes |
| `/requests` (own requests: list, create, read, comment, cancel; D46, D79) | yes | no | no | no |
| `GET/POST /work-orders/:id/comments` | no | yes | yes | yes |
| `POST /assistant/find-work-order` (D67) | no | yes | yes | yes |
| `PUT /work-orders/:id/review` (approve and assign, or reject a staff request; D47) | no | no | yes | yes |
| `PUT /assets/:id` | no | only `status`, `comment`, `last_serviced_on` | all editable fields | all editable fields |
| `POST /assets`, `DELETE /assets/:id` | no | no | yes | yes |
| `POST /work-orders` (create) | no | yes, assigned to themselves only (BR-W12) | yes | yes |
| `PUT /work-orders/:id` | no | only work orders assigned to them; only `status`, `started_on`, `actual_hours`, `work_report` | all editable fields | all editable fields |
| `GET /users` | no | no | yes | yes |
| `GET /audit-log` | no | no | yes, without user accounts | yes |
| `/admin/users` (user administration) | no | no | no | yes |
| `GET /locations` (the location tree, D82; staff: the places in use, without codes) | yes | yes | yes | yes |
| `/admin/locations` (create, read, change, move, take out of use a place; D82) | no | no | yes, not sites (BR-LOC6) | yes |
| `GET /admin/level-types` | no | no | yes | yes |
| `POST /admin/level-types`, `PUT /admin/level-types/:id` (BR-LT1) | no | no | no | yes |
| `POST /auth/change-password` (own password) | yes | yes | yes | yes |
| `POST /feedback` (suggest an improvement) | yes | yes | yes | yes |
| `GET /feedback`, `PUT /feedback/:id` | no | no | no | yes |
| Conflict console and resolution | no | no | yes | yes |
| Read plans, the year planner and the planning settings (D48) | no | yes | yes | yes |
| `POST /plans`, `PUT /plans/:id`, `PUT /plans/:id/anchor`, `POST /planning/release`, `POST /planning/suggestions` | no | no | yes | yes |
| Move, skip, restore a visit (`/plan-occurrences/:id…`); add or remove blocked weeks | no | no | yes | yes |
| `PUT /planning/settings` (reserve, daily capacity, release horizon, longest block) | no | no | no | yes |
| Read the week schedule (`GET /schedule`, `GET /schedule/work-orders/:id`) and their own week (`GET /my-week`) (D52, D68) | no | yes | yes | yes |
| Allocate, move, resize, remove blocks; capacity of a day; open weekends | no | no | yes | yes |
| Lock or unlock an appointment (`PUT /schedule/allocations/:id/lock`) | no | own blocks | yes | yes |
| Order a day (`PUT /schedule/day-order`) | no | own day | yes | yes |

Staff members are refused every path under `/api/assets`, `/api/work-orders`, `/api/conflicts`, `/api/dashboard`, `/api/dashboards`, `/api/audit-log`, `/api/plans`, `/api/plan-occurrences`, `/api/planning`, `/api/schedule`, `/api/my-week` and `/api/assistant` (403), whatever the method (D46).

Editable fields:
- **Assets**: every column except `id`, `code`, `place`, `version`, `has_conflict`, `updated_by`, `created_at`, `updated_at`.
- **Work orders**: every column except `id`, `number`, `client_id`, `place`, `created_on`, `created_by`, `version`, `has_conflict`, `updated_by`, `created_at`, `updated_at`, the review fields and `plan_id`.
- `place` is the path of `location_id`, set by the server with `site` (BR-LOC7). `location_id` is a versioned field like the others: a change made offline from an older version becomes a conflict (D82).

Sending a field the role may not edit → 403 with `details.fields`.

## Shared shapes

```
User        { id, last_name, first_name, username, role, site, specialty, power_user, is_active }
UserRef     { id, last_name, first_name }
Asset       { id, code, name, site, location_id, place, category, subcategory, criticality,
              status, brand, model, serial_number, commissioned_on, last_serviced_on,
              supplier, maintenance_contract, responsible_technician, exact_location,
              comment, version, has_conflict, updated_by: UserRef|null,
              created_at, updated_at }
WorkOrder   { id, number, type, status, priority, title, description,
              asset_id, asset: { id, code, name, site, status } | null,
              site, location_id, place, location, category,
              assignee_id, assignee: UserRef|null,
              supervisor_id, supervisor: UserRef|null,
              created_on, due_on, started_on, closed_on,
              estimated_hours, actual_hours, work_report,
              client_id, created_by: UserRef,
              review_status, reviewed_by: UserRef|null, reviewed_at, review_note,
              plan_id, plan: { id, code, title } | null, planned_week,
              version, has_conflict, updated_by: UserRef|null, created_at, updated_at }
Page<T>     { total, page, pages, items: T[] }
Location    { id, parent_id, site_id, level_type_id, name, code, is_active, version, created_at, updated_at }
              (GET /admin/locations/:id and the writes add site and place: where it is, as records store it)
LevelType   { id, name, token, offered_to_staff, is_active, version, created_at, updated_at }
Request     { id, number, status, priority, title, description, site, location_id, place, location, category,
              created_on, due_on, started_on, closed_on, work_report, client_id,
              review_status, review_note, reviewed_at, assignee: UserRef|null, comment_count, last_comment_at, created_at, updated_at }
Comment     { id, work_order_id, body, user: UserRef, user_role, created_at }
Plan        { id, code, title, description, type, category, asset_id,
              asset: { id, code, name } | null, site, location_id, place, location, estimated_hours,
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
              work_order: { id, number, title, site, place, location, status, priority,
                            category, type, estimated_hours, assignee_id } | null }
ScheduleDay { day, capacity, total, override: { hours, reason, note } | null, sites: string[],
              warnings: ('OVER_CAPACITY' | 'ABSENT' | 'WEEKEND_CLOSED' | 'SEVERAL_SITES')[] }
TrayItem    { id, number, title, type, status, priority, category, site, place, location, due_on,
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
- Indexed text: assets → code, name, site, place (the path below the site, D82), subcategory, brand, model, serial number, supplier, exact location, comment; work orders → number, title, description, site, work report, location, place. Database triggers keep the indexes in sync.
- Every enum filter, `site` and `assignee_id` take one value or several (D45): `status=OPEN,ON_HOLD`, `assignee_id=4,5`. Values of one filter are alternatives (OR); different filters combine with `q` and each other (AND). `site` values are separated by `|` instead of `,` because site names can contain commas. An invalid value, or more than 50 values, → 400.
- `location` (D82, BR-LOC10): places of the tree, comma-separated ids (at most 20): each one matches the records at that place or anywhere below it (`location=6` lists Tower A, its floors and its rooms).
- Filters combine with `q`, with each other (AND), with `sort` and with pagination: `total` and `pages` count the matching records.

### GET /api/assets
- Query: `page`, `size`, `sort` (`code`|`name`|`site`|`category`|`criticality`|`status`|`updated_at`, default `code`), `order` (default `asc`), and the filters `q?`, `site?`, `location?`, `category?`, `status?`, `criticality?` (several values allowed).
- `200 Page<Asset>`

### GET /api/assets/search
- Query: the asset filters (`q?`, `site?`, `location?`, `category?`, `status?`, `criticality?`), `limit` (default 50, max 200).
- `200 { "items": Asset[], "total": number }` (`total` = number of matches before `limit`), ordered by `code`.
- Declared before `/:id` in the router.

- `drill?` with `period?` (D59, K9): the assets of a dashboard asset widget segment (`critical_downtime:site:<name>`), as for the work order list; other widgets → 400.

### GET /api/assets/:id
- `200 Asset`. Errors: 404.

### POST /api/assets (added, D34)
- Roles: SUPERVISOR, ADMIN. Online only in the interface.
- Body: `{ "code"?: string, "name": string, "location_id": number, "category": Category, "criticality": Criticality, "status"?: AssetStatus, ...any other editable asset field }` (BR-A4). Instead of `location_id`, `site` alone puts the asset on the site itself (BR-LOC7). Unknown or server-set fields (`id`, `place`, `version`, …) → 400.
- `201 { "created": true, "item": Asset }`: `site` and `place` set by the server.
- Errors: 400 (no place: `details.fields.location_id`); 403; 409 code already used (`details: { rule: "BR-A1", fields: { code } }`); 422 `BR-LOC5` (place unknown or out of use), `BR-LOC7` (unknown site, or a site other than the place's).
- `PUT /api/assets/:id` takes `location_id` (and `site`) under the same rules; when the place changes, the asset's open work orders and its plans follow (BR-LOC8).

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
  - `awaiting_reply?=true`: staff requests whose latest comment is the requester's, i.e. waiting for a reply from the maintenance team (D80; `false` = the others);
  - `drill?` (D59, K9): the records of a dashboard widget segment, `<widget>[:<segment>]` with the segments of `GET /api/dashboard/widgets/:key/rows` (`backlog_age:URGENT:91+`), with `period?` (30, 90 or 365; only with `drill`, 400 otherwise). The list's own `site` and `category` filters carry the dashboard's sites and trades. Unknown widget or segment, or a widget without work orders (`recent_activity`, `assets_broken_down`, `pending_conflicts`) → 400. For the visit widgets the list holds the work orders of the counted visits (skipped visits usually have none: their Visits CSV lists them).
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
- Body: `{ "client_id": uuid, "title": string, "type": WorkOrderType, "priority"?: WorkOrderPriority, "description"?: string, "asset_id"?: number, "location_id"?: number, "site"?: string, "location"?: string, "category"?: Category, "assignee_id"?: number, "supervisor_id"?: number, "due_on"?: date, "estimated_hours"?: number, "edited_at"?: ISO }`. `asset_id` or a place (`location_id`, or `site` alone) is required; with an asset, the place is the asset's (BR-LOC8).
- `201 { "created": true, "item": WorkOrder }`
- `200 { "created": false, "item": WorkOrder }` when `client_id` was already used (replay, BR-W11).
- Errors: 400 invalid body or missing `client_id`/`title`/`type`/`asset_id`+place; 403 technician assigning someone else; 422 rule violated: unknown asset or site different from the asset's (BR-W2), place different from the asset's (BR-LOC8), place unknown or out of use (BR-LOC5), unknown site (BR-LOC7), assignee or supervisor not eligible (BR-W3), `due_on` before `created_on` (BR-W8), `edited_at` out of range (BR-W9).

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
- `review_status`, `reviewed_by`, `reviewed_at` and `review_note` are read-only in `PUT /api/work-orders/:id` (403), as are `plan_id` and `plan` (set by the release, D48). `planned_week` (set by the release or by the first block of the week scheduler, D52) is editable by supervisors and admins (D55): a week or null; for a plan's visit, the visit follows its work order (BR-P4), null → 422 `BR-P4`, a regulatory visit past its due week → 422 `BR-P3`.
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
- Body: `{ "client_id": uuid, "title": string, "site": string, "location_id"?: id | null, "location"?: string, "description"?: string, "category"?: Category | null, "priority"?: WorkOrderPriority, "edited_at"?: ISO }`. Leaving out `category` or `priority` is the form's "I don't know".
- `201 { "created": true, "item": Request }`; `200 { "created": false, "item": Request }` when the `client_id` was already used (BR-W11).
- The work order gets `type = CORRECTIVE`, `status = OPEN`, `review_status = PENDING` (D47), no assignee, supervisor or asset.
- A place of the list (`location_id`: a place of the site whose level type is offered to staff, BR-LOC9) or a `location` in words is required, or both: with a place, `location` holds the details ("desk 12-21") (BR-R1, D81, D82). Without one, the request is on the site itself.
- Errors: 400 invalid body (missing `title` or `site`, neither `location_id` nor `location` (`details.fields.location`); any other field such as `type`, `assignee_id` or `asset_id` is unknown); 403; 409 `client_id` used by someone else's work order; 422 `edited_at` out of range (BR-W9); 422 `BR-LOC5` the place is unknown or out of use, `BR-LOC9` it is on another site or of a type not offered to staff, `BR-LOC7` the site is unknown.

### GET /api/requests/:id
- `200 { ...Request, "status_history": [{ "status", "at" }], "comments": [Comment] }`. `status_history` lists the creation (`OPEN`), the review (`APPROVED` or `REJECTED`) and each status change, oldest first (BR-R5).
- Errors: 400 malformed id; 404 not found **or created by someone else**.

### POST /api/requests/:id/comments
- Body: `{ "body": string }` (1–2000 characters). `201 { "created": true, "item": Comment }`.
- Errors: 400; 404 not found or someone else's.

### POST /api/requests/:id/cancel (added, D79)
- The requester cancels their request until work starts (BR-R10), whether it waits for review or was approved. Body: `{}` (no `version`: staff never see it). To say why, the page invites a comment.
- `200 { "item": Request }` with `status = CANCELLED` and `review_status = WITHDRAWN`; the review fields of an approved request are kept.
- Errors: 400 malformed id or any body field; 404 not found or someone else's; 409 `{ rule: "BR-V4" }` while a conflict on the work order waits for a supervisor; 422 `{ rule: "BR-R10" }` once work has started (`IN_PROGRESS`, `ON_HOLD`) or when the request is already finished (a second cancel included).

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
- `200 { "sites": string[], "categories": [...], "criticalities": [...], "asset_statuses": [...], "work_order_types": [...], "work_order_statuses": [...], "work_order_priorities": [...], "assistant": boolean }`. `sites` lists the sites of the location tree (D82), in use or not, by name; the other lists are the enum codes. `assistant` is true when a model is configured for the AI assistant (`AI_PROVIDER`, D66).

### GET /api/users
- Roles: SUPERVISOR, ADMIN. Returns the users that can be assigned to a work order (for dropdowns).
- `200 [{ id, last_name, first_name, role, site, specialty }]` (active users only).

## AI assistant (added, D66, D67)

Specified in `docs/spec-ai-assistant.md` (guardrails in its section 4). The model never saves anything and only ranks records the server chose.

### POST /api/assistant/find-work-order
- Roles: TECHNICIAN, SUPERVISOR, ADMIN (STAFF 403).
- Body: `{ "raw_text": string, "asset_id"?: integer, "site"?: string }` (nothing else).
- Layer 1, before any call to the model: the text is normalised (BR-AI1) and must hold 10 to 2 000 characters and 3 words (BR-AI2: 400 with `details.rule` and `details.fields.raw_text`); `asset_id` must exist (422, `BR-AI3`) and a `site` sent with it must be the asset's (422, `BR-W2`).
- Candidate set (no AI): at most 30 open work orders (`OPEN`, `IN_PROGRESS`, `ON_HOLD`): with `asset_id`, the asset's; else those whose text or asset matches the text (full-text, any word), within `site` if given; ordered by relevance (bm25, title words weigh most), the user's own work raised.
- With a model (`assistant: true`) and candidates: one call, then the answer is checked (BR-AI5, BR-AI7, BR-AI8). Rate limited: 30 calls per hour per user, counted only when the model is called (429).
- `200 { "mode": "ASSISTANT" | "SEARCH", "notice": null | "NOT_CONFIGURED" | "UNAVAILABLE" | "UNUSABLE", "candidates": [{ "work_order": WorkOrder, "score": number | null, "reason": string | null }] }`.
  - `ASSISTANT`: at most 5 matches, score 0.3 to 1, highest first; `reason` is the model's (≤ 200 characters, shown as text). An empty list without a call when no open work order matches.
  - `SEARCH` (D67): the first 10 candidates, `score` and `reason` null; `notice` says why: no model configured, the model failed or timed out (`AI_TIMEOUT_MS`), or its answer was unusable.
  - `work_order` is the complete record from the database (D7), never text from the model.
- Errors: 400; 401; 403; 422 (`BR-AI3`, `BR-W2`, or `BR-AI5` when the model judges the text not about maintenance: nothing else is returned); 429.
- One JSON log line per request (endpoint, user id, text length, candidates, outcome, duration), never the text (BR-AI11).

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

## Locations (added, D82)

Rules BR-LOC1 to BR-LOC10 and BR-LT1 in `docs/data-model.md`; specification in `docs/spec-locations.md`.

### GET /api/locations
- Every role. `200 { "level_types": LevelType[], "items": Location[] }`: the whole tree, each place after its parent, siblings by name in natural order with the floors from the deepest basement up (`B2`, `B1`, `L0`, `L1` … `L12`). Not paginated: the forms cache it to work offline (D82).
- Staff get the places in use only, without `code` and `version`, and the level types in use as `{ id, name, offered_to_staff }` (BR-LOC9).

### POST /api/admin/locations
- SUPERVISOR, ADMIN. Body: `{ "parent_id": id | null, "level_type_id"?: id, "name": string (1–100, without "›"), "code"?: string | null (capitals and digits, 1–10; stored in capitals) }`. `parent_id: null` creates a site (ADMIN only, 403 otherwise; `level_type_id` left out or the site type); a place needs its `level_type_id`.
- `201 { "created": true, "item": Location + { site, place } }`. Errors: 400; 403; 409 `BR-LOC2` (name or code of a sibling, `details.fields.name` or `code`); 422 `BR-LOC1` (unknown parent or type, site type below a site), `BR-LT1` (type out of use), `BR-LOC3` (9th level), `BR-LOC5` (parent out of use).

### GET /api/admin/locations/:id
- SUPERVISOR, ADMIN. `200 Location + { site, place }`. Errors: 400, 404.

### PUT /api/admin/locations/:id
- SUPERVISOR, ADMIN (a site: ADMIN, 403 otherwise, BR-LOC6). Body: `{ "version": number, "name"?, "level_type_id"?, "code"?, "parent_id"? (a move), "is_active"? }`.
- `200 { "updated": boolean, "item": Location + { site, place } }` (`updated: false` when nothing changed). A move or a rename rewrites the `place` of the records of the subtree, without their version or date (BR-LOC4); taking a place out of use takes its subtree with it (BR-LOC5).
- Errors: 400; 403; 404; 409 `BR-V1` (changed since the user opened it), `BR-LOC2`, `BR-LOC6` (a site's name, once records name it); 422 `BR-LOC1`, `BR-LOC3`, `BR-LOC4` (another site, its own subtree, a site), `BR-LOC5` (back in use under a place out of use), `BR-LT1`.

### GET /api/admin/level-types, POST /api/admin/level-types, PUT /api/admin/level-types/:id
- `GET` (SUPERVISOR, ADMIN) → `200 { "items": LevelType[] }`, out of use included.
- `POST` (ADMIN): `{ "name": 1–50, "token": [A-Z][A-Z0-9_]{0,19} (stored in capitals), "offered_to_staff"?: boolean }` → `201 { "created": true, "item": LevelType }`.
- `PUT` (ADMIN): `{ "version", "name"?, "token"?, "offered_to_staff"?, "is_active"? }` → `200 { "updated": boolean, "item": LevelType }`. The site type (id 1) changes its name only (422 `BR-LT1`).
- Errors: 400; 403; 404; 409 `BR-LT1` (name or token used), `BR-V1`.

## Dashboard (added)

### GET /api/dashboard
- Maintenance roles (staff: 403).
- `200`:
  ```
  { "today": "2026-10-04", "generated_at": "2026-10-04T12:00:00.000Z",
    "kpis": { "open_work_orders": 18, "in_progress_work_orders": 25,
              "closed_this_month": 40, "assets_broken_down": 21,
              "overdue_work_orders": 9, "pending_conflicts": 2,
              "requests_to_review": 1, "requests_awaiting_reply": 2 },
    "week_end": "2026-10-10",
    "recent_activity": [WorkOrder x5],
    "my_work_today": [WorkOrder],
    "my_work_week": [WorkOrder] }
  ```
- `pending_conflicts`, `requests_to_review` (staff requests waiting for a review, D47) and `requests_awaiting_reply` (staff requests waiting for a reply, D80) are present for SUPERVISOR and ADMIN only. Technicians get `my_requests_awaiting_reply` instead: the same count, limited to the work orders assigned to them. Definitions: `docs/data-model.md` → KPI definitions.
- `today` is the date in `APP_TIMEZONE` used for the figures. `my_work_today` and `my_work_week` are sorted by priority (URGENT first), then due date (undated last), then number. `my_work_week` covers the next 7 days, today included, up to `week_end` (D43).
- The charts use `GET /api/work-orders/stats?period=30` (`by_category` and `by_status`).

## Personal dashboards (added, D59, Phase 21)

SUPERVISOR and ADMIN (technicians and staff: 403). A dashboard of another user answers 404 (BR-K1). Rules BR-K1 to BR-K4 in `docs/data-model.md`. Shape `Dashboard`: `{ id, name, position, widgets: [{ key, options }], filters: { period, sites, categories }, version, created_at, updated_at }` (filters always complete: period 30 and empty lists by default).

### GET /api/dashboards, GET /api/dashboards/:id
- `200 { "items": [Dashboard], "disabled_widgets": [key] }` in sidebar order; `disabled_widgets`: the widgets switched off by the administrators (D65), hidden from supervisors. A user without dashboards gets "Overview" created first, with the widgets of the former dashboard (for a supervisor, those switched off left out). `GET /:id`: one dashboard, 404 if not mine.

### POST /api/dashboards
- Body: `{ "name": string, "template"?: "OVERVIEW" | "BACKLOG" | "COMPLIANCE" | "ASSETS_PEOPLE" | "EMPTY", "copy_of"?: id }`: from a template (empty by default) or as a copy of one of my dashboards (widgets and filters). Placed last. For a supervisor, a template leaves out the widgets switched off (D65). Overview: the 12 widgets of the home dashboard (`requests_awaiting_reply` added by D80); Backlog: overdue work orders, opened vs closed, backlog by age and in weeks, workload; Assets and people (`"ASSETS_PEOPLE"`): assets broken down, repeat failures, bad actors, critical assets out of service, response times, estimates, staff requests; Compliance (`"COMPLIANCE"`): regulatory visits late, preventive maintenance compliance, week schedule kept, planned vs reactive work, contractors.
- `201 Dashboard`. Errors: 400; 404 `copy_of` not mine; 409 `BR-K2` name used (`details.fields.name = "Already used"`) or 20 dashboards already.

### PUT /api/dashboards/:id
- Body: `{ "version": N, "name"?, "widgets"?: [{ "key", "options"?: {} }], "filters"?: { "period"?: 30 | 90 | 365, "sites"?: [string], "categories"?: [Category] } }` (at least one field; filters are replaced whole, duplicates dropped). Widget options: only those of the catalogue, with an allowed value (`planned_vs_reactive`: `{ "basis": "count" | "hours" }`; `bad_actors`: `{ "critical_only": "no" | "yes" }`).
- A supervisor cannot add a widget switched off (D65); one already on the dashboard stays (hidden), so its order can still be saved.
- `200 Dashboard` (version + 1). Errors: 400 unknown or repeated widget, or a widget switched off added by a supervisor (`details.fields.widgets`), invalid filters or options; 404; 409 `BR-V1` stale version, `BR-K2` name used.

### PUT /api/dashboards/order
- Body: `{ "ids": [id, …] }`: each of my dashboards once, in the new order. `204`. Errors: 400 (missing, extra or repeated id).

### DELETE /api/dashboards/:id?version=N
- `204`. Errors: 400 without `version`; 404; 409 `BR-V1` stale version, `BR-K2` last dashboard.

### GET /api/dashboards/widgets, PUT /api/dashboards/widgets/:key (added, D65)
- ADMIN only (403 for supervisors). Widgets switched on or off for supervisors, to hide those in development or not working. Shape `WidgetSetting`: `{ key, enabled, updated_by: UserRef | null, updated_at }` (`null`s for a widget never switched; it is on).
- `GET`: `200 { "items": [WidgetSetting] }`, every widget of the catalogue in its order.
- `PUT`: body `{ "enabled": boolean }`; `200 WidgetSetting`; applies at once. Errors: 400 unknown key or invalid body; 403.
- For every role but ADMIN, a widget switched off is left out of `GET /api/dashboard/widgets` (no error), and `GET /api/dashboard/widgets/:key/rows` and the `drill` filter of `GET /api/work-orders` and `GET /api/assets` answer 403 `{ rule: "D65" }`.

### GET /api/dashboard/widgets?keys=a,b&period=&site=&category=
- `keys` (required): widgets to compute, comma-separated. Filters: `period` (30, 90 or 365; default 30), `site` (several joined by `|`), `category` (comma-separated). Each widget uses only the filters it declares in the catalogue.
- `200 { "today", "generated_at", "widgets": { key: data } }`. Data: tiles `{ value }`; `by_category` `{ period, items: [{ category, count }] }` (every category, then `UNSPECIFIED` when some have none); `by_status` `{ period, items: [{ status, count }] }`; `my_work` `{ today, week_end, today_items: [WorkOrder], week_items: [WorkOrder] }` (no filter: the user's own work); `recent_activity` `{ items: [WorkOrder] }` (5). Phase 22: `opened_vs_closed` `{ period, unit: "week" | "month", buckets: [{ key, from, to, partial, opened, closed, cancelled, unfinished }] }`; `backlog_age` `{ buckets: ["0-7", "8-30", "31-90", "91+"], rows: [{ priority, counts: [n, n, n, n] }] (Urgent first), total, urgent_old }`; `backlog_weeks` `{ items: [{ category, work_orders, hours, capacity, weeks }] (most weeks first; weeks null without capacity), unspecified: { work_orders, hours } | null, without_estimate }`; `planned_vs_reactive` `{ period, unit, groups: ["PLANNED", "REACTIVE", "REQUESTS", "IMPROVEMENT"], buckets: [{ key, from, to, partial, values: { GROUP: { count, hours } } }], without_actual_hours }`. Phase 23: `pm_compliance` `{ period, on_time, late, skipped, rate, items: [{ category, on_time, late, skipped, rate }], regulatory: { on_time, late, skipped, rate } }`; `regulatory_late` `{ value }`; `schedule_compliance` `{ period, unit, buckets: [{ key, from, to, partial, weeks, scheduled, kept, rate, hours, break_in_hours, break_in }], scheduled, kept, rate }`; `contractor_scorecard` `{ period, items: [{ supplier, visits, on_time, late, skipped, rate }] (worst first), rate }` (rates null when nothing counts). Phase 24 (durations in hours): `response_times` `{ period, rows: [{ priority, start: { count, median, p90 }, close: { … } }] (Urgent first), start, close }`; `request_service` `{ period, unit, count, reviewed, rejected, rejected_share, review_median, done_median, buckets: [{ key, from, to, partial, count, … }] }`; `bad_actors` `{ period, all: { total, assets, items: [{ asset: { id, code, name, site, criticality }, count, share, cumulative }] }, critical: { … } }`; `repeat_failures` `{ value, total, share }`; `critical_downtime` `{ period, items: [{ site, days, assets, down_today }], days, down_today, watched }`; `workload` `{ week, priorities, people: [{ id, first_name, last_name, role, counts, total, hours_left, booked, capacity }], unassigned: { counts, total, hours_left } }`; `estimate_accuracy` `{ period, items: [{ category, count, estimated, actual, ratio }] (largest ratio first), count, ratio }`. Definitions: `docs/data-model.md` → KPI definitions. Computed in one read transaction.
- Errors: 400 missing or unknown key, invalid filter. Widgets switched off are left out for supervisors (D65).

### GET /api/dashboard/widgets/:key/rows?segment=&period=&site=&category=
- The records behind a widget for the Work orders (CSV), Assets (CSV) and Visits (CSV) exports (BR-K4): `200 { "kind": "work_orders" | "assets" | "visits", "items": [WorkOrder | Asset | Visit], "total", "truncated" }`. `Visit` (preventive maintenance compliance, contractors): `{ plan_code, plan_title, type, category, site, performed_by, supplier, due_week, week, deadline_week, deadline_on, outcome, skip_reason, work_order_id, work_order_number, work_order_status, closed_on }`, by deadline; skipped visits are included, with or without a work order, at most 5,000 items, by number (by code for assets; `my_work` by priority then due date; `recent_activity` its 5).
- `segment` narrows to one part of the widget: a category (or `UNSPECIFIED`) for `by_category`; a status for `by_status`; `today` or `week` for `my_work`; `opened|closed|cancelled:<bucket>` for `opened_vs_closed` (bucket `2026-W40` or `2026-09`); `<PRIORITY>`, `<PRIORITY>:<age>` or `:<age>` for `backlog_age` (age `0-7`, `8-30`, `31-90`, `91+`); a trade, `UNSPECIFIED` or `NO_ESTIMATE` for `backlog_weeks`; `<KIND>` or `<KIND>:<bucket>` for `planned_vs_reactive`; `<outcome>` or `<outcome>:<TRADE>` for `pm_compliance` (outcome `on_time`, `late`, `skipped`); `scheduled|kept|missed[:<bucket>]` for `schedule_compliance`; `<outcome>`, `<outcome>:<contractor>` or `:<contractor>` for `contractor_scorecard` (the contractor's name as it is, colons included, up to 200 characters); `start|close[:<PRIORITY>]` for `response_times`; `rejected`, `pending` or `done` for `request_service`; `critical` or `asset:<id>` for `bad_actors`; `site:<name>` for `critical_downtime`; `person:<id>[:<PRIORITY>]` or `UNASSIGNED[:<PRIORITY>]` for `workload`; a trade or `UNSPECIFIED` for `estimate_accuracy`. Tiles take no segment. Some widgets add columns to each row in `dashboard` and order the rows by them: `response_times` `{ hours }` (slowest first), `request_service` `{ hours_to_review, hours_to_done }`, `repeat_failures` `{ previous, days_since_previous }`, `critical_downtime` `{ days_down }` (longest first), `estimate_accuracy` `{ ratio }` (biggest overrun first).
- Errors: 400 unknown key or segment; 403 `D65` a widget switched off (supervisors); 404 a widget without records (`pending_conflicts`).

## Maintenance plans and the year planner (added, D48, D49)

Maintenance roles (staff: 403). Rules BR-P1 to BR-P9 and BR-Y1 to BR-Y4 in `docs/data-model.md`. Weeks are ISO weeks `YYYY-Www`; a week that does not exist (`2027-W53`) → 400. The balancing assistant (Phase 20) and the week scheduler and My week (Phase 19) follow.

### GET /api/plans
- Query: `page`, `size`, `sort` (`code`|`title`|`site`|`category`, default `code`), `order` (default `asc`), and the filters `q?` (each word in the code, title, site, place, location or supplier), `site?` (`|`-separated), `location?` (places, with everything below them, BR-LOC10), `category?`, `type?` (`PREVENTIVE`|`REGULATORY`), `performed_by?` (`INTERNAL`|`CONTRACTOR`), `active?` (`true`|`false`; all when left out).
- `200 Page<Plan>`; `next_week` is the first visit from the current week on (skipped ones excluded).

### POST /api/plans
- Roles: SUPERVISOR, ADMIN.
- Body: `{ "title", "type", "estimated_hours", "frequency_weeks", "anchor_week", "asset_id"?, "location_id"?, "site"?, "category"?, "location"?, "description"?, "end_week"?, "schedule_mode"?, "tolerance_weeks"?, "season_from_week"?, "season_to_week"?, "performed_by"?, "supplier"? }`. `asset_id` or a place (`location_id`, or `site` alone) is required; with an asset, the place is the asset's (BR-LOC8); `category` is required without an asset (it defaults to the asset's); `tolerance_weeks` defaults to `min(8, floor(frequency_weeks / 4))`.
- `201 { "created": true, "item": Plan + { occurrences: Occurrence[] } }`: the code is automatic (`PM-0063`) and the visits are stored up to the horizon (BR-P1). `occurrences` lists the next 8 visits from the current week.
- Errors: 400 (unknown field, `estimated_hours` not in half hours, end before the anchor, half a season, contractor without `supplier`, neither asset nor place: `details.fields.location_id`); 403; 422 `BR-P9` (unknown asset, or a site other than the asset's), `BR-LOC8` (a place other than the asset's), `BR-LOC5`, `BR-LOC7`.

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
- Query: `from?` (first week, default the current week) **or** `year?` (calendar year: weeks 1 to 52 or 53 of that year; both → 400), `weeks?` (1–53, default 52; ignored with `year`), `group_by?` (`site` default, `area`: the plan's first place under its site, a building or a data center hall, D82; `category`), and the plan filters `q?`, `site?`, `location?`, `category?`, `type?`, `performed_by?`. The range must start between 104 weeks before and 52 weeks after the current week (400 otherwise). Only active plans are shown.
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
    "groups": [{ "key", "site"? , "area"? (null: the site itself), "category"?, "hours": [per week, internal only],
                 "plans": [{ id, code, title, type, category, site, location_id, place, estimated_hours,
                             frequency_weeks, anchor_week, end_week, tolerance_weeks,
                             season_from_week, season_to_week, schedule_mode, performed_by,
                             supplier, version, warnings, occurrences: Occurrence[] }] }] }
  ```
- `load` is null without capacity (e.g. a trade nobody has as specialty). Errors: 400.

### POST /api/planning/suggestions (Phase 20, D53)
- Roles: SUPERVISOR, ADMIN. Body: the timeline's range and filters, as JSON: `{ "from"?: week, "year"?: number, "weeks"?: 1–53, "q"?, "site"? (`|`-separated), "location"?, "category"?, "type"?, "performed_by"? }` (`from` and `year` together → 400; anything else, `group_by` included → 400). Runs the release first, like the timeline. Rules BR-B1 to BR-B4.
- `200`:
  ```
  { "from", "to", "current_week",
    "moves": [{ occurrence_id, plan_id, code, title, type, category, site, estimated_hours,
                from, to, due_week, version }],                   // in the order chosen
    "before": { figures, tiles },                                  // as in the timeline
    "after":  { figures, tiles } }                                 // with every move applied
  ```
- Nothing is saved: the client sends the moves the user keeps as `PUT /api/plan-occurrences/:id`. `moves` is empty when nothing can lower the load within the plans' rules. Errors: 400; 403.

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

### GET /api/schedule/work-orders/:id
- Every maintenance role (D68). `200 { "items": [Block + { technician: UserRef }] }`: the blocks of the work order from today on (`APP_TIMEZONE`), by day, appointments first. The "Scheduled" box of the work order panel. Errors: 400 (bad id); 404 (no such work order).

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

## Future AI endpoint (not implemented)

`POST /api/assistant/format-report` is described in the brief and specified in `docs/spec-ai-assistant.md` (Phase 25). It waits for the choice of a model provider. `POST /api/assistant/find-work-order` is implemented (see AI assistant above).

## Endpoint summary

| Area | Endpoints |
|---|---|
| Ops | `GET /api/health` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Assets | `GET/POST /api/assets`, `GET /api/assets/search`, `GET/PUT/DELETE /api/assets/:id`, `PUT /api/assets/:id/resolve-conflict` |
| Work orders | `GET/POST /api/work-orders`, `GET /api/work-orders/stats`, `GET/PUT /api/work-orders/:id`, `PUT /api/work-orders/:id/resolve-conflict`, `PUT /api/work-orders/:id/review`, `GET/POST /api/work-orders/:id/comments` |
| Staff requests | `GET/POST /api/requests`, `GET /api/requests/:id`, `POST /api/requests/:id/comments`, `POST /api/requests/:id/cancel` |
| Conflicts | `GET /api/conflicts`, `GET /api/conflicts/:id` |
| Reference | `GET /api/reference-data`, `GET /api/users`, `GET /api/locations` |
| Locations | `POST /api/admin/locations`, `GET/PUT /api/admin/locations/:id`, `GET/POST /api/admin/level-types`, `PUT /api/admin/level-types/:id` |
| Dashboard | `GET /api/dashboard`, `GET/POST /api/dashboards`, `GET/PUT/DELETE /api/dashboards/:id`, `PUT /api/dashboards/order`, `GET /api/dashboard/widgets`, `GET /api/dashboard/widgets/:key/rows` |
| History | `GET /api/assets/:id/history`, `GET /api/work-orders/:id/history`, `GET /api/audit-log` |
| Preventive maintenance | `GET/POST /api/plans`, `GET/PUT /api/plans/:id`, `PUT /api/plans/:id/anchor`, `GET/PUT /api/plan-occurrences/:id`, `POST /api/plan-occurrences/:id/skip`, `POST /api/plan-occurrences/:id/restore`, `GET /api/planning/timeline`, `POST /api/planning/suggestions`, `POST /api/planning/release`, `GET/POST /api/planning/blocked-weeks`, `DELETE /api/planning/blocked-weeks/:id`, `GET/PUT /api/planning/settings` |
| Week scheduler | `GET /api/schedule`, `GET /api/schedule/work-orders/:id`, `POST /api/schedule/allocations`, `PUT/DELETE /api/schedule/allocations/:id`, `PUT /api/schedule/allocations/:id/lock`, `PUT /api/schedule/day-order`, `PUT /api/schedule/capacity`, `PUT /api/schedule/weeks/:week`, `GET /api/my-week` |
