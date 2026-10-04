# API Design

Base path: `/api/v1`. Format: JSON (UTF-8). Auth: `Authorization: Bearer <jwt>` on all endpoints except `POST /auth/login` and `GET /health`.

## Conventions

- IDs: UUID strings. Dates: ISO 8601 UTC.
- Pagination query params: `page` (default 1), `pageSize` (default 20, max 100). Paginated response: `{ "data": [...], "meta": { "page", "pageSize", "total" } }`.
- Sorting: `sortBy` (whitelisted field) and `order` (`asc`|`desc`).
- Error body: `{ "statusCode": number, "error": string, "message": string | string[], "details"?: object }`. `details` is optional (e.g. per-field validation errors or the violated business rule id).
- Common status codes: `400` validation error, `401` missing/invalid token, `403` insufficient role, `404` not found, `409` conflict (uniqueness, business rule, invalid transition), `422` semantically invalid reference, `429` rate limit.
- Roles legend: **A** = ADMIN, **M** = MANAGER, **T** = TECHNICIAN.

## Shared Response Shapes

```
User        { id, email, firstName, lastName, role, isActive, createdAt, updatedAt }
Location    { id, name, parentId, createdAt, updatedAt }
Category    { id, name, description, createdAt, updatedAt }
Asset       { id, code, name, description, category: {id,name}, location: {id,name},
              status, manufacturer, model, serialNumber, installedAt, createdAt, updatedAt }
WorkOrder   { id, number, title, description, type, priority, status,
              asset: {id,code,name}, assignee: {id,firstName,lastName},
              createdBy: {id,firstName,lastName}, dueDate, startedAt, completedAt,
              resolutionNotes, createdAt, updatedAt }
HistoryItem { id, fromStatus, toStatus, changedBy: {id,firstName,lastName}, comment, changedAt }
```

---

## Health

### GET /health
- Roles: public.
- Response 200: `{ "status": "ok" }`

## Auth

### POST /auth/login
- Roles: public. Rate limited.
- Body: `{ "email": string, "password": string }`
- 200: `{ "accessToken": string, "expiresIn": number, "user": User }`
- Errors: 400 invalid body; 401 invalid credentials or inactive user; 429.

### GET /auth/me
- Roles: A, M, T.
- 200: `User`
- Errors: 401.

### POST /auth/change-password
- Roles: A, M, T (own account).
- Body: `{ "currentPassword": string, "newPassword": string }` (min 10 chars)
- 204 no content.
- Errors: 400; 401 wrong current password.

## Users

### GET /users
- Roles: A (M may read a reduced list for assignment, see `/users/assignable`).
- Query: `page`, `pageSize`, `role?`, `isActive?`, `search?` (name/email).
- 200: paginated `User`.
- Errors: 401, 403.

### GET /users/assignable
- Roles: A, M.
- Returns active users with role TECHNICIAN or MANAGER, for assignment dropdowns.
- 200: `[{ id, firstName, lastName, role }]`

### GET /users/:id
- Roles: A.
- 200: `User`. Errors: 401, 403, 404.

### POST /users
- Roles: A.
- Body: `{ "email", "password", "firstName", "lastName", "role" }`
- 201: `User`. Errors: 400; 409 email already used.

### PATCH /users/:id
- Roles: A.
- Body (all optional): `{ "email", "firstName", "lastName", "role", "isActive", "password" }`
- 200: `User`. Errors: 400; 404; 409 email conflict, last-admin rule (BR-U4), or open work orders on deactivation (BR-U5).

There is no `DELETE /users/:id` (deactivate via PATCH).

## Locations

### GET /locations
- Roles: A, M, T. Query: `parentId?`. 
- 200: `Location[]` (flat list, not paginated).

### POST /locations
- Roles: A, M.
- Body: `{ "name": string, "parentId"?: uuid }`
- 201: `Location`. Errors: 400; 404 parent not found; 409 duplicate name under same parent.

### PATCH /locations/:id
- Roles: A, M.
- Body: `{ "name"?, "parentId"? }`
- 200: `Location`. Errors: 400; 404; 409 duplicate or cycle.

### DELETE /locations/:id
- Roles: A.
- 204. Errors: 404; 409 used by assets or has children.

## Asset Categories

### GET /asset-categories
- Roles: A, M, T. 200: `Category[]`.

### POST /asset-categories
- Roles: A, M. Body: `{ "name": string, "description"?: string }`
- 201: `Category`. Errors: 400; 409 duplicate name.

### PATCH /asset-categories/:id
- Roles: A, M. Body: `{ "name"?, "description"? }`
- 200: `Category`. Errors: 400; 404; 409.

### DELETE /asset-categories/:id
- Roles: A. 204. Errors: 404; 409 used by assets.

## Assets

### GET /assets
- Roles: A, M, T.
- Query: `page`, `pageSize`, `search?` (code/name), `status?`, `categoryId?`, `locationId?`, `sortBy?` (`code`|`name`|`createdAt`), `order?`.
- 200: paginated `Asset` (excludes soft-deleted).

### GET /assets/:id
- Roles: A, M, T.
- 200: `Asset`. Errors: 404.

### POST /assets
- Roles: A, M.
- Body: `{ "code": string, "name": string, "description"?: string, "categoryId": uuid, "locationId": uuid, "status"?: AssetStatus, "manufacturer"?, "model"?, "serialNumber"?, "installedAt"?: date }`
- 201: `Asset`. Errors: 400; 404/422 unknown category or location; 409 duplicate `code`.

