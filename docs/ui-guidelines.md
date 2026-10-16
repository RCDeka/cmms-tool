# UI Guidelines

Black, red and white brand after Société Générale (D41), on an accessible baseline (Q3). Colors and fonts are **design tokens** (CSS custom properties) in `frontend/assets/css/base.css`. Changing the brand means editing tokens only, never component styles.

## Language

The interface is in English (D16). Field and value labels come from `assets/js/labels.js`. The app name comes from `APP_NAME`: "Tacto" (Q6).

Numbers: a percent sign follows the number without a space ("41%", "a 30% reserve"), as `Intl.NumberFormat` writes it. The browser's own date, week and number fields follow the browser's language, not the page's (`lang="en"` does not change them): on a French browser they show "Semaine 42, 2026", "jj/mm/aaaa" and "3,5". This is accepted (D69); the values sent and shown elsewhere stay in the app's format.

## Layout (brief)

- `<body>`: CSS Grid, `100dvh`. Sidebar of 250 px on the left, fixed and vertical (`<nav>`), then `#main-content` (`<main>`). The page itself never scrolls: only the table area, the detail panel and the sidebar do; `#main-content` clips what overflows it (`overflow: clip`, D69). The sidebar scrollbar is dark and its room is always kept, and the account block (name, role, "Change my password", "Log out") stays at the bottom while a long sidebar scrolls.
- Main area (`#app-main`): top bar with the page heading (and the menu button on small screens; from 768 px on one line, ending with "…" when too long) and, at its end, **Find a work order** (primary, black; technicians, supervisors and admins; `.ai-only`, disabled offline with its tooltip; D67) and **Suggest an improvement** (secondary; D40); under 640 px both keep only their icon (44 px), the label stays for screen readers; then `#main-content`, then the status bar (`#status-bar`): online/offline state, pending sync count, current user.
- `#main-content` default: `grid-template-columns: 1fr` (table only). With `.split-view`: `1fr 1fr` (table + detail panel). `#detail-container` is `.hidden` by default.
- In split view the table keeps only its key columns (`splitColumns` in `entities.js`: code, name, status for assets; number, title, priority, status for work orders); the detail panel shows everything else. The pager keeps only its arrows (each button keeps its name). Next to a panel, the week scheduler shows its figures as one line, folds the tray and shows one day at a time (as on phones); the year planner leaves out its tiles, capacity line and drag help (D69).
- **Page title** (top bar and browser tab): the name of the sidebar section the page belongs to ("Work orders", "Users", "Year planner", "Week scheduler", "My open requests"…), also while a panel is open; the panel's own heading names the record or the task ("WO-2026-00330 — …", "New user", "Blocked weeks"). Only a record opened from another page takes its kind as title ("Work order", D68).
- Below 1024 px (e.g. half of a FullHD screen): sidebar hidden behind a burger button; it opens as an overlay and closes on page choice, backdrop click or Escape.
- Mobile (< 768 px): in split view, the table is hidden and the detail panel is full screen with a "Back to list" button, or "Back to <page>" when the record was opened from another page (My week, the dashboard, the scheduler…), which it returns to (D68).
- Phones (< 768 px, D68): the work order list shows cards (number, status, title, priority, due) and folds its filters behind "Filters (n)", the search staying in view; the audit log shows each change as a card; a work order panel lists the job's fields first (also for technicians on any screen); the year planner is not offered (tablets and computers only). Touch screens (`pointer: coarse`) get tap help instead of drag and key help, and 44 px targets.

## Design tokens

Brand (D41): **black** for actions and the sidebar, **red** as an accent (logo, current page in the sidebar, red line under the top bar, selected row, hover), **white** surfaces. Primary buttons are black, not red, so an action never looks like an error; errors keep `--color-danger` with text. Contrast: red `#e9041e` on white 4.7:1; hover red `#c00319` with white text 5.9:1; sidebar text on black ≥ 9:1. The logo (`assets/img/logo.svg`) is a red gear and a white wrench on a black tile; it is not the Société Générale logo.

```css
:root {
  /* Neutrals: pure grays */
  --color-bg: #f5f5f5;          --color-surface: #ffffff;
  --color-border: #d4d4d4;      --color-text: #1a1a1a;      --color-text-muted: #595959;
  /* Brand */
  --color-brand-red: #e9041e;   --color-brand-black: #000000;
  --color-primary: #1a1a1a;     --color-primary-contrast: #ffffff;  --color-primary-hover: #c00319;
  --color-link: #1a1a1a;        --color-link-hover: #c00319;
  --color-row-selected: #fdeced;
  --color-chart-bar: #3d3d3d;   --color-chart-bar-hover: #c00319;
  --color-sidebar-bg: #000000;  --color-sidebar-text: #f2f2f2;      --color-sidebar-muted: #b3b3b3;
  /* Semantic */
  --color-success: #1e7b4a;     --color-success-bg: #e4f4ea;
  --color-danger: #b42318;      --color-danger-bg: #fdecea;
  --color-warning: #8a5300;     --color-warning-highlight: #fff1d6;  /* conflict rows */
  --color-info: #175cd3;        --color-info-bg: #e7effc;
  /* Type */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-size-base: 0.9375rem;  --line-height: 1.5;
  /* Spacing, radius, focus */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px;
  --radius: 6px;
  --focus-ring: 0 0 0 3px rgb(31 95 173 / 45%);
  --sidebar-width: 250px;
}
```

