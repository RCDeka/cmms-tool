<!--
SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Locations and Asset Codes: Specification

Status: **specified and confirmed** (product owner discussion, 2026-10-14; decision D82; backlog item 15). Section 3 holds the product owner's choices. Section 12 lists the smaller choices made while writing, all confirmed by the product owner on the same day. **Phase 32 is implemented** (2026-10-14): its tables, endpoints and screens are in `docs/data-model.md`, `docs/api-design.md`, `docs/architecture.md` and `docs/ui-guidelines.md`, which prevail over this file; D83 lists where it completes or departs from it (the rules are named BR-LOC1 to BR-LOC10, as BR-L1 to BR-L4 belong to the audit log). Phases 32 and 33 in `docs/roadmap.md`. As each phase is implemented, its tables, endpoints and screens move into `docs/data-model.md`, `docs/api-design.md`, `docs/architecture.md` and `docs/ui-guidelines.md`, which then prevail over this file.

## 1. Goals

- **Locations.** Each organization divides its places in its own way (site → building → floor → room, building → zone → floor → room, a data center hall → row), and the sites of one organization differ (an office tower, a data center). Today the levels are fixed columns: `site`, `building`, `floor` and `exact_location` on assets, `site`, `building` and `location` on plans, `site`, `location` and `room_id` on work orders, and the flat `rooms` list of D81. They become **one tree of places** per site, with level types an admin defines.
- **Asset codes.** Codes usually follow a house standard: `AHU20110` is air handling unit, building 2, first basement (`01`), number 10. Today codes are `AST-0001` or typed by hand. The server **proposes the next code** from a pattern built from the asset type's abbreviation, the codes of its places and a sequence number. The proposal stays editable, and a code stays unique.
- Both change how data is stored and imported, so they come **before the import tools** (backlog item 14) and the first deployment.

Non-goals: maps or floor plans, geolocation, surfaces and occupancy, a BIM model, barcode or QR label printing, several trees per site, places shared between sites.

## 2. Vocabulary

| Term | Meaning | Identifier |
|---|---|---|
| place | A node of the tree: a site, building, floor, room, hall… | `locations` |
| site | A place at the root of the tree; its name is the `site` of every record below it | level type `SITE` |
| level type | The kind of a place (Building, Floor, Room…), defined by an admin | `level_types` |
| path | The names from the site down to a place: "Paris La Défense HQ › Tower A › B1 › Plant room 2" | |
| place code | A short code of a place used in asset codes (`2` for Tower 2, `01` for the first basement) | `locations.code` |
| asset type | A kind of equipment within a trade (Air handling unit, HVAC), with an abbreviation | `asset_types` |
| abbreviation | The short code of an asset type: `AHU` | `asset_types.abbreviation` |
| code pattern | How a code is built: `{TYPE}{BUILDING}{FLOOR}{SEQ:2}` | `code_pattern` |
| token | A `{…}` part of a pattern | |

## 3. Decisions taken with the product owner

| # | Topic | Choice |
|---|---|---|
| L1 | Scope of the tree | Assets, work orders and plans point to **one place** (`location_id`, any level) plus free-text details. `building`, `floor` and `room_id` go, and the rooms of D81 become places. The **`site` column stays**, set by the server from the place's site, so the site filters, users' sites, capacity, blocked weeks and dashboards keep working unchanged. |
| L2 | Level types | **Free types, any order**: admins keep a list of level types, and any type can sit under any place at any depth, so each site follows its own layout. Only the root is always a site. |
| L3 | Who edits the tree | **Supervisors and admins**, as for the rooms today (D81). Only admins define level types. |
| L4 | What staff pick | Each level type has an **"offered to staff"** flag (Room, Meeting room, Kitchen: yes; Technical room: no). The request form drills down to a place of such a type, and "Not in the list" keeps the free text (D81). |
| C1 | Abbreviations | A **managed list of asset types**, kept by admins: name, trade, abbreviation. It replaces the free-text `subcategory`. |
| C2 | Patterns | One **organization-wide default pattern**, which an asset type can override with its own. |
| C3 | Missing part | A token without a value (no such level above the place, a place without a code) gives an **empty string**. The proposal is still shown, and the user can edit it before saving. |
| C4 | Moves | **An admin may recode** an asset (after a move, or to fix a mistake). The old code stays in the audit log. Work orders link by id, so nothing breaks. Everyone else still sees the code as fixed. |

