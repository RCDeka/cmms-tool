# UI Guidelines

Neutral, accessible baseline (Q3). Colors and fonts are **design tokens** (CSS custom properties) in `frontend/assets/css/base.css`. Changing the brand means editing tokens only, never component styles.

## Language

The interface is in French; labels come from `assets/js/labels.js`. The app name comes from `APP_NAME` (working title "Mini-GMAO", Q6).

## Layout (brief)

- `<body>`: CSS Grid, `100dvh`. Sidebar of 250 px on the left, fixed and vertical (`<nav>`), then `#main-content` (`<main>`).
- Status bar at the bottom of `#main-content`: online/offline state, pending sync count, current user.
- `#main-content` default: `grid-template-columns: 1fr` (table only). With `.split-view`: `1fr 1fr` (table + fiche). `#fiche-container` is `.hidden` by default.
- Mobile (< 768 px): sidebar hidden behind a burger button. In split view, the table is hidden and the fiche is full screen with a "Retour à la liste" button.

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
| Selected | `--color-row-selected` background | `aria-selected="true"`, left border in primary color |
| Conflict | `--color-warning-highlight` background | ⚠ icon + badge "Conflit" |
| Équipement `En panne` | thin left border in `--color-danger` | status badge with the text "En panne" |
| Pending sync | — | small "En attente" badge |

Badges always show text. Badge class names come from the value with accents removed and spaces turned into hyphens: `badge-statut-en-service`, `badge-criticite-haute`, `badge-famille-cvc`.

## Accessibility (brief, mandatory)

- Semantic HTML: `<nav>`, `<main>`, `<table>` with `<caption>` and `<th scope="col">`, `<dl>` for fiche fields, `<button>` for actions (never a clickable `<div>`).
- Conflicts and states: color + icon + text, never color alone.
- Touch targets ≥ 44 × 44 px.
- Full keyboard use: rows are focusable, `Enter` opens the fiche, `Escape` closes it and returns focus to the row. Arrow keys move between rows. Focus is always visible (`--focus-ring`).
- Icon-only buttons have an `aria-label` (e.g. `✕` → "Fermer la fiche").
- Dynamic messages (saved, offline, update available, conflict) are announced through an `aria-live="polite"` region.
- Respect `prefers-reduced-motion`.

## Pagination (brief)

`◀◀ Première` · `◀ Précédente` · `Page X / Y` · `Suivante ▶` · `Dernière ▶▶`. Buttons are disabled at the bounds. 50 rows per page.