Every text/background pair must reach WCAG AA contrast (4.5:1 for normal text). Check it again whenever a token changes. The system font stack avoids downloading fonts, so it works offline.

## Table rows (brief)

| State | Style | Non-color cue |
|---|---|---|
| Selected | `--color-row-selected` background | `aria-current="true"` (`aria-selected` is only valid in grid widgets), left border in brand red |
| Conflict | `--color-warning-highlight` background | ⚠ icon + badge "Conflict" |
| Asset `BROKEN_DOWN` | thin left border in `--color-danger` | status badge with the text "Broken down" |
| Pending sync | — | small "Pending" badge |

A record's number or code never breaks across lines ("WO-2026-00330"), in tables, the conflict list, the scheduler tray and its blocks; the "Conflict" badge sits above it (D69). Every list opens a record from a click anywhere on its row (the user list included), and its search follows typing after a short pause.

Badges always show text. Badge class names come from the field and the code in kebab-case: `badge-status-in-service`, `badge-criticality-high`, `badge-category-hvac`.

## Accessibility (brief, mandatory)

- Semantic HTML: `<nav>`, `<main>`, `<table>` with `<caption>` and `<th scope="col">`, `<dl>` for detail fields, `<button>` for actions (never a clickable `<div>`).
- Conflicts and states: color + icon + text, never color alone.
- Touch targets ≥ 44 × 44 px.
- Full keyboard use: one row at a time is in the tab order (roving `tabindex`); arrow keys, `Home` and `End` move between rows; `Enter` opens the detail panel and focuses its title; `Escape` closes it and returns focus to the row. After a page change, focus stays on the pagination button used. Focus is always visible on interactive elements; headings focused by code after navigation get no ring.
- Icon-only buttons have an `aria-label` (e.g. `✕` → "Close details").
- Dynamic messages (saved, offline, update available, conflict) are announced through an `aria-live="polite"` region.
- Respect `prefers-reduced-motion`.

## Dashboard

- **By role** (D43): supervisors and admins see the two charts beside "My work" and "Recent activity"; technicians see no chart, only their work and the recent activity.
- **My work**: a Today / Next 7 days switch (two buttons with `aria-pressed`, the chosen one filled black), Today by default; the choice is kept while the app is open. A line under the title says what the list holds ("Due by 10 Oct 2026, late or without a due date").
- **Status pie** ("Work orders by status — last 30 days"): five slices, one fixed color per status in workflow order (`--color-chart-series-1` … `-5`: blue, orange, aqua, yellow, pink; the color follows the status, never its rank), 2 px white gaps between slices, tooltip with count and share. Three of these colors are under 3:1 on white, so the list beside the pie writes every status with its count and share: it is the pie's table view, and stays readable without the chart library.
- **KPI tiles** (stat tiles): sentence-case label, value in the same sans with proportional figures, the whole tile is a link to the matching list. Tiles whose count needs attention (overdue work orders, broken-down assets, conflicts) add an amber edge and a "⚠ Needs attention" badge with text when the count is above zero. Technicians get no conflict tile.
- **Chart** (Chart.js, loaded on demand): one series, so **one color for every bar** (`--color-chart-bar`, dark gray, 10.8:1 on the card; brand red on hover), never a darker-is-bigger ramp on these nominal categories. Horizontal bars ≤ 24 px with a 4 px rounded end, sorted by count with "Unspecified" last, value at the bar tip in text color, no legend (the title names the series), solid hairline grid (`--color-grid`), tooltip on hover.
- Every chart has a text equivalent (`aria-label` summary on the canvas) and a "Show as a table" view; if the chart library is unavailable, the table opens instead.
- The frame grows with the number of bars (no nested scroll). A refresh keeps the previous render, dimmed, until the new figures arrive (no skeleton flash).
- Offline, the last saved figures are shown with "Offline: figures saved on this device on <date>".

## Personal dashboards (D59, Phase 21)

Supervisors and admins; technicians keep the dashboard above. Specification: `docs/spec-dashboards.md`.

