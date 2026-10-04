# UI Guidelines

Neutral, accessible baseline (Q3). Colors and fonts are **design tokens** (CSS custom properties) in `frontend/assets/css/base.css`. Changing the brand means editing tokens only, never component styles.

## Language

The interface is in English (D16). Field and value labels come from `assets/js/labels.js`. The app name comes from `APP_NAME`: "Fast-CMMS" (Q6).

## Layout (brief)

- `<body>`: CSS Grid, `100dvh`. Sidebar of 250 px on the left, fixed and vertical (`<nav>`), then `#main-content` (`<main>`).
- Main area (`#app-main`): top bar with the page heading (and the menu button on small screens), then `#main-content`, then the status bar (`#status-bar`): online/offline state, pending sync count, current user.
- `#main-content` default: `grid-template-columns: 1fr` (table only). With `.split-view`: `1fr 1fr` (table + detail panel). `#detail-container` is `.hidden` by default.
- In split view the table keeps only its key columns (`splitColumns` in `entities.js`: code, name, status for assets; number, title, priority, status for work orders); the detail panel shows everything else.
- Mobile (< 768 px): sidebar hidden behind a burger button. In split view, the table is hidden and the detail panel is full screen with a "Back to list" button.

## Design tokens (starting values)

```css
:root {
  /* Neutrals */
  --color-bg: #f6f7f9;          --color-surface: #ffffff;
  --color-border: #d9dde3;      --color-text: #1c2330;      --color-text-muted: #5a6475;
  /* Brand */
  --color-primary: #1f5fad;     --color-primary-contrast: #ffffff;
  --color-row-selected: #e3edf9;
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
| Selected | `--color-row-selected` background | `aria-current="true"` (`aria-selected` is only valid in grid widgets), left border in primary color |
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

- **KPI tiles** (stat tiles): sentence-case label, value in the same sans with proportional figures, the whole tile is a link to the matching list. Tiles whose count needs attention (overdue work orders, broken-down assets, conflicts) add an amber edge and a "⚠ Needs attention" badge with text when the count is above zero. Technicians get no conflict tile.
- **Chart** (Chart.js, loaded on demand): one series, so **one color for every bar** (`--color-primary`, validated ≥ 3:1 on the card with the data-viz palette validator), never a darker-is-bigger ramp on these nominal categories. Horizontal bars ≤ 24 px with a 4 px rounded end, sorted by count with "Unspecified" last, value at the bar tip in text color, no legend (the title names the series), solid hairline grid (`--color-grid`), tooltip on hover.
- Every chart has a text equivalent (`aria-label` summary on the canvas) and a "Show as a table" view; if the chart library is unavailable, the table opens instead.
- The frame grows with the number of bars (no nested scroll). A refresh keeps the previous render, dimmed, until the new figures arrive (no skeleton flash).
- Offline, the last saved figures are shown with "Offline: figures saved on this device on <date>".

## Pagination (brief)

`◀◀ First` · `◀ Previous` · `Page X / Y` · `Next ▶` · `Last ▶▶`. Buttons are disabled at the bounds. 50 rows per page.
