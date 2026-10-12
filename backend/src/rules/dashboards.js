// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Personal dashboards and their widget catalogue (docs/spec-dashboards.md, D59). Pure.
// The frontend keeps the same catalogue with its labels (frontend/assets/js/widgets.js);
// a frontend test checks that both agree.

/** Periods offered by the dashboard filters, in days (K8). */
export const DASHBOARD_PERIODS = [30, 90, 365];
export const DEFAULT_PERIOD = 30;
/** BR-K2: dashboards per user. */
export const MAX_DASHBOARDS = 20;
export const DASHBOARD_NAME_MAX = 60;
/** Records behind a widget sent for the CSV export, at most. */
export const ROWS_LIMIT = 5000;

/**
 * The catalogue, in sidebar order. `filters`: dashboard filters the widget uses (`period`,
 * `sites`, `categories`). `rows`: records behind it for the CSV export and the drill-down
 * (`null`: none). `options`: settings saved with the widget, each with its allowed values
 * (the first is the default).
 */
export const WIDGETS = [
  { key: 'open_work_orders', filters: ['sites', 'categories'], rows: 'work_orders' },
  { key: 'in_progress_work_orders', filters: ['sites', 'categories'], rows: 'work_orders' },
  { key: 'closed_this_month', filters: ['sites', 'categories'], rows: 'work_orders' },
  { key: 'overdue_work_orders', filters: ['sites', 'categories'], rows: 'work_orders' },
  { key: 'assets_broken_down', filters: ['sites', 'categories'], rows: 'assets' },
  { key: 'requests_to_review', filters: ['sites', 'categories'], rows: 'work_orders' },
  { key: 'pending_conflicts', filters: [], rows: null },
  // Flow and backlog (Phase 22).
  { key: 'opened_vs_closed', filters: ['period', 'sites', 'categories'], rows: 'work_orders' },
  { key: 'backlog_age', filters: ['sites', 'categories'], rows: 'work_orders' },
  { key: 'backlog_weeks', filters: ['sites', 'categories'], rows: 'work_orders' },
  {
    key: 'planned_vs_reactive',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
    options: { basis: ['count', 'hours'] },
  },
  { key: 'by_category', filters: ['period', 'sites'], rows: 'work_orders' },
  { key: 'by_status', filters: ['period', 'sites', 'categories'], rows: 'work_orders' },
  { key: 'my_work', filters: [], rows: 'work_orders' },
  { key: 'recent_activity', filters: ['sites', 'categories'], rows: 'work_orders' },
];

export const WIDGET_KEYS = WIDGETS.map((w) => w.key);
const BY_KEY = new Map(WIDGETS.map((w) => [w.key, w]));

/** Catalogue entry of a key, or undefined. */
export function widgetDef(key) {
  return BY_KEY.get(key);
}

/** Templates offered when creating a dashboard (§6.5; the others come with their widgets). */
export const TEMPLATES = {
  // Today's home dashboard: never grows with new widgets.
  OVERVIEW: [
    'open_work_orders',
    'in_progress_work_orders',
    'closed_this_month',
    'overdue_work_orders',
    'assets_broken_down',
    'requests_to_review',
    'pending_conflicts',
    'by_category',
    'by_status',
    'my_work',
    'recent_activity',
  ],
  BACKLOG: [
    'overdue_work_orders',
    'opened_vs_closed',
    'backlog_age',
    'backlog_weeks',
    'planned_vs_reactive',
  ],
  EMPTY: [],
};
export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

/** Widgets of a template, in the stored shape. */
export function templateWidgets(template) {
  return TEMPLATES[template].map((key) => ({ key, options: {} }));
}

/**
 * BR-K3: every key known and at most once, options known with allowed values. Returns the
 * first problem, or null.
 * @param {{ key: string, options?: object }[]} widgets
 */
export function widgetsProblem(widgets) {
  const seen = new Set();
  for (const { key, options = {} } of widgets) {
    const def = BY_KEY.get(key);
    if (!def) return `Unknown widget: ${key}`;
    if (seen.has(key)) return `This widget is already on the dashboard: ${key}`;
    seen.add(key);
    for (const [name, value] of Object.entries(options)) {
      const allowed = def.options?.[name];
      if (!allowed) return `Unknown option of ${key}: ${name}`;
      if (!allowed.includes(value)) return `Invalid ${name} for ${key}: ${value}`;
    }
  }
  return null;
}

/** Options of a widget with their defaults filled in. */
export function widgetOptions(key, options = {}) {
  const defaults = Object.entries(BY_KEY.get(key)?.options ?? {}).map(([name, values]) => [
    name,
    values[0],
  ]);
  return { ...Object.fromEntries(defaults), ...options };
}

/** BR-K2: same name for the user, ignoring case ("Saclay" = "SACLAY", "Équipe" ≠ "Equipe"). */
export function sameName(a, b) {
  return a.localeCompare(b, 'en', { sensitivity: 'accent' }) === 0;
}

/**
 * New order of a user's dashboards: `ids` must hold each of their dashboards once.
 * @param {number[]} current ids in the current order
 * @param {number[]} ids
 * @returns {boolean}
 */
export function isSameSet(current, ids) {
  return (
    ids.length === current.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => current.includes(id))
  );
}

/**
 * Filters stored on a dashboard, with the defaults filled in.
 * @param {{ period?: number, sites?: string[], categories?: string[] }} filters
 */
export function withFilterDefaults(filters = {}) {
  return {
    period: filters.period ?? DEFAULT_PERIOD,
    sites: filters.sites ?? [],
    categories: filters.categories ?? [],
  };
}

/**
 * The filters a widget actually uses: the others are dropped, so its figures (and the cache
 * of the dashboard) never depend on them.
 * @param {string} key
 * @param {ReturnType<typeof withFilterDefaults>} filters
 */
export function filtersFor(key, filters) {
  const used = BY_KEY.get(key).filters;
  return {
    period: used.includes('period') ? filters.period : null,
    sites: used.includes('sites') ? filters.sites : [],
    categories: used.includes('categories') ? filters.categories : [],
  };
}