- **Sidebar**: "Dashboards" lists my dashboards (the one shown marked as the current page), then **+ New dashboard** (online only). On a dashboard page, a **Widgets** section follows the links: the catalogue by group (Key figures, Flow and backlog, Compliance, Responsiveness, Assets, People, Work orders, Lists), one checkbox per widget; ticking adds the widget at the end and announces it, unticking removes it. Checkboxes are disabled offline.
- **Toolbar**: Period (30 / 90 / 365 days, segmented), Sites and Trades (the multi-select dropdowns of the lists: "All sites", "All trades" when nothing is ticked), and a **Dashboard ▾** menu: New dashboard…, Rename…, Duplicate…, Move up / down in the sidebar, Delete… (with a confirmation; disabled for the last one). On phones each filter takes a full line.
- **Grid**: 4 columns (tiles 1, charts and lists 2), 2 below 1024 px, 1 below 768 px; cards of a row share its height. Each card: a drag handle (⠿, "Move <widget>"), the title, a scope line (the period, the sites and trades chosen, and "Site filter not used" when the dashboard has a filter the widget ignores; all sites and all trades go unsaid), and a ⋯ menu (closed by a click elsewhere or Escape, which returns focus to ⋯; so is the "Dashboard ▾" menu): Figures (CSV), Work orders (CSV) or Assets (CSV) (online only), Image (JPG), Move earlier, Move later, Remove from dashboard. Tables inside cards fit them (no minimum width) with compact cells. Tiles keep the stat tile look and attention style; their value is the link to the list, with the dashboard's sites and trades.
- **Drag and drop**: press the handle and drag (mouse, pen, touch; only the handle captures touch); a dashed placeholder shows where the card lands; near the top or bottom of the window the page scrolls, also while the pointer stays still. Keyboard: Space on the handle picks the card up (outlined), the arrow keys move it, Space drops it, Escape puts it back; each step is announced ("Open work orders, position 3 of 10"). The order is saved at once; a refused save shows the dashboard as saved, with the reason.
- **Exports**: CSV files are UTF-8 with a byte order mark, comma-separated, CRLF; cells starting with `=`, `+`, `-`, `@`, tab or carriage return get a leading `'`. Images are JPG, 1,200 px wide at 2× density, white, with the title, the scope line, the chart at its on-screen size (never enlarged), the table view for the status pie and the lists, the value and "⚠ Needs attention" for tiles, and "Tacto · <dashboard> · figures of <date>". Files are named `tacto-<dashboard>-<widget>[-work-orders|-assets]-<YYYY-MM-DD>`.
- **Flow and backlog widgets** (Phase 22, data-viz method: one value axis per chart, categorical colors in fixed slots with an HTML legend, a table view with links, a tooltip on every mark, a click on a mark opens its records):
  - *Opened vs closed* (full width): a sentence ("48 opened, 41 closed, 3 cancelled. The backlog grew by 4."), paired columns opened (slot 1, blue) and closed (slot 2, orange) per week (`W37`) or month (`Oct 2025`, `Nov`…), then a separate line chart "Unfinished at the end of each week" (one gray series, 2 px, markers; its own axis rather than a second axis on the columns, which the data-viz method forbids). Cancelled counts are in the sentence and the table view.
  - *Backlog by age and priority*: the table itself, cells shaded with the blue sequential ramp (5 steps from the surface, white text on the two darkest), every count written and linked; urgent and high cells 31+ days old get an amber inset frame, and the card the attention style with "⚠ Needs attention: n urgent or high-priority work orders are more than 30 days old".
  - *Backlog in weeks of work*: horizontal gray bars, "6 wk" at the tip ("97 h, no capacity" for a trade without people), the 2–4 weeks band shaded behind, trades without capacity first; notes link to the work without a trade and without an estimate.
  - *Planned vs reactive work*: a Work orders / Hours switch (saved with the dashboard), the planned share in a sentence, 100 % stacked columns in slots 1–4 (planned, reactive, staff requests, improvement) with 2 px gaps.
- **Compliance widgets** (Phase 23):
  - *Preventive maintenance compliance*: the share on time in the stat type ("75% on time"), a sentence with the late count linked and the skipped ones "not counted", a line on regulatory visits (amber badge and card attention style when some are late), gray rate bars per trade from 0 to 100 % with "80% (12/15)" at the tip, and a note saying when a visit counts.
  - *Regulatory visits late*: a tile with the attention style above zero; its value opens the drill-down.
  - *Week schedule kept*: "50% kept", gray columns of the share finished in the week and an orange line (slot 2) of the hours booked once the week had started, both on one 0–100 % axis (the same unit), legend above; a click on a column opens the work orders not finished in that week.
  - *Contractors*: a table, the worst first; each column title is a sort button (`aria-sort` on the column in use); the visit and late counts are links; the card has the attention style when a contractor has late visits.
  - Their CSV of records is **Visits (CSV)**: plan, trade, site, done by, due and planned weeks, deadline, outcome, reason skipped, work order, closed.
- **Responsiveness, asset and people widgets** (Phase 24):
  - *Time to start and to close*: a sentence with both medians, then two charts (start, close), a row per priority from Urgent: a pale bar from the median to the 90th percentile and a dark dot on the median (legend above); durations read "45 min", "6.5 h", "3.2 d", and an axis uses whole days once it reaches two days.
  - *Staff requests*: three figures (median time to review, median time to done, share rejected, linked) each with a small trend line (inline SVG, one gray), and links to the requests waiting for review and to the rejected ones.
  - *Assets with the most breakdowns*: an All assets / High and critical switch (saved), a sentence ("These 10 assets account for 19 % of…"), gray bars with "8 · 34 % cum." at the tip (the cumulative share as text: a second axis is ruled out); a bar opens the asset.
  - *Repeat failures*: a tile with "22 % of the corrective work" under the count.
  - *Critical assets out of service*: attention style and a sentence when high or critical assets are down today, gray bars of days per site ("120 d · 4 assets"); a bar opens the asset list.
  - *Workload per person* (full width): bars stacked by priority in the **ordinal ramp** (`--color-ordinal-1` Low … `-4` Urgent: one blue, darker for more urgent, validated as an ordinal ramp), "48 · 196.5 h left · 13/35 h" at the tip, Unassigned last; a segment opens that person's work of that priority.
  - *Estimates vs actual hours*: gray bars of actual ÷ estimate per trade with a dashed line at 1.0× and a sentence saying whether estimates run low or high.
