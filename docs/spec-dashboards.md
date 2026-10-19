# Custom Dashboards and Supervisor KPIs: Specification

Status: **specified** (product owner discussion, 2026-10-12; decision D59); **Phases 21 to 24 are implemented** (D60 to D63 list where they complete or depart from this file). Phases 21 to 24 in `docs/roadmap.md`. As each phase is implemented, its tables, endpoints and screens move into `docs/data-model.md`, `docs/api-design.md`, `docs/architecture.md` and `docs/ui-guidelines.md`, which then prevail over this file.

## 1. Goals

Supervisors and administrators need more than the seven tiles and two charts of the home dashboard to answer their weekly questions: *are we keeping up, what is getting old, are we planned or reacting, are we compliant, where do problems come back, who is overloaded*. They don't all need the same answers, nor all of them in one place.

So:

- A **catalogue of widgets** (the current tiles, charts and lists, plus the 15 KPI widgets of section 6).
- Each supervisor or admin builds **their own dashboards**: named, several of them, each with the widgets they choose, arranged by **drag and drop**, with their own filters (period, sites, trades).
- Every widget can be **exported**: its figures and the work orders behind it as **CSV**, the widget as a **JPG image**.

Technicians keep their fixed dashboard (D43): it is about their own work. Staff have none.

Non-goals: dashboards shared between users (later, see section 10), free resizing of widgets, user-defined formulas, scheduled e-mail reports, PDF export, comparison with external benchmarks.

## 2. Research basis

The KPI choice comes from published maintenance-management guidance (SMRP and EN 15341 indicator families, as summarized by secondary sources, and CMMS vendor guides). Two points shaped the design:

- The **numeric targets** quoted online ("85 % planned work", "4–6 weeks of backlog") are inconsistent and often untraceable to a primary source. Widgets therefore show **trends over time** and the team's own history; the only reference band (backlog in weeks) is labelled as a rule of thumb.
- The design pattern sources agree on: a summary first, then **every figure drills down to the work orders behind it**; backlog shown **by age crossed with priority** rather than as one total; a weekly **opened vs closed** trend as the early warning of missing capacity.

## 3. Decisions taken with the product owner