## 4. Data model

### level_types (new)
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| name | TEXT | no | 1–50, unique whatever the case | "Building", "Technical room" |
| token | TEXT | no | `[A-Z][A-Z0-9_]{0,19}`, unique | the name used in code patterns: `BUILDING` |
| offered_to_staff | INTEGER | no | 0/1, default 0 | staff may pick places of this type (L4) |
| is_active | INTEGER | no | 0/1, default 1 | a type out of use is no longer offered for new places |
| version, created_at, updated_at, updated_by | | | | optimistic check, as for plans |

The type `SITE` (id 1, name "Site") exists from the migration. Its name can change, but its token cannot, and it cannot be taken out of use. The migration also creates Building (`BUILDING`), Floor (`FLOOR`) and Room (`ROOM`, offered to staff).

### locations (new, replaces `rooms`)
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| parent_id | INTEGER | yes | FK → locations.id | NULL for a site (BR-LOC1) |
| site_id | INTEGER | no | FK → locations.id | its site (itself for a site); kept by the server, so a subtree is one indexed query |
| level_type_id | INTEGER | no | FK → level_types.id | `SITE` exactly when `parent_id` is NULL |
| name | TEXT | no | 1–100 | "Tower A", "B1", "Meeting room 12.02" |
| code | TEXT | yes | `[A-Z0-9]{1,10}` | place code for asset codes (`2`, `01`, `PAR`) |
| is_active | INTEGER | no | 0/1, default 1 | |
| version, created_by, updated_by, created_at, updated_at | | | | optimistic check, as for plans |

Indexes: `parent_id`, `site_id`. Name unique among the siblings whatever the case, and among the sites (`coalesce(parent_id, 0)`, `lower(name)`). Code unique among the siblings when set. Places are listed by name in **natural order** (`L2` before `L10`), with the floor rule of D81 kept for every level: `B<n>` from the deepest up, then `L<n>`, then other names.

### Changed tables
- **assets**: `location_id` (NOT NULL, FK) and `asset_type_id` (nullable, FK) are added. `building`, `floor` and `subcategory` are removed. `exact_location` stays: the details below the place ("north wall"). `site` stays, set by the server (BR-LOC7). `category` must equal the type's trade when a type is set (BR-AT2).
- **work_orders**: `location_id` (NOT NULL, FK) is added, and `room_id` is removed. `location` stays: the details ("desk 12-21"). `site` stays, set by the server.
- **maintenance_plans**: `location_id` (NOT NULL, FK) is added, and `building` is removed. `location` stays as the details. `site` stays, set by the server.
- **rooms**: dropped once its rows are copied into `locations` (section 9).
- Unchanged: `users.site`, `blocked_weeks.site`, the dashboards' `filters.sites`. They name a site by its name, as today.

### asset_types (new)
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| name | TEXT | no | 1–100 | "Air handling unit" |
| category | TEXT | no | CHECK Category | its trade |
| abbreviation | TEXT | no | `[A-Z0-9]{1,10}`, unique | `AHU` |
| code_pattern | TEXT | yes | BR-C1 | overrides the default pattern when set |
| is_active | INTEGER | no | 0/1, default 1 | |
| version, created_at, updated_at, updated_by | | | | |

Unique (`category`, `lower(name)`).