- **Drill-down list**: the work order list opened from a widget starts its filter bar with an info-colored chip "From the dashboard: Backlog by age and priority: Urgent, 91+ days old" and a ✕ button ("Remove the dashboard filter").
- **Images**: the legend of a multi-series chart is drawn above it, each further chart gets its caption, and the rate widgets show their headline ("75% on time").
- **New dashboard / Rename / Duplicate**: a dialog with the name (an error under the field when it is already used) and, for a new one, "Start from": an empty dashboard, the overview, the backlog, compliance, assets and people, or a copy of the current one.
- **Offline**: the dashboards and their last figures are read from the device with "Offline: figures saved on this device on <date>"; handles, checkboxes, filters and changes are disabled; Figures (CSV) and Image (JPG) still work.

## Staff screens (D46)

- **Sidebar** for `STAFF`: My open requests (home), All my requests, New request; then their account and Log out. The maintenance links are not shown.
- **Request lists**: cards rather than a table (staff read a handful of requests, on any screen size). Each card: the title as a link, a stage badge with text (Received, Assigned, In progress, On hold, Done, Cancelled), a **Next step** sentence, then number, location, date sent and comment count. In-progress cards have a red side line, on-hold cards an amber one; the badge text always says it too.
- **Request page**: a status box (badge, four steps Received → Assigned → In progress → Done with ✓ on done steps, the current one in bold over a red line, `aria-current="step"`, and a visually hidden "(done)" / "(current step)" / "(to come)"; "On hold" replaces "In progress" when paused), the next step, "What was done" (work report) once closed, the details sent, a history of the status steps, and the comments with an "Add a comment" form.
- **Request form**: plain questions ("What is the problem?", "Where exactly?", "Kind of problem", "How urgent is it?"), with examples in the hints. The two lists start with **"I don't know"**, selected by default. The site defaults to the user's site.
- **Room** (D81, D82): under the site, a "Room" group with the place picker limited to the site and to the places staff can pick (level types offered to staff): a lone building or floor is chosen by itself; the deepest list ends with **"Not in the list"**. The group is hidden for a site without such places. "Where exactly?" carries its required star only while no place is chosen, and its hint says what to write. A place is shown as its path "Tower A › L12 › Meeting room 12.02", followed by " — " and the words about it when there are some (cards, request page).

## Places (D82)

- **Place picker** (every form: asset, work order, plan, request): a **Find a place** search field first (every word in the path, e.g. "tower a 12.02"; up to 30 results as buttons showing the whole path; Escape clears it), then one labelled list per level side by side (stacked on phones): **Site**, then each level named after the level type of its places ("Building", "Floor", "Room"; "Place" when they differ). Below the site, the first entry reads "— Tower A itself —": the place can stop at any level. Places out of use are not offered; the one a record already names shows "(not in use)". With an asset, the picker shows the asset's place and is disabled (it follows the asset). It reads the tree cached on the device, so it works offline.
- Records show **Site** and **Place** (the path below the site, "Tower B › L4"), then **Exact location** (the words). Lists of blocks, cards and the asset picker write "site · place".
- **Places page** (`/admin/locations`, sidebar "Places", supervisors and admins, online only): a search field (each word in the path; the results as paths) and "Show places not in use", then the tree: each place a link with its level type, code and "Not in use" badge, a ▸ / ▾ button (`aria-expanded`, 44 px) folding its branch; sites are open at first, deeper branches folded; the chosen place's branch opens and it stays in view. Admins get **Level types** and **+ New site**.
- **Place panel** (split view): state, level type and last change, the path; name, level type, code (hint: capitals and digits, for asset codes), **Inside** (move within the site: the places of the site, indented, its own branch left out), **In use**; **Save** and **+ Add a place inside**. A site's panel has no type or Inside; for supervisors its fields are disabled with "Only administrators change sites."
- **Level types** (admins): one small form per type (name, token, "Offered to staff", "In use"; the site type keeps its token and stays in use) and a form for a new type.
- **Review box** (D47): at the top of the work order panel of a request waiting for review, for supervisors and admins: amber frame, "Staff request to review", who sent it and when, then *Assign to* (required; technicians first, then supervisors), type, priority, category, due date and **Approve and assign** (primary); below a line, *Reason for rejection* and **Reject request** (danger, with a confirmation). Both buttons are `.online-only`. Technicians see an info notice. The dashboard tile **Staff requests to review** uses the attention style when above zero; the list filter is the checkbox **Requests to review** (supervisors and admins).
- Staff wording of the review: "Waiting for review" (step Received), "Approved" (step Approved and assigned), "Rejected" (danger badge, the reason quoted in the next step, no step line).
- **Comments** (staff page and work order panel): oldest first, author and time on top; the requester's comments carry a red side line, the team's a gray one. Staff see team members as "Name (maintenance team)"; the team sees "Name (requester)" and roles. Send buttons are `.online-only`. In the work order panel, when the requester wrote last, an info banner under the conversation says "The requester is waiting for a reply." (D80).

## Pagination (brief)

`◀◀ First` · `◀ Previous` · `Page X / Y` · `Next ▶` · `Last ▶▶`. Buttons are disabled at the bounds. 50 rows per page. On every list (assets, work orders, users, suggestions, audit log), a second copy sits at the start of the row above the table (record count and "New …" at its end), so changing page needs no scrolling (D42). There is no pager at all when everything fits on one page (D69). Focus stays on the button used, in the copy used.

