# API Design

Base path: `/api`. Format: JSON (UTF-8). Auth: `Authorization: Bearer <jwt>` on every endpoint except `POST /api/auth/login` and `GET /api/health`.

Endpoints from the product brief keep their behavior, with English paths (D18). Endpoints marked **(added)** are listed in decision D8.

## Conventions

- IDs: integers. Datetimes: ISO 8601 UTC. Dates: `YYYY-MM-DD`. Booleans: `true`/`false`. Enumerated values: codes from `docs/data-model.md`.
- JSON field names are the database column names (`snake_case`).
- Pagination (brief): `page` (default 1), `size` (default 50, max 100). Response: `{ "total", "page", "pages", "items": [...] }`. A `page` above `pages` returns an empty `items` array.
- Sorting: `sort` (whitelisted column, see each endpoint) and `order` (`asc`|`desc`). Any other value → 400.
- List items are **complete records**, identical to the `GET /:id` response (D7).
- Error body (all errors except version conflicts): `{ "statusCode": number, "error": string, "message": string, "details"?: object }`. `details` holds per-field validation errors or the violated business rule (e.g. `{ "rule": "BR-W4" }`).
- Status codes: `400` invalid input, `401` missing/invalid/expired token, `403` role or field not allowed, `404` not found, `409` version conflict or record locked by a conflict, `422` business rule violated (status transition, required field, invalid reference), `429` rate limit.
- Unknown body fields are rejected (400). The input is validated with zod.

## Permission matrix (D23)

| Action | TECHNICIAN | SUPERVISOR | ADMIN |
|---|---|---|---|
| Read assets, work orders, reference data, dashboard | yes | yes | yes |
| `PUT /assets/:id` | only `status`, `comment`, `last_serviced_on` | all editable fields | all editable fields |
| `POST /work-orders` (create) | yes, assigned to themselves only (BR-W12) | yes | yes |
| `PUT /work-orders/:id` | only work orders assigned to them; only `status`, `started_on`, `actual_hours`, `work_report` | all editable fields | all editable fields |
| `GET /users` | no | yes | yes |
| Conflict console and resolution | no | yes | yes |

Editable fields:
- **Assets**: every column except `id`, `code`, `version`, `has_conflict`, `updated_by`, `created_at`, `updated_at`.
- **Work orders**: every column except `id`, `number`, `client_id`, `created_on`, `created_by`, `version`, `has_conflict`, `updated_by`, `created_at`, `updated_at`.

Sending a field the role may not edit → 403 with `details.fields`.

## Shared shapes

```
User        { id, last_name, first_name, username, role, site, specialty, power_user }
UserRef     { id, last_name, first_name }
Asset       { id, code, name, site, building, floor, category, subcategory, criticality,
              status, brand, model, serial_number, commissioned_on, last_serviced_on,
              supplier, maintenance_contract, responsible_technician, exact_location,
              comment, version, has_conflict, updated_by: UserRef|null,
              created_at, updated_at }
WorkOrder   { id, number, type, status, priority, title, description,
              asset_id, asset: { id, code, name, site, status } | null,
              site, category,
              assignee_id, assignee: UserRef|null,
              supervisor_id, supervisor: UserRef|null,
              created_on, due_on, started_on, closed_on,
              estimated_hours, actual_hours, work_report,
              client_id, created_by: UserRef,
              version, has_conflict, updated_by: UserRef|null, created_at, updated_at }
Page<T>     { total, page, pages, items: T[] }
```

`password_hash` is never returned.

---

## Health (added)

### GET /api/health
- Public. `200 { "status": "ok", "time": "<ISO>" }`. The client also uses it to check whether the server can be reached.

## Authentication

### POST /api/auth/login
- Public, rate limited (10 attempts per 15 min per IP).
- Body: `{ "username": string, "password": string }`
- `200 { "token": string, "expires_in": number, "user": { id, last_name, first_name, role, power_user } }`
- Errors: 400; 401 invalid credentials; 429.

### POST /api/auth/logout
- `204`. JWTs are stateless: the server keeps no session, and the client deletes its token and local data (D22).

### GET /api/auth/me (added)
- `200 User`. Errors: 401.

## Assets

### GET /api/assets
- Query: `page`, `size`, `sort` (`code`|`name`|`site`|`category`|`criticality`|`status`|`updated_at`, default `code`), `order` (default `asc`).
- `200 Page<Asset>`

### GET /api/assets/search
- Query: `q` (matches `code`, `name`, `brand`, `model`, `serial_number`; case-insensitive), `site?`, `category?`, `status?`, `criticality?`, `limit` (default 50, max 200).
- `200 { "items": Asset[], "total": number }` (`total` = number of matches before `limit`).
- Declared before `/:id` in the router.

### GET /api/assets/:id
- `200 Asset`. Errors: 404.

