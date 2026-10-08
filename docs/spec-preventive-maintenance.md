# Preventive Maintenance: Specification

Status: **specified and confirmed, not implemented** (product owner discussion, 2026-10-08; decision D48). Phases 17 to 20 in `docs/roadmap-mvp.md`. When a phase is implemented, the parts of this document it covers move into `docs/data-model.md`, `docs/api-design.md`, `docs/architecture.md` and `docs/ui-guidelines.md`, like every other feature, and this file keeps only what is still to build.

## 1. Goals

Maintenance teams struggle most with **balancing the load across the year**: too much work in some weeks, nothing in others, one trade overloaded while another waits, technicians crossing between sites in the same day. The tool answers this at two levels, which are kept apart on purpose:

| | **Year planner** | **Week scheduler** |
|---|---|---|
| Question | Is the year balanced? | Who does what, which day, this week? |
| Grid | 52 weeks × maintenance plans | Days × technicians |
| Items | Plan occurrences (a week, no day) | Day allocations of work orders, plus travel, preparation and other time |
| Balanced against | Weekly capacity per trade and per site | Each technician's daily capacity (7 h by default) |
| Used | A few times a year, then adjustments | Every week, and during the week |
| Who | Supervisors and admins | Supervisors and admins; technicians see and organize their own days |

The **link between them** is the work order: the year planner creates the preventive work orders of each week, and they land in that week's **"to schedule" tray** in the week scheduler, next to corrective work and approved staff requests.

Non-goals for these phases: clock-time agendas (except locked appointments), automatic dispatching, route optimization, a site-to-site travel time table (backlog), contractor portals, spare parts.

## 2. Vocabulary

| Term | Meaning | Identifier |
|---|---|---|
| maintenance plan | A recurring preventive task: what, where, which trade, how long, how often | `maintenance_plans`, code `PM-0001` |
| occurrence | One visit of a plan in a given week | `plan_occurrences` |
| due week | The week the series puts an occurrence in | `due_week` |
| planned week | The week the occurrence is actually planned in (the due week unless moved) | `week` |
| anchor week | Week of the first occurrence; moving it moves the whole series | `anchor_week` |
| tolerance | How many weeks one occurrence may move away from its due week | `tolerance_weeks` |
| release | Creating the work order of an occurrence, some weeks ahead | `RELEASED` |
| allocation | A block of hours of one technician on one day | `allocations` |
| appointment | An allocation locked at a clock time | `locked_start` |
| capacity | Hours a technician can work on a day (7 h by default) | `capacity_overrides` |

Weeks are **ISO weeks** (Monday to Sunday), written `YYYY-Www` (`2026-W23`), in `APP_TIMEZONE`. Some years have 53 ISO weeks (2026 does): frequencies are counted in weeks, so they simply run through week 53.

## 3. Decisions taken with the product owner