## Table sort (D42)

Every column title of the asset and work order tables is a button. A click sorts by that column ascending; a second click on the same column flips to descending, and so on. The sorted column has `aria-sort` and an arrow (▲ ascending, ▼ descending); the other columns show a faint ↕. Enumerated columns follow business order (priority Low → Urgent), and empty values (no assignee, no due date) come last. Focus stays on the column title after the sort. The default order (assets by code, work orders newest first) is not in the URL.

## Asset picker (D50)

- The asset field of the plan form and of the work order form has a **Browse assets…** button (`.online-only`) next to the code, so nobody needs to know asset codes by heart.
- It opens a wide modal dialog "Choose an asset": search (code, name, place, location, brand…, full text), filters for site, trade and status, then a table of 20 assets per page with Code, Name, Location (place · exact location), Site, Trade (with the subcategory), Status and Criticality badges, and a **Choose** button per row (its name says which asset). Code, name, site, trade, status and criticality sort from their column titles like the main tables (▲ / ▼ / ↕, `aria-sort`); broken-down assets keep their red side line. Pages use the usual pagination.
- The plan form opens it already filtered on the trade chosen and the site of the place chosen. Choosing fills the code, shows "AST-0138 — Chiller …, site · place" under it, and clears the place chosen (it follows the asset). Escape or ✕ closes without choosing; focus returns to the button.

## Year planner (D48, Phase 17)

- **Sidebar**: "Year planner" for the maintenance roles; "Planning settings" for administrators.
- **Filter bar** (one row, wrapping; full width per filter on phones): *Weeks shown* (Next 52 weeks, Year N, Year N+1, 52 weeks from a chosen week), *Group by* (Site / Area / Trade, a segmented switch with `aria-pressed`; Area = the first place under the site, a building or a data center hall, "The site itself" for plans on the site, D82), site, trade, type, done by, search; "Clear filters"; **+ New plan** at the end for supervisors and admins. Everything lives in the URL.
- **Tiles** (dashboard tile frame, text values): Weekly workload, Trade balance (the most loaded trade first, "No specialist for: …" for trades nobody covers), Peak week, Site spread, Contractor visits. Workload, trade balance and peak week use the attention style with "⚠ Needs balancing" when a week or a trade is over capacity. Under the tiles, one line states the weekly capacity and the reserve, "set by the administrators" (admins get a link to the settings).
- **Legend** above the grid: the chip styles, and the trade colors of the load strip with the dashed capacity line.
- **Grid**: a table that scrolls both ways inside its frame; the plan column and the two header rows stay in place. Week columns show the week number (the year above week 1 and above the first column), the Monday's date on hover, and the current week tinted with a red underline and "(this week)" for screen readers. Group rows (gray) show their internal hours per week. Plan rows: code and title (a button opening the panel), hours per visit and frequency, "§ regulatory", the contractor's name, and "⚠ Longer than 3.5 h: will be split".
- **Load strip** (first body row, sticky): per week a bar of planned hours stacked by trade, in trade order with one fixed color per trade (`--color-chart-series-1` … `-6`: HVAC blue, Electrical orange, Fire safety aqua, Plumbing yellow, Network cabling pink, Security green; validated for color-vision deficiency on white; slots 3–5 are under 3:1, so the values are always written), 2 px gaps between segments, 4 px rounded top, a dashed capacity line, and the load written under it. Tight weeks: amber cell and amber bold figure; over capacity: red cell, red bold figure and ⚠. Hovering a week shows a tooltip (week, planned vs capacity, hours per trade, contractor visits); the same values are in a visually hidden text and in **"Show the weekly figures as a table"** below the grid.
- **Chips** (44 × 44 px buttons, the hours as text): planned (blue frame), work order created (green, ✓), skipped (gray, struck through), regulatory (§), contractor (dashed outline), outside its season (amber, ⚠), moved (double border, Phase 18). The accessible name and tooltip spell it all out ("PM-0001, Week 43, 2026, Work order created, work order WO-2026-00245, 3 h"). The chip open in the panel gets a red outline.
- **Plan panel** (split view): the visit clicked (status badge, due and planned week, its work order link, warnings), **Edit plan** (supervisors, admins), the plan's details and its next 8 visits. **Plan form**: plain labels ("What is done", "Every (weeks)", "First visit"), an asset code or a place (the place picker), the frequencies 1, 2, 4, 8, 13, 26, 52 offered, week pickers, and the contractor field shown only for contractor plans. Buttons that need the server are `.online-only`.
- **Dashboard widgets** (`/admin/widgets`, D65): the widget catalogue grouped as in the sidebar, one card per group packed in as many columns as the width allows (one on phones), one checkbox per widget (ticked: offered to supervisors), saved at once and announced; under a widget switched before, who did it and when. In an administrator's sidebar, a widget switched off carries an "Off" mark.
- **Planning settings** (`/admin/planning`): four fields with hints, and before saving the effect on the next 52 weeks ("Capacity of the next 52 weeks: 5,096 h → 5,824 h").
- The work order panel shows **Maintenance plan** (a link to the plan) and **Planned week**; supervisors and admins edit the planned week there (a week field, D55), and a released visit moves with it on the year planner (↔, "moved from …").
- The balancing assistant: see below (Phase 20).