### PUT /api/assets/:id
- Body: `{ ...changed fields..., "version": number, "edited_at"?: ISO }`. `edited_at` is when the user made the edit (used for queued offline edits); it defaults to now.
- `200 { "updated": true, "version": N+1, "item": Asset }`
- `409` version mismatch (BR-V3):
  ```
  { "conflict": true, "conflict_id": 12,
    "server_version": { ...Asset as stored... },
    "client_version": { ...fields sent by the client..., "version": N } }
  ```
- `409` record locked (BR-V4): `{ "conflict": true, "locked": true, "conflict_id": 12 }`
- Errors: 400; 403; 404; 422.

### PUT /api/assets/:id/resolve-conflict
- Roles: SUPERVISOR, ADMIN.
- Body: `{ "conflict_id": number, "choice": "A" | "B" | "MERGE", "fields"?: { ... } }`. `fields` is required for `MERGE` and contains the final value of each divergent field.
- `200 { "resolved": true, "version": N+1, "item": Asset }`
- Errors: 400; 403; 404 conflict or record not found; 409 conflict already resolved; 422 merged values break a rule.

## Work orders

### GET /api/work-orders
- Query: `page`, `size`, `sort` (`number`|`created_on`|`due_on`|`priority`|`status`|`updated_at`, default `created_on`), `order` (default `desc`).
- `200 Page<WorkOrder>`

### GET /api/work-orders/stats
- Query: `period` (days, default 30, max 365).
- `200`:
  ```
  { "period": 30,
    "by_category": [{ "category": "HVAC", "count": 42 }, ...],
    "by_status":   [{ "status": "OPEN", "count": 18 }, ...],
    "by_type":     [{ "type": "CORRECTIVE", "count": 120 }, ...] }
  ```
- Declared before `/:id` in the router.

### POST /api/work-orders
- Roles: TECHNICIAN, SUPERVISOR, ADMIN (rules BR-W9 to BR-W13).
- Body: `{ "client_id": uuid, "title": string, "type": WorkOrderType, "priority"?: WorkOrderPriority, "description"?: string, "asset_id"?: number, "site"?: string, "category"?: Category, "assignee_id"?: number, "supervisor_id"?: number, "due_on"?: date, "estimated_hours"?: number, "edited_at"?: ISO }`. `asset_id` or `site` is required.
- `201 { "created": true, "item": WorkOrder }`
- `200 { "created": false, "item": WorkOrder }` when `client_id` was already used (replay, BR-W11).
- Errors: 400 invalid body or missing `client_id`/`title`/`type`/`asset_id`+`site`; 403 technician assigning someone else; 404 asset not found; 422 rule violated (assignee not eligible, `due_on` before `created_on`, `edited_at` out of range).

### GET /api/work-orders/:id
- `200 WorkOrder` (with the linked asset). Errors: 404.

### PUT /api/work-orders/:id
- Same contract as `PUT /api/assets/:id`, plus the work order rules BR-W2 to BR-W8 (422 on violation).

### PUT /api/work-orders/:id/resolve-conflict
- Same contract as for assets.

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
- `200 { ...list item..., "version_a": { ...server snapshot... }, "version_b": { ...client changes... }, "current": { ...current record... }, "divergent_fields": ["status", "comment"] }`

## Reference data and users (added)

### GET /api/reference-data
- `200 { "sites": string[], "categories": [...], "criticalities": [...], "asset_statuses": [...], "work_order_types": [...], "work_order_statuses": [...], "work_order_priorities": [...] }`. `sites` comes from the data; the other lists are the enum codes.

### GET /api/users
- Roles: SUPERVISOR, ADMIN. Returns the users that can be assigned to a work order (for dropdowns).
- `200 [{ id, last_name, first_name, role, site, specialty }]`

## Dashboard (added)

### GET /api/dashboard
- `200`:
  ```
  { "kpis": { "open_work_orders": 18, "in_progress_work_orders": 25,
              "closed_this_month": 40, "assets_broken_down": 21,
              "overdue_work_orders": 9, "pending_conflicts": 2 },
    "recent_activity": [WorkOrder x5],
    "my_work_today": [WorkOrder] }
  ```
- `pending_conflicts` is present for SUPERVISOR and ADMIN only. Definitions: `docs/data-model.md` → KPI definitions.
- The chart uses `GET /api/work-orders/stats?period=30`.

## Future AI endpoints (not in the MVP)

`POST /api/assistant/format-report` and `POST /api/assistant/find-work-order` are described in the brief. They are not implemented. The UI only prepares the `.ai-only` mechanism (see `docs/architecture.md`).

## Endpoint summary

| Area | Endpoints |
|---|---|
| Ops | `GET /api/health` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Assets | `GET /api/assets`, `GET /api/assets/search`, `GET/PUT /api/assets/:id`, `PUT /api/assets/:id/resolve-conflict` |
| Work orders | `GET/POST /api/work-orders`, `GET /api/work-orders/stats`, `GET/PUT /api/work-orders/:id`, `PUT /api/work-orders/:id/resolve-conflict` |
| Conflicts | `GET /api/conflicts`, `GET /api/conflicts/:id` |
| Reference | `GET /api/reference-data`, `GET /api/users` |
| Dashboard | `GET /api/dashboard` |