### asset_code_settings (new)
One row (`id = 1`), edited by admins: `default_pattern` (default **`AST-{SEQ:4}`**, which gives today's codes, so nothing changes until an admin sets a pattern), `version`, `updated_by`, `updated_at`. Every change is logged in the audit log.

## 5. Rules

### Places
- BR-LOC1: A place without a parent is a site, and a site has no parent. A place other than a site never has the type `SITE`.
- BR-LOC2: Siblings cannot share a name whatever the case, and neither can two sites (409). Siblings cannot share a code (409).
- BR-LOC3: A branch has at most **8 levels**, the site included (422).
- BR-LOC4: A place may move under another place **of the same site**, never into its own subtree (422). The records pointing to it or below it follow without being written: their path changes, but their codes do not. A site cannot move.
- BR-LOC5: Places are never deleted. Taking a place out of use takes its whole subtree with it. A place comes back into use only under a place in use. Records keep a place out of use, but a new record or a changed `location_id` may only name a place in use (422).
- BR-LOC6: Only admins create sites, rename them or take them out of use. A site is renamed only while no record (asset, work order, plan, user, blocked week, dashboard filter) names it (409), because `site` is copied into those rows.
- BR-LOC7: The server sets a record's `site` to the name of its place's site. A body may still send `site` alone, which means the site itself as the place (`location_id` = the site's id). Sending a `site` that differs from the place's site → 422.
- BR-LOC8: With an asset, a work order's or a plan's place **is the asset's place**, set by the server (as `site` is today: BR-W2, BR-P9). Sending another one → 422. The details text stays free. When the asset moves, its open work orders and its plans follow it in the same transaction.
- BR-LOC9: A staff request's place is a place in use of its site whose level type is offered to staff, or the site itself with the place in words (the words are then required, as in D81) (422 otherwise). Staff read the places in use of every site, without codes.
- BR-LOC10: A list filter on a place (`location=<id>`) matches the place and everything below it.

### Level types
- BR-LT1: Only admins write level types. A token used by a code pattern cannot change (422). A type in use by places can be taken out of use: those places keep it, and new places cannot take it.

### Asset types
- BR-AT1: Abbreviations are stored in capitals and are unique (409).
- BR-AT2: An asset with a type has the type's trade. The server sets `category` from the type, and sending a different one → 422. An asset may have no type. Its code then follows the default pattern with `{TYPE}` empty.
- BR-AT3: Asset types are never deleted, only taken out of use. A type out of use is not offered for new assets, and existing assets keep it.

### Asset codes
- BR-C1: A pattern has literal characters `A-Z`, `0-9` and `-`, plus tokens: `{TYPE}` (the type's abbreviation), `{<level token>}` (the code of the closest place of that level type, the place itself or above it: `{SITE}`, `{BUILDING}`, `{FLOOR}`), and exactly one **`{SEQ:n}`** (n from 1 to 6), which must come **last**. Anything else → 400 with the position of the error.
- BR-C2: A token without a value gives an empty string (C3). This covers no place of that level above, a place without a code, and an asset without a type.
- BR-C3: The prefix is the pattern with its tokens replaced, up to `{SEQ:n}`. The number is 1 plus the highest number among the codes that are this prefix followed by digits only, written with at least n digits (`AHU201` + `10`). Gaps are not filled: a code taken out by a recode or a deletion is not handed out again.
- BR-C4: The pattern used is the asset type's own, otherwise the default one.
- BR-C5: The form asks for a proposal (`GET /api/assets/next-code`) and shows it in the code field, which stays editable. A code left empty at creation is computed by the server **inside the creation transaction**, so two creations at once never get the same code. A typed or proposed code that has been taken in the meantime → 409 as today (BR-A4), and the form fetches a new proposal.
- BR-C6: Only admins recode an asset (`PUT /api/admin/assets/:id/code`, with the version they saw): same format and uniqueness as BR-A4, and the old and new codes go in the audit log. The version goes up, so caches fetch the asset again. BR-A1 becomes "unique, and changed only by an admin recode".

## 6. API

| Endpoint | Roles | Purpose |
|---|---|---|
| `GET /api/locations` | every role | The whole tree as a flat list `[{ id, parent_id, site_id, level_type_id, name, code, is_active }]` with the level types. Not paginated, and cached on the device (section 7). Staff get the places in use, without `code`. Replaces `GET /api/rooms`. |
| `POST /api/admin/locations`, `GET/PUT /api/admin/locations/:id` | SUPERVISOR, ADMIN (sites: ADMIN, BR-LOC6) | Create, read and change a place: name, type, code, parent (move, BR-LOC4), in use. Replaces `/api/admin/rooms`. |
| `GET/POST /api/admin/level-types`, `PUT /api/admin/level-types/:id` | ADMIN (read: SUPERVISOR too) | Level types. |
| `GET /api/asset-types` | ADMIN, SUPERVISOR, TECHNICIAN | Asset types for the forms and filters. |
| `POST /api/admin/asset-types`, `PUT /api/admin/asset-types/:id` | ADMIN | Asset types, abbreviation and own pattern. |
| `GET/PUT /api/admin/asset-code-settings` | ADMIN | The default pattern. |
| `GET /api/assets/next-code?location_id=&asset_type_id=` | SUPERVISOR, ADMIN | `{ code, pattern, empty_tokens: ["FLOOR"] }`: the proposal and the tokens that gave nothing, so the form can say "no floor code". |
| `PUT /api/admin/assets/:id/code` | ADMIN | Recode (BR-C6). Body `{ code, version }`. |

Changed shapes: `Asset`, `WorkOrder`, `Plan` and the list rows carry `location_id` and **`place`**, the path below the site joined with " › " ("Tower A › B1 › Plant room 2"), so a list renders without the tree. Assets also carry `asset_type: { id, name, abbreviation } | null` instead of `subcategory`. The `building` filter of the plans, the planner and the balancing assistant becomes `location` (BR-LOC10). The planner's `group_by=building` becomes `group_by=area`: the place's first level under the site, whatever its type (a building, a data center hall).

Search: the full-text index of assets, work orders and plans gets the place path in place of `building`, kept up to date when a place is renamed or moved (the rows of its subtree are reindexed in the same transaction).

## 7. Interface

- **Places page** (`/admin/locations`, supervisors and admins, online only; replaces the Rooms page): a tree per site that folds and unfolds, a search that shows the matching places with their path, an "In use / All" filter, **+ New place** under the selected place, and a side panel with name, level type, code, parent (Move…, limited to the same site) and an "In use" checkbox. Admins also get **+ New site**.
- **Settings for admins**: Level types (name, token, offered to staff, in use), Asset types (name, trade, abbreviation, own pattern, in use) and Asset codes (default pattern, with a live example built from a place and a type the admin chooses).
- **Place picker**, one component for every form: a search field ("12.02" finds "Tower A › L12 › Meeting room 12.02") plus a drill-down from the site, one level at a time, with "Not in the list" for staff. It reads the cached tree, so it **works offline**. This improves on D81, where the request form needed the network to load the rooms.
- **Asset form**: Site, then place, then Trade, then Type (filtered on the trade), then Code. Once the place and type are chosen, Code is filled with the proposal and a hint ("Proposed from AHU{BUILDING}{FLOOR}{SEQ:2}; no floor code"). The user may change it. Admins get **Change code** in the asset panel.
- **Displays**: "site · place" wherever "site · building" or "building · floor · exact location" is shown today, and the details after " — " as for rooms.
- **Offline**: the tree and the asset types are stored in the `config` store with the reference data and fetched again with it. A work order's place can be changed offline. It is a versioned field: queue, conflicts and console as for the other fields. This replaces the read-only `room_id` of D81.

## 8. Permissions

| Action | Staff | Technician | Supervisor | Admin |
|---|---|---|---|---|
| Read places | in use, no codes | yes | yes | yes |
| Create, change, move places | – | – | yes (not sites) | yes |
| Sites, level types, asset types, default pattern | – | – | read | yes |
| Asset code proposal | – | – | yes | yes |
| Recode an asset | – | – | – | yes |

## 9. Migration of the existing data

One migration, which can be tested on a copy of the demo database:

1. Create the level types Site, Building, Floor and Room (offered to staff).
2. Each distinct `site` (assets, work orders, plans, rooms, users) becomes a site. Each distinct (site, building) becomes a Building, and each (site, building, floor) a Floor under it. Each room of `rooms` becomes a Room under its floor, keeping `is_active`. Codes are left empty, for the admins to fill in.
3. Assets point to the deepest place their columns give (floor, else building, else site). `exact_location` is kept as is.
4. Work orders: an asset's place when they have one, else their `room_id`'s place, else their site. `location` is kept as is.
5. Plans: the asset's place, else their building, else their site.
6. Each distinct (category, subcategory) of the assets becomes an asset type, with an abbreviation made from the initials of its words (`Air handling unit` → `AHU`), made unique with a digit when needed. The admins check the abbreviations after the update. Assets without a subcategory get no type.
7. Codes do not change, and the default pattern is `AST-{SEQ:4}`.
8. The columns are removed and `rooms` is dropped. The search indexes are rebuilt.

The seed builds the demo tree directly, with codes on the buildings and floors of two sites, about 25 asset types with their abbreviations, and a default pattern of `{TYPE}{BUILDING}{FLOOR}{SEQ:2}`, so new demo assets show proposals like `AHU20110`. Seeded codes keep their current form.

## 10. Effects on the import tools (backlog item 14)

The import names a place by its **path** ("Paris La Défense HQ/Tower A/B1/Plant room 2"). A places import creates the missing levels, with a level type per column or per line, and the assets import refers to that path and to the type's **abbreviation**. A code left empty in an imported asset gets the proposal (BR-C5), in file order. Order: level types, asset types, places, users, assets, plans.

## 11. Phases and acceptance

- **Phase 32: location tree.** Tables `level_types` and `locations`, the migration of section 9, `location_id` on assets, work orders and plans, the place endpoints, the Places page, the place picker in every form (requests included, offline), the `place` field in lists and panels, the `location` filter and `group_by=area`, the search on paths. Acceptance:
  - After the migration, every asset, work order and plan of the demo database shows the same site, building, floor, room and details as before, as a path.
  - Moving "L12" from Tower A to Tower B changes the path of its rooms and of their records, without writing those records.
  - A place cannot move to another site or into its own subtree (422), and a 9th level is refused (422).
  - Taking a floor out of use removes its rooms from the request form. Their old requests keep them, and a new record cannot name them (422).
  - Offline, a staff member picks a room and sends the request, and it syncs with its place.
  - A work order whose place was changed offline by two people gives a conflict on `location_id`.
  - The location filter on a building lists the assets of its floors and rooms.
  - A site that is in use cannot be renamed (409).
- **Phase 33: asset types and codes.** Tables `asset_types` and `asset_code_settings`, the migration of subcategories, the type on assets and in filters, the pattern rules and the proposal, the settings pages, the admin recode. Acceptance:
  - With the default pattern `AST-{SEQ:4}`, creation gives the same codes as today.
  - With `{TYPE}{BUILDING}{FLOOR}{SEQ:2}`, an AHU in a place with building code `2` and floor code `01`, where `AHU20109` exists, is proposed `AHU20110`. With no floor code, the proposal is `AHU201` + the next number, and `empty_tokens` lists `FLOOR`.
  - Two creations at once with an empty code get two different codes.
  - A pattern with `{SEQ}` in the middle, two `{SEQ}`, or an unknown token is refused (400).
  - An asset type's own pattern wins over the default one.
  - An admin recodes an asset: the audit log has both codes, a supervisor gets 403, a code already used gets 409, and a stale version gets 409.
  - A type of another trade than the asset's is refused (422).

## 12. Further choices (confirmed by the product owner, 2026-10-14)

1. **Asset place on work orders and plans** (BR-LOC8): with an asset, the work order's place is the asset's, and only the details are free. The alternative is to let a work order name another place of the same site, for a problem near the asset rather than on it.
2. **Renaming a site** (BR-LOC6) is refused once records name it, because `site` is copied into them. The alternative is a rename by an admin that rewrites every copy (records, users, blocked weeks, dashboard filters) in one transaction.
3. **At most 8 levels** (BR-LOC3).
4. **Codes not reused** (BR-C3): a code given up by a recode is never proposed again. It can still be typed by hand.
5. **`group_by=area`** in the year planner: the first level under the site stands for "building".
6. **Order of places**: by name in natural order with the floor rule, with no manual ordering.
7. **Only admins create sites** (BR-LOC6), while supervisors create every other place.
8. **A work order's place is editable** by the team, offline included (versioned, conflicts), unlike the read-only room of D81.