## Year planner editing (Phase 18)

- **Who**: supervisors and admins. Technicians see the same grid with no drag, no Undo, and the blocked weeks read-only.
- **Movable visits**: planned visits from the current week on, with a grab cursor (and `touch-action: none`, so a finger drags them instead of scrolling). The **first planned visit of a row** stands for the series: a dark bar on its left edge, "first visit: moves the series" in the legend and in its accessible name. Visits with a work order (✓) and skipped ones do not move.
- **Drag**: press and move by more than 6 px (a shorter press is a click that opens the panel). The weeks the visit may go to are tinted green (the row's tolerance window, earlier only for a regulatory visit, never the past; any week from now on for the series); the dragged visit gets a red outline, the row a red bar; a dashed **ghost** chip shows where each visit would land (all of them for a series), and the visits that would leave their week fade. Under the pointer, an allowed week has a green frame, a refused one a red frame and background. Near the grid's edges it scrolls sideways.
- **Live impact**: while a visit is over an allowed week, the tiles (dashed frame) and the load strip ("Load (preview)") show the figures as if it were dropped there, and come back on cancel.
- **Drop**: an allowed week saves at once; the message line under the toolbar says what was done ("PM-0024: visit Week 17 → Week 18."), and focus goes to the moved visit. A refused week saves nothing, and the line says why in red, with the server's own words ("Week 23 is outside this visit's tolerance of ± 3 weeks around week 17."). Messages are also announced. On screens under 768 px the message line of the year planner, the week scheduler and My week floats at the bottom of the page, above the status bar, with a × to dismiss it, so it is seen however far the page is scrolled (M2).
- **Keyboard**: chips are buttons; ←/→ go to the previous or next visit of the row, ↑/↓ to the nearest visit of the row above or below. **Shift + ←/→** moves the selected visit week by week (the first planned visit moves the series), **Alt + Shift + ←/→** the series from any visit; each step is announced with the week and its load ("Visit to Week 17, 2027, load 184 %. Enter to confirm, Escape to cancel."). **Enter** saves, **Escape** cancels (without closing the panel), leaving the visit cancels.
- **Toolbar** above the grid: **Undo** and **Redo** (`.online-only`; the button text names the change, e.g. "Undo: PM-0024: visit Week 17 → Week 18"; `Ctrl+Z`, `Ctrl+Y`), **Blocked weeks**, and a one-line help on moving visits (the chips' description).
- **Plan panel**, for the visit clicked: "Move this visit to week" (week field, the allowed range in the hint, the reason under it when refused), "Skip this visit" with a reason (danger button), or "Restore this visit" for a visit skipped by hand. Under the plan's actions: **Move the series** ("First visit of the series", with what follows: planned visits move, visits moved by hand keep their offset, visits with a work order stay). All go through Undo / Redo.
- **Blocked weeks**: ⛔ under the week number in the header (the reasons in its tooltip and for screen readers), hatched cells in the rows of the sites concerned, ⚠ on the visits planned in them ("in a blocked week"). The **Blocked weeks** panel lists the weeks from now on (week, site or "Every site", reason, Remove) and a form to block a week (week, site, reason).

## Week scheduler (D52, Phase 19)

- **Sidebar**: "Week scheduler" for the maintenance roles (technicians read it without changing it); "My week" for technicians and supervisors (administrators who open `/my-week` read that it is for technicians and supervisors, D69).
- **Laptop screens** (1024 to 1599 px): the tray is 200–220 px wide and the day columns narrower, so Monday to Friday fit without scrolling sideways (D69).
- **Toolbar**: ← Previous, the week name, Next →, "This week" when another week is shown, and a week field; then **Open Saturday** / **Open Sunday** checkboxes (`.online-only`, supervisors and admins; others read "Monday to Friday this week") and **Undo** / **Redo** (D54: `.online-only`, disabled when there is nothing; their tooltip and accessible name say what they replay, e.g. "Undo: Block moved to Karim Benali, Tuesday 13 October"; `Ctrl+Z`, `Ctrl+Y`; the message line says "Undone: …", or why it was refused), a one-line help on dragging and the keyboard, and the message line (what was done in green, a refusal in red, also announced).
- **Tiles** (planner tile frame): Booked hours ("18 h / 140 h", attention when above), Left to schedule (planned and carried over; work without a week in the detail), Travel time (share of the booked hours), Sites per day (average and worst, attention from 2), Carried over (count, attention above 0).
- **Tray "To schedule"** (left column, sticky, scrolls on its own; above the grid under 1024 px): three folding groups with their counts, *Planned this week*, *Carried over*, *Not planned* (closed at first: it can be long). Cards are links to their panel: number and priority badge, title, site · place, trade · due date · assignee, then what is left in amber bold ("30 min left"), or "✓ Fully scheduled" with a green side line; "↻ Carried over from Week 40, 2026" on carried-over work.
- **Grid**: a table that scrolls inside its frame; the person column (name, role · trade, "13 h / 35 h", red when over) and the day headers ("Mon 5 Oct"; today underlined in red with "(today)" for screen readers; weekend days gray; "not open" under a closed day that holds blocks) stay in place. A cell starts with its total vs capacity ("6 h / 7 h · Leave", a link to the hours panel for supervisors and admins) and the sites of the day; warnings follow in amber with ⚠ (red on an overloaded day, whose cell turns red): "Over capacity: 8 h 30 / 7 h", "Work on a day off", "Weekend day not open", "2 sites: add travel time" with an **Add travel time** link. Days with 0 h are hatched. Then the blocks, and **+ Time** at the end.
- **Blocks** (links to their panel, at least 44 px high): work blocks blue with a thick left edge ("WO-2026-00012 · title", then length · site · place, "helper" when the person is not the assignee, the note in italics); appointments first, black edge, "🔒 10:00–12:00", and "locked by …" in their accessible name; travel, preparation and other time with a dashed gray frame and their kind written.
- **Drag** (supervisors and admins; pointer, so mouse, pen and touch): press and move more than 6 px; the card or block follows the pointer, the original fades, the cell under it gets a green frame. A card dropped on a day creates its block when what is left fits in one block; a longer job, or one without an estimate, opens its panel with the proposal starting on that day. A block dropped on another day or person moves there. A locked appointment does not move: the message line says "This appointment is locked at 10:00: unlock it before moving it." Escape cancels a drag.
- **Keyboard**: cards and blocks are links (Enter opens their panel, which does everything a drag does); `+` / `−` on a focused block change its length by half an hour (refused with a message on an appointment, below 30 min or above the longest block); `Ctrl+Z` / `Ctrl+Y` undo and redo outside text fields.
- **Phones** (< 768 px, D68): the help says "Tap a work order in “To schedule” to schedule it, or a block to move, resize or remove it." (also on any touch screen, `pointer: coarse`); the tiles become one line ("18.5 h booked of 133 h · 46.5 h left to schedule · 2 carried over"); the tray folds behind "Show the work orders to schedule (n)"; the grid shows one day at a time, chosen with a Mon–Fri switcher (today first; the choice is kept while the week is redrawn).
- **Panels** (split view): *Schedule WO-…*: the work order's facts (estimate, already scheduled, left), an estimate field when it has none, then one row per block (person, day, length, Remove) prefilled with the proposal (3 h 30 per day from the drop), "+ Add a block", the running total ("6 h in 2 blocks"), **Schedule**. *Block*: person, day, length, where, appointment, note, work order link; **Appointment** (start time and "Lock at this time", or "Unlock"), **Move or resize** (person, day, length, note; only the note while locked), **Remove this block** (danger, confirmed). *Add time*: kind, person, day, length, note. *Hours of the day*: hours (0 h = absent), reason, note, and "Back to the usual hours".

## My week (D52, Phase 19)

- Week switcher like the scheduler, the week's total ("13 h scheduled of 35 h"), and offline the info banner "Offline: your week as saved on this device on …. Changes need a connection."
- One card per day (Monday to Friday and open weekend days): the date (and "· Leave" when off), the total vs capacity and the sites, warnings (technicians read "2 sites on this day", supervisors "2 sites: add travel time"), then the blocks: appointments first ("🔒 10:00–12:00 · locked by Julien Bernard"), then the others in the person's order. Each block: the work order as a link (it opens offline too; its panel's "Back to My week" returns here), its status and priority badges, length · site · place · location, the note; a **Change…** button unfolds **Move up** / **Move down** (not on appointments, disabled at the ends), and a start time with **Lock at this time**, or **Unlock the time**. Every button is `.online-only` and disabled while offline.
- **Today** (D68): the current week opens scrolled to today (focus on its heading), framed in blue with a "Today" badge; days gone by are grayed and have no Change… button.

## Balancing assistant (D53, Phase 20)

- **Suggest a smoother plan**: a secondary button of the planner toolbar, after Blocked weeks (supervisors and admins, `.online-only`). It opens the panel "Suggested moves" for the weeks and filters shown.
- **Panel**: one sentence saying how many visits could move and within which rules ("Nothing is saved until you accept"), then a before → after table (*Peak week load*, *Weeks over capacity*, *Tight weeks*, *Busiest week of one trade*; lower values in green bold with "(lower)" for screen readers), **Tick all** / **Untick all**, and the moves, each a checkbox (ticked at first) with "PM-0011 · Week 46 → Week 47", the plan's title, trade, hours and "§ regulatory", and "Due Week 46. Load now: Week 46 107%, Week 47 27%." Then **Accept N moves** (primary, disabled when none is ticked) and **Discard**. Without any possible move, a sentence says the weeks are already as smooth as the plans allow.
- **On the grid**: each ticked move shows a dashed ghost chip in the week it would go to and fades the visit leaving; the tiles (dashed frame) and the load strip ("Load (preview)") show the figures with the ticked moves. Unticking a move updates all three at once.
- **Accept**: the moves are sent one by one; the message line then says "Balancing: 29 visits moved." (and how many were refused, with the first reason), the panel closes, and **Undo** ("Undo: Balancing: 29 visits moved") puts them all back in one step.

## Screenshots

The README shows the main screens with pictures from `docs/img/` (D78), and `docs/showcase.md` every feature with more pictures from `docs/img/showcase/` (D84). Take them again when a screen they show changes visibly, in the same commit as the change if possible: `cd backend && npm run docs:screenshots` (Chromium needed, about four minutes); `npm run docs:screenshots -- showcase/plan` takes only the pictures whose name starts with that prefix.

- **Data**: the script (`backend/scripts/take-screenshots.js`) creates a throwaway database with the mock data and conflicts in a temporary folder and starts its own server on it (port 3100, `SHOTS_PORT`); the database of `.env` is never opened. The pictures only ever show mock names and sites.
- **Browser**: headless Chromium (`SHOTS_CHROME` to choose another command) in English, since the browser's own week and date fields follow its language (see Language); scrollbars hidden. Each user starts from an empty session, and the pictures are grouped by user (the login is rate limited); the script stops if a login fails or two pictures come out identical.
- **Sizes**: computers 1440 × 900 at 1× (the whole dashboard: 1440 × 2400); phones 402 × 874 (iPhone 17) at 2×, to keep the files small.
- **Steps** (showcase): a shot may run a step in the page before the picture (open a dialog, tick every dashboard widget, scroll, type a work report), cut the network (offline), stay on the previous page, or call the API as the logged-in user to add mock records the seed lacks (three suggestions, two blocked weeks).
- **Pictures** (PNG, named after the screen; the list is `SHOTS` in the script). README:

| File | User | Page | Size |
|---|---|---|---|
| `dashboard.png` | `supervisor1` | `/dashboard` | computer |
| `work-orders.png` | `supervisor1` | a work order in progress on an asset, without a conflict (table + detail panel) | computer |
| `conflict.png` | `supervisor1` | the open work order conflict | computer |
| `year-planner.png` | `supervisor1` | `/planning` | computer |
| `week-scheduler.png` | `supervisor1` | `/schedule` | computer |
| `my-week-phone.png` | `technician1` | `/my-week` | phone |
| `requests-phone.png` | `user1` | `/requests` | phone |
| `request-phone.png` | `user1` | a request of `user1` in progress | phone |

Showcase (`showcase/` in `docs/img/`, in the order taken):

| File | User | Page | Size |
|---|---|---|---|
| `login.png` | — | `/login`, no session | computer |
| `dashboard-full.png` | `supervisor1` | `/dashboard`, the whole page | 1440 × 2400 |
| `dashboard-flow.png` | `supervisor1` | `/dashboard` after ticking every widget, at Opened vs closed | computer |
| `dashboard-compliance.png` | `supervisor1` | same page, at Preventive maintenance compliance | computer |
| `dashboard-assets.png` | `supervisor1` | same page, at Assets with the most breakdowns | computer |
| `dashboard-people.png` | `supervisor1` | same page, at Workload per person | computer |
| `dashboard-drill.png` | `supervisor1` | `/work-orders` filtered on unfinished and overdue | computer |
| `work-order-history.png` | `supervisor1` | the work order of `work-orders.png`, history opened | computer |
| `review-request.png` | `supervisor1` | the staff request waiting for review | computer |
| `request-conversation.png` | `supervisor1` | the on-hold request of `user1` with the most comments, at its comments | computer |
| `assets.png` | `supervisor1` | `/assets` filtered on broken down and out of service | computer |
| `asset.png` | `supervisor1` | the asset with the most work orders | computer |
| `work-order-new.png` | `supervisor1` | `/work-orders/new` for that asset | computer |
| `find-work-order.png` | `supervisor1` | Find a work order, a job typed and searched | computer |
| `conflicts.png` | `supervisor1` | `/conflicts` | computer |
| `conflict-locked.png` | `supervisor1` | the work order of the open conflict | computer |
| `plan.png` | `supervisor1` | the plan of the first planned visit, that visit open | computer |
| `blocked-weeks.png` | `supervisor1` | `/planning/blocked-weeks`, two weeks blocked first | computer |
| `suggestions.png` | `supervisor1` | `/planning/suggestions` | computer |
| `schedule-work-order.png` | `supervisor1` | the first work order of this week's tray | computer |
| `places.png` | `supervisor1` | `/admin/locations` | computer |
| `audit-log.png` | `supervisor1` | `/audit-log` | computer |
| `dashboard-technician.png` | `technician1` | `/dashboard` | computer |
| `work-orders-phone.png` | `technician1` | `/work-orders` | phone |
| `work-order-phone.png` | `technician1` | a work order in progress assigned to `technician1` | phone |
| `menu-phone.png` | `technician1` | `/my-week`, menu open | phone |
| `feedback.png` | `technician1` | `/my-week`, Suggest an improvement with a text typed | computer |
| `offline.png` | `technician1` | the work order of `work-order-phone.png`, offline, a work report saved | computer |
| `request-new-phone.png` | `user1` | `/requests/new` | phone |
| `requests-all-phone.png` | `user1` | `/requests/all` | phone |
| `request-conversation-phone.png` | `user1` | the request of `request-conversation.png`, at its comments | phone |
| `users.png` | `admin` | `/admin/users/:id` of `technician1` | computer |
| `place.png` | `admin` | the site with the most places | computer |
| `level-types.png` | `admin` | `/admin/locations/types` | computer |
| `feedback-inbox.png` | `admin` | `/admin/feedback` | computer |
| `planning-settings.png` | `admin` | `/admin/planning` | computer |
| `widget-settings.png` | `admin` | `/admin/widgets` | computer |
