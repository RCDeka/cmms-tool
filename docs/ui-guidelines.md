# UI Guidelines

Black, red and white brand after Société Générale (D41), on an accessible baseline (Q3). Colors and fonts are **design tokens** (CSS custom properties) in `frontend/assets/css/base.css`. Changing the brand means editing tokens only, never component styles.

## Language

The interface is in English (D16). Field and value labels come from `assets/js/labels.js`. The app name comes from `APP_NAME`: "Fast-CMMS" (Q6).

## Layout (brief)

- `<body>`: CSS Grid, `100dvh`. Sidebar of 250 px on the left, fixed and vertical (`<nav>`), then `#main-content` (`<main>`).
- Main area (`#app-main`): top bar with the page heading (and the menu button on small screens), then `#main-content`, then the status bar (`#status-bar`): online/offline state, pending sync count, current user.
- `#main-content` default: `grid-template-columns: 1fr` (table only). With `.split-view`: `1fr 1fr` (table + detail panel). `#detail-container` is `.hidden` by default.
- In split view the table keeps only its key columns (`splitColumns` in `entities.js`: code, name, status for assets; number, title, priority, status for work orders); the detail panel shows everything else.
- Below 1024 px (e.g. half of a FullHD screen): sidebar hidden behind a burger button; it opens as an overlay and closes on page choice, backdrop click or Escape.
- Mobile (< 768 px): in split view, the table is hidden and the detail panel is full screen with a "Back to list" button.

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

## Staff screens (D46)

- **Sidebar** for `STAFF`: My open requests (home), All my requests, New request; then their account and Log out. The maintenance links are not shown.
- **Request lists**: cards rather than a table (staff read a handful of requests, on any screen size). Each card: the title as a link, a stage badge with text (Received, Assigned, In progress, On hold, Done, Cancelled), a **Next step** sentence, then number, location, date sent and comment count. In-progress cards have a red side line, on-hold cards an amber one; the badge text always says it too.
- **Request page**: a status box (badge, four steps Received → Assigned → In progress → Done with ✓ on done steps, the current one in bold over a red line, `aria-current="step"`, and a visually hidden "(done)" / "(current step)" / "(to come)"; "On hold" replaces "In progress" when paused), the next step, "What was done" (work report) once closed, the details sent, a history of the status steps, and the comments with an "Add a comment" form.
- **Request form**: plain questions ("What is the problem?", "Where exactly?", "Kind of problem", "How urgent is it?"), with examples in the hints. The two lists start with **"I don't know"**, selected by default. The site defaults to the user's site.
- **Review box** (D47): at the top of the work order panel of a request waiting for review, for supervisors and admins: amber frame, "Staff request to review", who sent it and when, then *Assign to* (required; technicians first, then supervisors), type, priority, category, due date and **Approve and assign** (primary); below a line, *Reason for rejection* and **Reject request** (danger, with a confirmation). Both buttons are `.online-only`. Technicians see an info notice. The dashboard tile **Staff requests to review** uses the attention style when above zero; the list filter is the checkbox **Requests to review** (supervisors and admins).
- Staff wording of the review: "Waiting for review" (step Received), "Approved" (step Approved and assigned), "Rejected" (danger badge, the reason quoted in the next step, no step line).
- **Comments** (staff page and work order panel): oldest first, author and time on top; the requester's comments carry a red side line, the team's a gray one. Staff see team members as "Name (maintenance team)"; the team sees "Name (requester)" and roles. Send buttons are `.online-only`.

## Pagination (brief)

`◀◀ First` · `◀ Previous` · `Page X / Y` · `Next ▶` · `Last ▶▶`. Buttons are disabled at the bounds. 50 rows per page. On the asset and work order tables, a second copy sits at the start of the row above the table (record count and "New …" at its end) when there is more than one page, so changing page needs no scrolling (D42). Focus stays on the button used, in the copy used.

## Table sort (D42)

Every column title of the asset and work order tables is a button. A click sorts by that column ascending; a second click on the same column flips to descending, and so on. The sorted column has `aria-sort` and an arrow (▲ ascending, ▼ descending); the other columns show a faint ↕. Enumerated columns follow business order (priority Low → Urgent), and empty values (no assignee, no due date) come last. Focus stays on the column title after the sort. The default order (assets by code, work orders newest first) is not in the URL.

## Planned: planning screens (D48)

The year planner and week scheduler (drag and drop with live impact, keyboard moves and undo, chips and blocks that always carry text or an icon besides their style) are described in `docs/spec-preventive-maintenance.md` §7–9.