| # | Topic | Decision |
|---|---|---|
| P1 | Two levels | Year planner (weeks) and week scheduler (days × technicians) are separate screens. Balance first by week, then schedule the week. |
| P2 | Drag and drop | Plans are placed on a 52-week timeline by dragging; the frequency repeats them. Grouping and filters by site, building and trade. |
| P3 | Day, not clock | The week scheduler allocates a **total of hours per technician per day**, with no start or end time. The technician organizes their day. |
| P4 | Time step | **30 minutes.** Durations are rounded up to the next half hour. |
| P5 | Capacity | **7 h per day** by default, per technician. 0 on leave days. |
| P6 | Appointments | A work order block can be **locked at a clock time**, by the supervisor or by the technician. The block shows who locked it. |
| P7 | Block length | **At most 3 h 30 per block** (half a day): enforced in the week scheduler. A plan whose visit is estimated above 3 h 30 gets a warning in the year planner. |
| P8 | Splitting | A job can be split over several days, and over several technicians. |
| P9 | Minimum time | A work order estimated at 2 h needs at least 2 h of allocations to count as scheduled. |
| P10 | Supervisor time | The supervisor can add **travel**, **preparation** and **other** time to a technician's day. |
| P11 | Days | **Monday to Friday**; Saturday and Sunday can be opened per week. |
| P12 | Timeline range | 52 consecutive weeks from a chosen week, by default the current week (rolling); a "calendar year" preset shows weeks 1 to 52 or 53 of a year. |
| P13 | Location level | Plans and balancing use **site** and **building** (both already on assets). Floors and rooms: later. |
| P14 | Contractor work | A plan is done by the **internal team** or by a **contractor**. Contractor visits are on the timeline in their own layer but **do not count** in internal workload. |
| P15 | Release horizon | Work orders are created **4 weeks ahead** (setting). Further occurrences exist only in the plan, so the year stays easy to re-plan. |
| P16 | Corrective reserve | Weekly capacity in the year planner keeps a **reserve for breakdowns and staff requests**, **managed by the administrators** (0–80 %, 30 % by default) on the planning settings screen. A change applies at once to every figure of the year planner and is logged. |
| P17 | Capacity per trade | **Technicians and supervisors** count as capacity: their daily hours (7 h by default, lowered with capacity overrides for a supervisor's office time, leave or part time) count for their `specialty`; people without a specialty count as "general". |
| P18 | Online only | Both planning screens need a connection. Technicians' "My week" is readable offline. |

## 4. Data model

New tables; columns follow the conventions of `docs/data-model.md` (snake_case, `*_at` datetimes, `*_on` dates, CHECK on every enumerated column, STRICT tables). Weeks are stored as `TEXT` `YYYY-Www` (`CHECK (week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]')`).

### maintenance_plans
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| code | TEXT | no | UNIQUE | `PM-0001`, automatic |
| title | TEXT | no | 1–200 | "Quarterly service – chiller, Tower A" |
| description | TEXT | yes | ≤ 4000 | instructions for the technician |
| type | TEXT | no | CHECK `PREVENTIVE`, `REGULATORY` | work order type of the visits |
| category | TEXT | no | CHECK Category | trade |
| asset_id | INTEGER | yes | FK → assets.id | the asset maintained, if one |
| site | TEXT | no | | equals the asset's site when `asset_id` is set |
| building | TEXT | yes | | equals the asset's building when `asset_id` is set |
| location | TEXT | yes | ≤ 200 | free text, as on work orders |
| estimated_hours | REAL | no | > 0, multiple of 0.5 | per visit |
| frequency_weeks | INTEGER | no | 1–104 | 1, 2, 4, 8, 13, 26, 52 are offered first |
| anchor_week | TEXT | no | ISO week | first occurrence |
| end_week | TEXT | yes | ISO week ≥ anchor | last week (contract end); open-ended when NULL |
| schedule_mode | TEXT | no | CHECK `FIXED`, `FLOATING`, default `FIXED` | see BR-P5 |
| tolerance_weeks | INTEGER | no | 0–8 | default `min(8, floor(frequency_weeks / 4))` |
| season_from_week | INTEGER | yes | 1–53 | allowed season start (e.g. cooling checks before summer) |
| season_to_week | INTEGER | yes | 1–53 | allowed season end; may wrap over the new year |
| performed_by | TEXT | no | CHECK `INTERNAL`, `CONTRACTOR`, default `INTERNAL` | P14 |
| supplier | TEXT | yes | | contractor name |
| is_active | INTEGER | no | default 1 | inactive plans keep their history, create nothing |
| version | INTEGER | no | default 1 | optimistic check (409 when stale, no conflict console) |
| created_by, updated_by | INTEGER | | FK → users.id | |
| created_at, updated_at | TEXT | no | | |

Indexes: `code` (unique), `site, building`, `category`, `is_active`.

### plan_occurrences
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| plan_id | INTEGER | no | FK → maintenance_plans.id | |
| due_week | TEXT | no | ISO week | from the series |
| week | TEXT | no | ISO week | planned week; differs from `due_week` when moved |
| status | TEXT | no | CHECK `PLANNED`, `RELEASED`, `SKIPPED`, default `PLANNED` | |
| work_order_id | INTEGER | yes | FK → work_orders.id, UNIQUE | set when released |
| skip_reason | TEXT | yes | required when `SKIPPED` | |
| moved_by, moved_at | | yes | | last single move |
| created_at, updated_at | TEXT | no | | |

Constraints: UNIQUE (`plan_id`, `due_week`); `status = RELEASED` ⇔ `work_order_id IS NOT NULL`. Indexes: `week`, (`plan_id`, `week`).

Occurrences are stored for the **displayed horizon plus one year** and recomputed (only those still `PLANNED` and not moved) when the plan's anchor, frequency or end changes.

### Work orders (new columns)
| Column | Type | Notes |
|---|---|---|
| plan_id | INTEGER, FK → maintenance_plans.id, nullable | the plan of a preventive visit |
| planned_week | TEXT, ISO week, nullable | week the work is planned in; set by the release, and by the supervisor for corrective work |

The released work order takes from the plan: `type`, `title` (plan title + week, e.g. "… – 2026-W23"), `description`, `asset_id`, `site`, `location`, `category`, `estimated_hours`; `status = OPEN`, `due_on` = Friday of the planned week (or the last open day), `created_by` = the user or the system user of the release job.

### allocations
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| kind | TEXT | no | CHECK `WORK`, `TRAVEL`, `PREPARATION`, `OTHER` | |
| work_order_id | INTEGER | yes | FK → work_orders.id | required for `WORK`, NULL otherwise |
| technician_id | INTEGER | no | FK → users.id | active `TECHNICIAN` or `SUPERVISOR` |
| day | TEXT | no | date | |
| hours | REAL | no | multiple of 0.5, 0.5–3.5 | P4, P7 |
| locked_start | TEXT | yes | `HH:MM`, on the half hour, `WORK` only | appointment (P6) |
| locked_by | INTEGER | yes | FK → users.id | set with `locked_start` |
| position | INTEGER | yes | | the technician's own order in the day |
| note | TEXT | yes | ≤ 500 | e.g. "Keys at reception", "Lyon → Saclay" |
| version | INTEGER | no | default 1 | |
| created_by, updated_by, created_at, updated_at | | | | |

Indexes: (`technician_id`, `day`), `work_order_id`, `day`.

### capacity_overrides
| Column | Type | Notes |
|---|---|---|
| technician_id | INTEGER, FK | |
| day | TEXT, date | |
| hours | REAL, 0–12, multiple of 0.5 | 0 = absent |
| reason | TEXT, CHECK `LEAVE`, `PART_TIME`, `TRAINING`, `WEEKEND`, `OTHER` | |
| note, updated_by, updated_at | | |

PK (`technician_id`, `day`). Without an override: 7 h Monday to Friday (setting), 0 on Saturday and Sunday.

### schedule_weeks
`week` (PK, ISO week), `saturday_open` (0/1), `sunday_open` (0/1), `updated_by`, `updated_at`. An open weekend day appears in the grid; technicians still have 0 h on it until the supervisor gives them hours (an override with reason `WEEKEND`).

### blocked_weeks
`id`, `week`, `site` (NULL = every site), `reason` (e.g. "Data center change freeze", "Summer holidays"), `created_by`, `created_at`. Used by the year planner (warnings, assistant).

### planning_settings
One row: `daily_hours` (7), `reserve_percent` (30, CHECK 0–80), `release_weeks_ahead` (4), `max_block_hours` (3.5), `version`, `updated_by`, `updated_at`. Administrators edit it on `/admin/planning` (P16, §9b); every change is logged in `audit_log`.

### Audit
Plans, occurrence moves and skips, allocations and planning settings are logged in `audit_log` like other records (BR-L1). Its `entity_type` CHECK is extended to `maintenance_plans`, `plan_occurrences`, `allocations` and `planning_settings` (table rebuild in the migration, as `006` did for roles).

## 5. Business rules

### Plans and occurrences
- **BR-P1** A plan's occurrences fall in `anchor_week + k × frequency_weeks` (k ≥ 0), up to `end_week` if set.
- **BR-P2** Moving the **series** (new `anchor_week`) recomputes every occurrence still `PLANNED` and not moved individually. Released and skipped occurrences keep their week.
- **BR-P3** Moving **one occurrence** changes its `week` within `due_week ± tolerance_weeks`; outside → 422. A `REGULATORY` plan can move an occurrence **earlier only** (its due week is a legal deadline).
- **BR-P4** A **released** occurrence is not moved in the year planner: its work order is rescheduled in the week scheduler (or its `planned_week` changed by a supervisor, which also updates the occurrence's `week`).
- **BR-P5** `FIXED` plans keep their calendar whatever happens. In `FLOATING` plans, when a visit's work order is closed, the next occurrences are recomputed from the week it was closed (`closed week + frequency`).
- **BR-P6** **Release**: every occurrence whose `week` starts within `release_weeks_ahead` weeks and is still `PLANNED` gets its work order, in one transaction per occurrence; releasing twice creates nothing (UNIQUE `work_order_id`, idempotent like D26). The release runs daily (`npm run pm:release`, systemd timer like backups) and also when a planning screen is opened.
- **BR-P7** **Skipping** an occurrence needs a reason; a released one can only be skipped by cancelling its work order (the occurrence follows).
- **BR-P8** Warnings, never refusals, in the year planner: occurrence in a blocked week, outside the plan's season, plan visit above `max_block_hours` ("will be split"), week over capacity.
- **BR-P9** A plan's `site` and `building` follow its asset (like BR-W2).

### Year planner figures
- **BR-Y1** Planned hours of a week = estimated hours of the internal occurrences whose `week` is that week (released ones included), counted per trade and per site.
- **BR-Y2** Capacity of a week = Σ over active technicians **and supervisors** of their hours in the week (`daily_hours` × open days, replaced by capacity overrides where set), minus `reserve_percent` (the administrators' setting, P16); per trade through `specialty` (P17).
- **BR-Y3** Load = planned hours ÷ capacity. Above 100 %: warning; 85–100 %: tight.
- **BR-Y4** Contractor occurrences are counted separately (number of visits per week and site) and never in the load.

### Week scheduler
- **BR-S1** A block is 0.5 to 3.5 h, in half hours. A work order of more than 3 h 30 is split into several blocks (proposed automatically as 3 h 30 + the rest, adjustable).
- **BR-S2** A work order is **fully scheduled** when its `WORK` blocks add up to at least its estimate rounded up to the half hour; until then the tray shows what is left ("1 h left"). A work order without an estimate asks for one before its first block.
- **BR-S3** Allocating a work order with no assignee assigns it to the first technician who gets a block. Blocks given to other technicians make them **helpers**; the assignee stays the person responsible.
- **BR-S4** A staff request waiting for review (BR-R7) and terminal work orders cannot receive blocks.
- **BR-S5** A day's total (all kinds) above its capacity is a **warning** ("8 h 30 / 7 h"), not a refusal.
- **BR-S6** An **appointment** (`locked_start`) is set or removed by a supervisor, an admin, or the technician of the block. A locked block cannot change day, technician or length (422) until it is unlocked. Two appointments of the same technician cannot overlap (`locked_start` to `locked_start + hours`; 409).
- **BR-S7** Technicians can change only their own blocks' `position` and appointment lock; everything else is the supervisor's.
- **BR-S8** A day on a closed weekend, or with capacity 0, accepts blocks with a warning ("absent", "weekend not open").
- **BR-S9** **Carry-over**: at the end of a week, work orders of that week not terminal appear in the next week's tray marked "carried over from 2026-W23"; their past blocks stay as history. The year planner shows per week planned vs done hours.
- **BR-S10** **Sites per day** = distinct sites of a technician's `WORK` blocks that day; two or more is shown with a suggestion to add travel time.

## 6. API (planned)

Base `/api`, same conventions (zod, unknown fields 400, version in writes, 409 when stale, 422 on rules). Roles: supervisors and admins write; technicians read the planner and write only BR-S7; staff have no access (403, D46).

| Endpoint | Purpose |
|---|---|
| `GET /api/plans?site&building&category&type&performed_by&active&q&page&size` | plan list |
| `POST /api/plans` | create (code automatic; occurrences generated) |
| `GET /api/plans/:id`, `PUT /api/plans/:id` | read, edit (version) |
| `PUT /api/plans/:id/anchor` | `{ anchor_week, version }`: move the series (BR-P2) |
| `GET /api/planning/timeline?from=2026-W41&weeks=52&group_by=site\|building\|category&filters…` | rows (plans grouped), their occurrences, and per-week figures: planned hours per trade and site, capacity, load, contractor visits, blocked weeks (BR-Y1 to BR-Y4) |
| `PUT /api/plan-occurrences/:id` | `{ week, version }`: move one occurrence (BR-P3, BR-P4) |
| `POST /api/plan-occurrences/:id/skip` | `{ reason }` (BR-P7) |
| `POST /api/planning/release` | release now (idempotent, BR-P6) |
| `GET/POST/DELETE /api/planning/blocked-weeks` | blocked weeks |
| `GET /api/planning/settings` | every maintenance role (the figures depend on it) |
| `PUT /api/planning/settings` | ADMIN only: `{ reserve_percent?, daily_hours?, release_weeks_ahead?, max_block_hours?, version }` (P16); 403 for supervisors |
| `POST /api/planning/suggestions` | Phase 20: `{ from, weeks, filters }` → proposed moves with before/after figures; nothing is saved |
| `GET /api/schedule?week=2026-W41` | technicians, days (open weekend days included), capacities, blocks, tray (work orders of the week, carried over ones, unplanned corrective work and approved requests), per-day totals and sites, week KPIs |
| `POST /api/schedule/allocations` | `{ blocks: [{ kind, work_order_id?, technician_id, day, hours, note? }] }`: one or several blocks in one transaction (a split) |
| `PUT /api/schedule/allocations/:id` | `{ day?, technician_id?, hours?, note?, version }` |
| `DELETE /api/schedule/allocations/:id?version=N` | the hours go back to the tray |
| `PUT /api/schedule/allocations/:id/lock` | `{ locked_start: "HH:MM" \| null, version }` (BR-S6) |
| `PUT /api/schedule/day-order` | `{ technician_id, day, ids: [] }`: the technician's own order (BR-S7) |
| `PUT /api/schedule/capacity` | `{ technician_id, day, hours, reason, note? }` |
| `PUT /api/schedule/weeks/:week` | `{ saturday_open, sunday_open }` |
| `GET /api/my-week?week=` | a technician's own days, blocks and work orders (cached offline) |

## 7. Year planner screen (`/planning`)

**Layout:** filter bar (site, building, trade, type, internal/contractor, search, range: from week + 52, or calendar year), a **Group by** switch (site / building / trade), the **tiles**, then the grid.

**Grid:** sticky first column with the group and plan names (code, title, hours per visit, frequency); 52 week columns with the week number and the Monday's date on hover; the current week marked. Each occurrence is a chip in its week, showing the hours; its style says what it is, always with text or an icon as well: planned, moved (↔ and the due week), released (✓ work order number), skipped (struck through), regulatory (§), contractor (outline, supplier name), warning (⚠ with the reason in the tooltip). Group rows show their total hours per week.

**Load strip** (sticky, above the weeks): per week, a bar of planned hours vs capacity, stacked by trade, with the % written; tight and over-capacity weeks use the warning and danger styles plus the figure.

**Tiles** (for the filters in use):
| Tile | Content |
|---|---|
| Weekly workload | Average and peak load, weeks over capacity |
| Trade balance | Planned hours vs capacity per trade over the range ("HVAC 140 % · Electrical 40 %") |
| Peak week | Worst week and how much it exceeds capacity |
| Site spread | Average number of sites with internal visits per week |
| Contractor visits | Visits per week (peak), not in the load |

**Interactions:**
- **Drag the first chip of a row** (or the row's anchor handle) → moves the **series** (BR-P2). **Drag any other chip** → moves **that occurrence** within its tolerance: allowed weeks are highlighted during the drag, others refuse the drop with the reason (BR-P3).
- **Live impact:** while dragging, the load strip and the tiles show the figures as if the chip were dropped where the pointer is.
- **Keyboard:** chips are focusable; arrow keys move the selection; `Shift`+arrows move the chip (series with `Alt`); `Enter` confirms, `Escape` cancels. A "Move to week…" field does the same for touch and screen readers.
- **Undo / redo** of the session's moves (`Ctrl+Z` / `Ctrl+Y`), each undo being the opposite API call.
- **Click a chip:** side panel with the occurrence (due week, planned week, status, its work order link), "Skip", and the plan's details with "Edit plan".
- **New plan** button: form in the side panel (asset by code or site/building, trade, type, hours, frequency, anchor week, mode, tolerance, season, internal/contractor).
- Phase 20: **"Suggest a smoother plan"**: proposals listed and shown as ghost chips, with the tiles before → after; accept all, accept some, or discard.

## 8. Week scheduler screen (`/schedule?week=2026-W41`)

**Layout:** week switcher (previous / this week / next, and a week picker), weekend switches (Open Saturday / Open Sunday), the tiles, then the tray on the left and the grid on the right.

**Tray "To schedule"**, in three groups: *Planned this week* (preventive and corrective work with `planned_week` = this week), *Carried over* (BR-S9), *Not planned* (open corrective work and approved staff requests without a week). Each card: number, title, site and building, trade, hours left, priority, due date, assignee if any.

**Grid:** one row per technician (name, trade, week total "31 h / 35 h"), one column per day (Monday–Friday, plus open weekend days). A cell lists its blocks: appointments first with their time and a lock icon ("🔒 10:00 · 2 h · locked by Karim"), then work blocks (number, title, site, hours), then travel, preparation and other blocks in their own style. The cell header shows the total vs capacity ("6 h / 7 h"), the sites of the day ("Lyon · Saclay"), and absences ("Leave").

**Interactions:**
- **Drag a tray card onto a cell** → creates blocks for the hours left, split by 3 h 30 if needed (BR-S1); a split proposal opens for long jobs (e.g. 3 h 30 today + 2 h 30 tomorrow, editable).
- **Drag a block** to another day or technician; **stretch or shrink** it by half hours (handles, or `+`/`−` keys). A shrunk block sends the difference back to the tray.
- **"+ Time"** in a cell: add travel, preparation or other time with a duration and a note.
- **Lock time** on a block: pick a start time (half hours); unlock from the same menu.
- **Capacity:** click a cell header to set leave, part time or weekend hours.
- Same keyboard support and undo as the year planner.

**Warnings shown in place** (text and icon, never color alone): day over capacity, two or more sites in a day (with "Add travel time"), block on an absent day or a closed weekend, work order not fully scheduled.

**Tiles:** booked vs available hours (team and per technician), hours left in the tray, travel time share, sites per technician-day (average and worst), carried-over work orders.

## 9. "My week" for technicians (`/my-week`)

Their days, each with appointments first (time, lock, who locked it), then the other blocks in their own order, with the day total. They can **reorder** their day by drag or keyboard (BR-S7), **lock or unlock a time** on their own blocks, and open each work order to work on it as today. The week is cached on the device and readable offline; changes need a connection.

Supervisors who receive blocks (they count as capacity, P17) have the same page for their own days.

## 9b. Planning settings (`/admin/planning`, administrators)

A short form: **Corrective reserve** (%, 0–80, hint: "Share of each week kept free for breakdowns and staff requests"), **Daily capacity** (hours, half-hour steps), **Release horizon** (weeks) and **Longest block** (hours). Before saving, the form shows the effect on the planner's range (e.g. "Capacity of the next 52 weeks: 6,860 h → 7,840 h"). Online only, like the other administration pages. Supervisors see the reserve read-only, as a line under the year planner tiles ("Capacity keeps a 30 % reserve, set by the administrators").

## 10. Permissions

| Action | STAFF | TECHNICIAN | SUPERVISOR | ADMIN |
|---|---|---|---|---|
| Read the year planner and the week schedule | no | yes | yes | yes |
| Create, edit, move plans and occurrences; blocked weeks | no | no | yes | yes |
| Allocate, move, resize blocks; capacity; open weekends | no | no | yes | yes |
| Lock or unlock an appointment | no | own blocks | yes | yes |
| Reorder own day; My week | no | yes | yes (own) | yes (own) |
| Change the planning settings (reserve, daily capacity, release horizon, longest block) | no | no | no | yes |

## 11. Phases

- **Phase 17: maintenance plans and the read-only year planner.** Plans (CRUD), occurrences, release of work orders 4 weeks ahead (daily job, idempotent), work orders linked to plans, the planning settings screen for administrators, the 52-week grid with grouping and filters, load strip and tiles. Acceptance: a supervisor creates a quarterly plan for an asset and sees its 4 visits on the timeline; the load strip shows planned hours vs capacity per trade; four weeks before a visit, exactly one work order exists for it, even if the release runs twice; contractor plans appear without changing the load; a plan visit above 3 h 30 is flagged; supervisors' hours count in the capacity of their trade; when an administrator lowers the reserve from 30 % to 20 %, every week's capacity rises accordingly and the change appears in the audit log; a supervisor cannot change the reserve (403).
- **Phase 18: year planner editing.** Drag of series and occurrences with live impact, tolerance and regulatory limits, blocked weeks and seasons, keyboard moves, undo, skip. Acceptance: dragging the first visit of a plan moves all its future visits; dragging one visit beyond its tolerance is refused with the reason; a regulatory visit cannot move later; the tiles change while dragging; everything can be done with the keyboard; undo restores the previous weeks.
- **Phase 19: week scheduler and My week.** Tray, day allocations, splitting, the 3 h 30 limit, travel/preparation/other time, capacity and leave, open weekends, appointments, carry-over, technicians' My week (offline read). Acceptance: a 6 h work order dropped on Monday is proposed as 3 h 30 + 2 h 30; a 2 h work order with a 1 h 30 block is shown with "30 min left"; a day at 8 h 30 shows the overload; two sites in a day are flagged with "Add travel time"; a technician locks a 10:00 appointment, which the supervisor then cannot drag; Saturday appears only once opened; unfinished work appears in the next week's tray marked "carried over"; a technician reads their week offline.
- **Phase 20: balancing assistant.** "Suggest a smoother plan": moves within tolerance, seasons, blocked weeks and regulatory limits that lower the peak load and the trade imbalance; shown before acceptance. Acceptance: on the demo dataset, accepting the proposal lowers the peak week load and keeps every move within its plan's rules.

Seed (Phase 17): about 60 plans over the existing assets (every trade, both modes, some regulatory and some contractor plans, a few above 3 h 30), placed unevenly on purpose so the imbalance is visible; Phase 19 adds a week of allocations with an appointment, a split job, travel time and one absence.

## 12. Open points

P12 to P18 were confirmed by the product owner on 2026-10-08, with the reserve managed by the administrators (P16) and supervisors counted as capacity (P17).

1. A per-person default daily capacity (e.g. a supervisor at 4 h a day) instead of day-by-day capacity overrides: later, if overrides prove tedious.
2. Several assets per plan (e.g. "all fan coil units of Tower A floor 12" as one visit): kept for later; one plan per asset or per building location for now.
3. Site-to-site travel times (a table filled once, used to suggest travel blocks and by the assistant): backlog.
4. Notifications to technicians when their week changes: backlog (no push infrastructure in the MVP).