| # | Topic | Decision |
|---|---|---|
| K1 | Who | Supervisors and administrators. Technicians keep their fixed dashboard; staff have none. |
| K2 | Ownership | Dashboards are **personal**: only their owner sees and changes them. A user without one gets an "Overview" dashboard created with the widgets of today's home dashboard. |
| K3 | Several dashboards | A user creates, names, renames, reorders and deletes their dashboards (at least one remains, at most 20). They are listed in the **sidebar**. |
| K4 | Choosing widgets | When a dashboard is shown, the sidebar lists **every widget of the catalogue with a checkbox**: checked = on this dashboard. |
| K5 | Arranging | Widgets are rearranged by **drag and drop** (mouse, touch, and keyboard). |
| K6 | CSV export | Two exports per widget: **Figures (CSV)**, the values drawn (the widget's table view), and **Work orders (CSV)**, the records behind the widget (assets for the asset widgets). |
| K7 | Image export | **Image (JPG)** of any widget, on a white background, with its title, filters and the date. |
| K8 | Filters | Each dashboard has its own filters: **period** (30, 90 or 365 days), **sites** and **trades**. They apply to every widget that can use them; a widget says when a filter does not apply ("Current backlog, period not used"). |
| K9 | Drill-down | Every bar, cell, slice, point and tile opens the work order list (or asset list) showing exactly the records counted. |

## 4. Data model

### dashboards (new table)

| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| user_id | INTEGER | no | FK → users.id | owner |
| name | TEXT | no | 1–60 characters, trimmed | unique per user, case-insensitive (`UNIQUE (user_id, name COLLATE NOCASE)`) |
| position | INTEGER | no | | order in the sidebar |
| widgets | TEXT | no | JSON array, default `[]` | `[{ "key": "backlog_age", "options": {} }, …]` in display order; each key at most once; keys and options validated by the API against the catalogue |
| filters | TEXT | no | JSON object, default `{}` | `{ "period": 30 \| 90 \| 365, "sites": [string], "categories": [Category] }` |
| version | INTEGER | no | default 1 | optimistic check: 409 when stale (no conflict console: one owner) |
| created_at / updated_at | TEXT | no | | |

Index: (`user_id`, `position`). Not in the audit log (personal preferences, like capacity overrides). A deactivated user's dashboards are kept.

No other table changes: every KPI is computed from existing columns, `plan_occurrences`, `allocations` and `audit_log` (status change timestamps).

## 5. API

Maintenance roles SUPERVISOR and ADMIN (technicians and staff: 403). A dashboard of another user answers 404.

| Endpoint | Purpose |
|---|---|
| `GET /api/dashboards` | My dashboards in order: `{ items: [{ id, name, position, widgets, filters, version }] }`. Creates "Overview" (K2) when I have none. |
| `POST /api/dashboards` | `{ name, template?: "OVERVIEW" \| "BACKLOG" \| "COMPLIANCE" \| "ASSETS_PEOPLE" \| "EMPTY", copy_of?: id }` → 201. 409 name used, 409 limit of 20. |
| `PUT /api/dashboards/:id` | `{ version, name?, widgets?, filters? }` → 200 with the record. 409 stale version or name used; 400 unknown widget key, duplicate key, invalid options or filters. |
| `PUT /api/dashboards/order` | `{ ids: [id, …] }` (all of mine, new order) → 204. |
| `DELETE /api/dashboards/:id?version=N` | 204. 409 when it is my last one. |
| `GET /api/dashboard/widgets?keys=a,b&period=&site=&category=` | The data of the listed widgets only: `{ today, generated_at, widgets: { key: data } }`. A widget not allowed for the role is left out. |
| `GET /api/dashboard/widgets/:key/rows?segment=&period=&site=&category=` | The records behind a widget or one of its segments (bar, cell…), for the CSV export: `{ items, total, truncated }`, at most 5,000. |
| `GET /api/work-orders?drill=<key>:<segment>&period=&…` | The work order list filtered by a widget segment (K9); the list shows "From dashboard: <widget> — <segment>" as a removable filter. Same definition as `rows`, one service function for both. |

`GET /api/dashboard` (technicians' dashboard and the tiles) stays as it is.

## 6. Widget catalogue

Sizes on a 4-column grid: **S** = 1 column (tile), **M** = 2 columns, **L** = 4 columns. Below 1024 px the grid has 2 columns (L = 2), below 768 px 1 column.

"Period" means the dashboard's period; "sites" and "trades" its filters. "Today" uses `APP_TIMEZONE`. Unfinished = `OPEN`, `IN_PROGRESS`, `ON_HOLD`.

### 6.1 Existing widgets (ported, Phase 21)

| Key | Widget | Size | Notes |
|---|---|---|---|
| `open_work_orders`, `in_progress_work_orders`, `closed_this_month`, `overdue_work_orders`, `assets_broken_down`, `requests_to_review`, `requests_awaiting_reply` (D80), `pending_conflicts` | the eight current tiles | S | same definitions (`docs/data-model.md` → KPI definitions); sites and trades apply, period does not |
| `by_category` | Work orders by category | M | period, sites |
| `by_status` | Work orders by status | M | period, sites, trades |
| `my_work` | My work | M | no filter |
| `recent_activity` | Recent activity | M | sites, trades |

### 6.2 Flow and backlog (Phase 22)

**`opened_vs_closed` — Opened vs closed (L).** Per ISO week (period 30 or 90) or per month (365): work orders created (`created_on`), closed (`CLOSED`, `closed_on`) and cancelled (date of the `CANCELLED` status change in `audit_log`); a line gives the number unfinished at the end of each bucket. Paired bars (opened, closed), line on top. Drill: a bar → the work orders opened, or closed, in that week.

**`backlog_age` — Backlog by age and priority (M).** Unfinished work orders, age = today − `created_on`, columns 0–7, 8–30, 31–90, 91+ days, rows Urgent → Low, cell = count. An HTML table coloured by count (it is its own table view). The cells Urgent or High × 31+ use the attention style when not empty. Period not used. Drill: a cell.

**`backlog_weeks` — Backlog in weeks of work, by trade (M).** Per trade: hours left on unfinished work orders (`estimated_hours` minus the hours of their `WORK` blocks on days before today, never below 0) ÷ the trade's weekly capacity (the planner's capacity, before the corrective reserve). Horizontal bars with a shaded band at 2–4 weeks labelled "Rule of thumb". A line under the chart counts the unfinished work orders without an estimate (not included). Work orders without a trade are listed as hours only. Period not used. Drill: a trade → its unfinished work.

**`planned_vs_reactive` — Planned vs reactive work (M).** Work orders closed in the period, per week or month, as 100 % stacked bars: Planned (Preventive + Regulatory), Reactive (Corrective from the team), Staff requests (Corrective with a `review_status`), Improvement. Option `basis`: work orders (default) or actual hours. Drill: a segment.

### 6.3 Compliance (Phase 23)

**`pm_compliance` — Preventive maintenance compliance (M).** Released visits whose deadline week ended within the period. Deadline = planned `week` + `tolerance_weeks` (a regulatory visit: its `due_week`). On time = its work order `CLOSED` by the Sunday of the deadline week; late = closed later or still unfinished. Compliance = on time ÷ (on time + late). Skipped visits are counted apart, with their reason in the rows. Overall % in big figures, then a bar per trade. Drill: late visits of a trade.

**`regulatory_late` — Regulatory visits late (S).** Released regulatory visits past their due week and not closed, today. Attention style above zero. Period not used. Drill: those work orders.

**`schedule_compliance` — Week schedule kept (M).** For each finished week of the period: the work orders with `WORK` blocks in that week and that week as `planned_week`; kept = `CLOSED` by the Sunday. A bar per week (%), and the break-in share: hours of blocks of the week created after its Monday 00:00. Drill: the week's work orders not finished.

**`contractor_scorecard` — Contractors (M).** Per supplier of contractor plans: visits due in the period, on time, late, skipped, % on time. A table (sortable by column). Drill: a supplier → its late visits.

### 6.4 Responsiveness, assets and people (Phase 24)

**`response_times` — Time to start and to close, by priority (M).** From the status changes in `audit_log`: created → first `IN_PROGRESS`, and created → `CLOSED`, for work orders started (or closed) in the period. **Median and 90th percentile** per priority (not the mean: a few old work orders would distort it), in hours under 48 h, otherwise in days; the count beside each. Dot plot, one row per priority. Drill: a priority → the slowest first.

**`request_service` — Staff requests (M).** Requests created in the period: median time to review (`created_at` → `reviewed_at`), median time to done, share rejected, count. Three figures with a weekly sparkline. Drill: rejected requests with their reason.

**`sla_compliance` — Service levels met (M, D86, Phase 36).** Per priority, response and resolution met ÷ counted, each clock on its own: those that stopped in the period, plus those still running and already late; work reported from `sla_settings.measured_from` on (BR-SLA1). A summary sentence and the table (no chart: eight figures). Drill: `response` or `resolution`, optionally `:<PRIORITY>`; the export adds the outcome of each clock, missed first. Not in a template: added from the sidebar.

**`bad_actors` — Assets with the most breakdowns (M).** Corrective work orders (not cancelled) linked to an asset, created in the period, grouped by asset: the 10 assets with the most, as bars, with the cumulative share of all corrective work. Option `critical_only` (High and Critical assets). Drill: an asset → its panel and history.

**`repeat_failures` — Repeat failures (S).** Corrective work orders created in the period on an asset whose previous corrective work order was closed less than 30 days before. Count and share of the period's corrective work orders on assets. Stand-in for the first-time fix rate, which the data cannot measure. Drill: the pairs (rows give both numbers).

**`critical_downtime` — Critical assets out of service (M).** High and Critical assets: days spent `BROKEN_DOWN` within the period (asset status changes in `audit_log`; a breakdown still going on counts until today), summed per site, with the count down today. Drill: a site → its assets with their days down (asset rows).

**`workload` — Workload per person (L).** Each active technician and supervisor (and "Unassigned"): unfinished work orders assigned, stacked by priority (one fixed color per priority), with the estimated hours left and this week's booked hours vs capacity from the week scheduler. Period not used. Drill: a person → their unfinished work.

**`estimate_accuracy` — Estimates vs actual hours (M).** Work orders closed in the period with both hours above 0: per trade, total actual ÷ total estimated (1.0 = exact), with the count. Bars around a line at 1.0. Drill: a trade → the biggest overruns first.

### 6.5 Templates

| Template | Widgets |
|---|---|
| Overview | the 8 tiles (`requests_awaiting_reply` added by D80), `by_category`, `by_status`, `my_work`, `recent_activity` (today's dashboard) |
| Backlog | `overdue_work_orders`, `opened_vs_closed`, `backlog_age`, `backlog_weeks`, `workload` |
| Compliance | `regulatory_late`, `pm_compliance`, `schedule_compliance`, `planned_vs_reactive`, `contractor_scorecard` |
| Assets and people | `assets_broken_down`, `repeat_failures`, `bad_actors`, `critical_downtime`, `response_times`, `estimate_accuracy`, `request_service` |

## 7. Screens

### Sidebar

- Under **Dashboards**: my dashboards in order (links), the current one marked (`aria-current="page"`), then **+ New dashboard**.
- On a dashboard page, a **Widgets** section follows: the catalogue grouped by theme (Key figures, Flow and backlog, Compliance, Responsiveness, Assets, People), one checkbox per widget with its name. Checking adds the widget at the end of the dashboard, scrolls to it and announces it; unchecking removes it. The checkboxes are `.online-only`.
- Below 1024 px the sidebar is the overlay of today: checking a box does not close it (only choosing a page does).

### Dashboard page (`/dashboard`, `/dashboard/:id`)

- `/dashboard` shows my first dashboard; `/dashboard/:id` a given one. Technicians keep their fixed page at `/dashboard`.
- Header: the dashboard name, the **filters** (period segmented control 30 / 90 / 365 days, sites and trades as the multi-select dropdowns of the lists), and a menu: Rename, Duplicate, Move up / Move down in the sidebar, Delete (with confirmation).
- The widgets in a grid. Each widget card has a **drag handle** (⠿, a button named "Move <widget>"), its title and the filters that apply, and a **⋯ menu**: Open the list, Figures (CSV), Work orders (CSV), Image (JPG), Move earlier, Move later, Remove from dashboard.
- An empty dashboard says "No widget yet: tick widgets in the sidebar."

### Drag and drop

- Pointer (mouse and touch): press the handle and drag; the other widgets make room live and a placeholder shows where the card will land; drop saves the order. `touch-action: none` on the handle only, so the page still scrolls.
- Keyboard: on the handle, Space picks the card up, arrow keys move it (in reading order), Space drops it, Escape cancels; each step is announced in the live region ("Backlog by age, position 3 of 8"). Move earlier / Move later in the menu do the same in one step.
- The new order is saved at once (`PUT` with the version). A 409 reloads the dashboard and says so. Offline, the handle and the menu actions that change the dashboard are disabled.

### Exports

- **Figures (CSV)**: exactly the widget's table view ("Show as a table"): one source builds the table, the CSV and the image of table widgets. Labels, not codes.
- **Work orders (CSV)**: the rows behind the widget (or the segment the user is on) from `…/rows`: number, title, type, status, priority, category, site, asset code, assignee, created, due, started, closed, estimated and actual hours, plus the widget's own columns (age, deadline week, days down…). Asset widgets export assets. Above 5,000 rows the file holds the first 5,000 and the message says so. Online only.
- CSV format: UTF-8 with BOM (Excel opens accents correctly), comma separator, CRLF, RFC 4180 quoting; a cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'` (formula injection: titles and locations are typed by staff).
- **Image (JPG)**: 1,200 px wide at 2× pixel density, white background, the widget's title, the filters and period, and a footer "Tacto · <dashboard name> · <date and time>". Chart widgets copy their Chart.js canvas; tiles and table widgets are drawn by a small canvas painter (no new library). Always the light colors.
- File names: `tacto-<dashboard>-<widget>-<YYYY-MM-DD>.csv|jpg` (lowercase, hyphens).
- Figures (CSV) and Image (JPG) also work offline, from the cached figures.

### Offline

The dashboards list and the last data of each dashboard are kept in IndexedDB (`config`, like `dashboard_cache`) and shown with the usual "Offline: figures saved on this device on <date>" banner. Changing dashboards needs a connection.

## 8. Rules

- BR-K1: A dashboard belongs to one user; every endpoint checks the owner (404 otherwise).
- BR-K2: A user has between 1 and 20 dashboards; names are unique per user, ignoring case.
- BR-K3: A widget key appears at most once on a dashboard; unknown keys and options are refused (400). A widget the role cannot see (none today) is skipped when shown.
- BR-K4: Every figure is reproducible: the drill-down list and the Work orders CSV of a segment hold exactly the records counted in it.
- BR-K5: Widget computations are pure functions in `rules/kpi.js` (or `rules/kpi-*.js`), unit-tested on hand-made data, including week and month boundaries in `APP_TIMEZONE` and the median and 90th percentile.

## 9. Performance

`GET /api/dashboard/widgets` computes only the widgets shown, in one read transaction: under 300 ms for the "Assets and people" template on the demo data, under 50 ms per widget. Chart.js stays loaded on demand. The page draws the cached figures first, then the fresh ones (no flash).

## 10. Later (not in these phases)

Shared or team dashboards published by an administrator; targets per KPI set by the administrators (dashed line on the charts); per-widget filters; resizing widgets; exporting a whole dashboard (one image, or a ZIP of CSV files); failure and cause codes, an "on hold" reason and downtime hours on work orders, which would allow true MTTR/MTBF and a better bad-actor analysis; cost KPIs.

## 11. Phases and acceptance

- **Phase 21: custom dashboards.** Table and API (section 4–5), sidebar list and widget checkboxes, drag and drop with the keyboard alternative, dashboard filters, the 11 existing widgets ported with their three exports, templates, offline reading. Acceptance: a supervisor without dashboards gets "Overview" identical to today's dashboard; they create "Saclay" from the empty template, tick four widgets, set the site to Saclay Data Center, drag the last widget first with the mouse and move another with the keyboard, and find the same layout after reloading and on another browser; another supervisor gets 404 on that dashboard; a technician's dashboard has not changed; the Figures CSV of "Work orders by category" opens in a spreadsheet with accents intact and equals the table view; a title starting with `=` is exported as text; the JPG of the status pie shows the title, the filters and the date; offline, the dashboard shows the saved figures and the checkboxes and handles are disabled.
- **Phase 22: flow and backlog** (`opened_vs_closed`, `backlog_age`, `backlog_weeks`, `planned_vs_reactive`, and the `drill` list filter). Acceptance: on a hand-made dataset every figure equals a hand-computed value; each segment's list and Work orders CSV hold exactly the counted records (BR-K4); week buckets follow ISO weeks in `APP_TIMEZONE`.
- **Phase 23: compliance** (`pm_compliance`, `regulatory_late`, `schedule_compliance`, `contractor_scorecard`). Acceptance: a visit closed on the Sunday of its deadline week is on time, the Monday after is late; a regulatory visit uses its due week; skipped visits are counted apart; the figures equal hand-computed values.
- **Phase 24: responsiveness, assets and people** (`response_times`, `request_service`, `bad_actors`, `repeat_failures`, `critical_downtime`, `workload`, `estimate_accuracy`). Acceptance: median and 90th percentile match hand-computed values (odd and even counts); a breakdown still going on counts until today; a repeat failure at 29 days counts and at 31 days does not; the "Assets and people" template loads within the budget of section 9.
