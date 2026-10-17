# Changelog

One entry per release, newest first, written from the conventional commits since the previous tag (`git log --oneline v1.0.0..HEAD`). Each release is a git tag `vX.Y.Z`; the server runs a tag, not `main` (README → Operations). Versions follow semantic versioning: a new migration or an API change that the previous frontend cannot use is at least a minor version.

## Unreleased

### Added

- French interface (Phase 34, D85): flags at the end of the top bar and on the login page switch the whole interface between English and French; the choice is kept on the device (it survives logging out), and a first visit follows the browser's language. Labels, messages, tooltips, enum values and the API's error messages are translated with the vocabulary of the original French brief (équipement, bon de travaux, demande d'intervention, domaine technique, compte rendu…); dates and numbers follow the French format. Content typed by users is not translated. When the top bar is narrow (under 960 px), "Find a work order" and "Suggest an improvement" show their icon only, and on small phones the pager shows only its arrows.
- Location tree (Phase 32, D82, D83): sites, buildings, floors, rooms and any other level an admin defines, as one tree per site. Assets, work orders and plans point to a place, shown as its path ("Tower A › B1"); the site follows the place. One place picker in every form, with a search on the paths, that works offline. The Places page (`/admin/locations`) replaces the Rooms page: a folding tree with search, moves within a site, places taken out of use with their branch, and the level types for admins. Lists filter by a place and everything below it (`location=`), the search finds the names of the places, and the year planner groups by area.
- Room list (D81): staff pick the building, floor and room of a request, or "Not in the list" and describe the place; supervisors and admins keep the list on the new Rooms page (`/admin/rooms`). The room is shown on the request and in the work order panel.
- Requests waiting for a reply (D80): when the requester wrote the latest comment, the request is counted on a dashboard tile (supervisors and admins: a new widget, in the Overview template, for all requests; technicians: those assigned to them), listed by the new filter "Waiting for a reply" (`awaiting_reply=true`), and the work order panel says that the requester is waiting for a reply.
- A staff member can cancel their own request until work starts, whether it waits for review or was approved (D79). The maintenance team sees the new review status Withdrawn; the staff request widget does not count a request withdrawn before its review as reviewed.

### Upgrade notes

- Migration `015_locations.sql` (D82) moves every site, building, floor and room of the data into the location tree, then rebuilds `assets`, `work_orders` and `maintenance_plans` without `building`, `floor` and `room_id`, and drops `rooms`; the service takes a backup first (D74). The API takes `location_id` instead of `building`, `floor` and `room_id` (`site` alone still means the site itself): clients from before cannot write places. `GET /api/rooms` and `/api/admin/rooms` are replaced by `GET /api/locations`, `/api/admin/locations` and `/api/admin/level-types`. Codes on the places are left empty, for the admins to fill in (Phase 33).
- Migration `014_rooms.sql` adds the `rooms` table and `work_orders.room_id`; the room list starts empty in production: supervisors or admins fill it on the Rooms page (bulk import is backlog item 14).
- Migration `013_request_withdrawal.sql` rebuilds the `work_orders` table; the service takes a backup before applying it (D74).

### Documentation

- Showcase (`docs/showcase.md`, D84): every feature, role by role, in 44 pictures, taken by `npm run docs:screenshots` with the README ones.
- Screenshots of the main screens in the README, and diagrams of the tables, work order statuses, sync queue, staff requests and conflicts (D78).

## 1.1.0 — 2026-10-14

### Added

- Monitoring and alerts (Phase 29, D75): a failure of the API, the backup, the off-server copy or the preventive release is pushed to an ntfy topic; a dead man's switch is pinged after each nightly backup; a warning when the disk holding the database or the backups is 80 % full; an external uptime check of `/api/health`; a silence for planned maintenance.
- Security process (Phase 30, D76): `SECURITY.md` (private reporting through GitHub, supported version, response times), Dependabot for npm and GitHub Actions, and a monthly maintenance routine (README → Maintenance).

### Maintenance

- 2026-10 routine (the first): `npm audit` reports no vulnerability in either package. Updated within the current ranges: express 5.3.0, express-rate-limit 8.7.1, zod 4.6.7 (backend); vitest 5.0.4, prettier 3.9.10 (both packages). Vendored idb 8.0.3 → 8.0.4 (internal changes only, same API); Chart.js 4.5.1 is the latest.

### Upgrade notes

- Create `/etc/tacto/notify.env` and the external checks (README → Deployment, step 3, Alerts), copy the four new units and the four changed ones (`tacto`, `tacto-backup`, `tacto-offsite-backup`, `tacto-pm-release`) to `/etc/systemd/system/`, then `sudo systemctl daemon-reload && sudo systemctl enable --now tacto-disk-check.timer`.

## 1.0.0 — 2026-10-14

First release. It includes everything built since the project started (Phases 0 to 24, 26 and 27 of `docs/roadmap.md`).

### Added

- Assets and work orders: fast local-first browsing from IndexedDB, offline use with a sync queue, full-text search, filters with multiple selection, table sort, history and audit log.
- Work order creation and editing with save modes; version conflicts with a supervisor conflict console.
- Asset creation and deletion (assets without work orders only).
- Staff requests (`STAFF` role) with supervisor review (D46, D47).
- Preventive maintenance: maintenance plans, the year planner and its editing, the week scheduler and My week, the balancing assistant, undo and redo, the daily release of preventive work orders (D48–D55).
- Dashboards: dashboard by role, personal dashboards for supervisors and admins, flow, backlog, compliance, responsiveness, asset and people widgets with drill-down, widgets switched on or off by administrators, demo data with history (D59–D65).
- "Find a work order" from the top bar, without an AI model yet (Phase 26, D67).
- User administration, and a command to create the first administrator (D39, D70).
- "Suggest an improvement" on every page (D40).
- Phones and desktop layouts (D68, D69).
- Deployment files: systemd units, Nginx, nightly backups with an off-server copy by restic, timers in the app's time zone (D71, D72).
- Continuous integration: lint and tests of both packages on every push and pull request (Phase 27).
- A backup is written before pending migrations are applied, at start or by any database command (Phase 28).

### Changed

- Renamed from Fast-CMMS to Tacto (D58); licensed under the GNU AGPL v3 or later (D57).
