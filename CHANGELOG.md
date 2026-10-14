# Changelog

One entry per release, newest first, written from the conventional commits since the previous tag (`git log --oneline v1.0.0..HEAD`). Each release is a git tag `vX.Y.Z`; the server runs a tag, not `main` (README → Operations). Versions follow semantic versioning: a new migration or an API change that the previous frontend cannot use is at least a minor version.

## Unreleased

### Added

- A staff member can cancel their own request until work starts, whether it waits for review or was approved (D79). The maintenance team sees the new review status Withdrawn; the staff request widget does not count a request withdrawn before its review as reviewed.

### Upgrade notes

- Migration `013_request_withdrawal.sql` rebuilds the `work_orders` table; the service takes a backup before applying it (D74).

### Documentation

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