### PATCH /assets/:id
- Roles: A, M.
- Body: any field of POST except `code`.
- 200: `Asset`. Errors: 400; 404; 422.

### DELETE /assets/:id
- Roles: A, M. Soft delete.
- 204. Errors: 404; 409 non-terminal work orders exist (BR-A3).

### GET /assets/:id/work-orders
- Roles: A, M, T. Query: `page`, `pageSize`, `status?`.
- 200: paginated `WorkOrder` for the asset (maintenance history).

## Work Orders

### GET /work-orders
- Roles: A, M, T.
- Query: `page`, `pageSize`, `status?` (comma-separated), `priority?`, `type?`, `assetId?`, `assigneeId?`, `mine?` (boolean, filters on current user), `overdue?` (boolean), `search?` (title/number), `createdFrom?`, `createdTo?`, `sortBy?` (`createdAt`|`dueDate`|`priority`|`number`), `order?`.
- 200: paginated `WorkOrder`.

### GET /work-orders/:id
- Roles: A, M, T.
- 200: `WorkOrder`. Errors: 404.

### POST /work-orders
- Roles: A, M.
- Body: `{ "title": string, "description"?: string, "type"?: WorkOrderType, "priority"?: WorkOrderPriority, "assetId": uuid, "assigneeId": uuid, "dueDate"?: ISO date }`
- 201: `WorkOrder` with status `OPEN`; creates the initial history entry.
- Errors: 400 (missing `assetId` or `assigneeId`, bad enum, past `dueDate`); 401; 403; 404 asset or user not found; 422 asset retired/deleted or assignee inactive/not eligible.

### PATCH /work-orders/:id
- Roles: A, M (all editable fields); T (assignee only: `resolutionNotes`).
- Body (all optional): `{ "title", "description", "type", "priority", "dueDate", "assigneeId", "resolutionNotes" }`. `assetId` and `status` cannot be changed here.
- 200: `WorkOrder`. Errors: 400; 403; 404; 409 order is terminal (BR-W8); 422 invalid assignee.

### POST /work-orders/:id/status
- Roles: A, M (any order); T (only if assignee).
- Body: `{ "status": WorkOrderStatus, "comment"?: string, "resolutionNotes"?: string }`
- Rules: transition must be allowed (BR-W4); `COMPLETED` requires `resolutionNotes` (already stored or provided); `ON_HOLD` and `CANCELLED` require `comment`.
- 200: `WorkOrder` (updated). 
- Errors: 400 missing required comment/notes; 403 technician not assignee; 404; 409 invalid transition.

### GET /work-orders/:id/history
- Roles: A, M, T.
- 200: `HistoryItem[]` ordered by `changedAt` ascending.

There is no hard `DELETE /work-orders/:id`; use status `CANCELLED`.

## Dashboard

All dashboard endpoints: Roles A, M (T gets only `/dashboard/my-workload`). Common optional query params: `from`, `to` (ISO dates, default: last 30 days). Dates apply to `completed_at` for closed/MTTR metrics and `created_at` for created metrics.

### GET /dashboard/kpis
- 200:
```
{
  "period": { "from": "2026-09-04T00:00:00Z", "to": "2026-10-04T23:59:59Z" },
  "openWorkOrders": 42,
  "openByStatus": { "OPEN": 20, "IN_PROGRESS": 17, "ON_HOLD": 5 },
  "overdueWorkOrders": 6,
  "closedWorkOrders": 58,
  "cancelledWorkOrders": 3,
  "createdWorkOrders": 61,
  "mttrHours": 18.4,
  "assetsByStatus": { "ACTIVE": 210, "INACTIVE": 4, "UNDER_MAINTENANCE": 7, "RETIRED": 12 }
}
```
- `mttrHours` is `null` when no corrective orders were completed in the period.
- Errors: 400 invalid dates; 401; 403.

### GET /dashboard/workload
- Roles: A, M.
- 200:
```
[
  { "userId": "uuid", "firstName": "Ana", "lastName": "Diaz",
    "open": 5, "inProgress": 2, "onHold": 1, "overdue": 1, "completedInPeriod": 14 }
]
```
- Includes all active technicians, even those with zero orders. Sorted by `open` descending.

### GET /dashboard/my-workload
- Roles: A, M, T.
- 200: same shape as one item of `/dashboard/workload`, for the current user.

### GET /dashboard/work-orders-trend
- Roles: A, M. Query: `from`, `to`, `interval` (`day`|`week`, default `week`).
- 200: `[{ "bucket": "2026-09-28", "created": 12, "completed": 10 }]`

## Endpoint Summary

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` |
| Users | `GET/POST /users`, `GET/PATCH /users/:id`, `GET /users/assignable` |
| Locations | `GET/POST /locations`, `PATCH/DELETE /locations/:id` |
| Categories | `GET/POST /asset-categories`, `PATCH/DELETE /asset-categories/:id` |
| Assets | `GET/POST /assets`, `GET/PATCH/DELETE /assets/:id`, `GET /assets/:id/work-orders` |
| Work orders | `GET/POST /work-orders`, `GET/PATCH /work-orders/:id`, `POST /work-orders/:id/status`, `GET /work-orders/:id/history` |
| Dashboard | `GET /dashboard/kpis`, `/dashboard/workload`, `/dashboard/my-workload`, `/dashboard/work-orders-trend` |
| Ops | `GET /health` |
