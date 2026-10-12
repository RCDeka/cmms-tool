// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Widget catalogue of the personal dashboards (docs/spec-dashboards.md, D59): labels, sizes
// and sidebar groups, the body of each widget, and its table view. The table view is the
// one source of the "Show as a table" view, the Figures (CSV) export and the image of the
// widgets without a chart. Keys, filters and records must match the backend catalogue
// (backend/src/rules/dashboards.js; checked by a test).
import {
  activityList,
  categoryChartBody,
  chartRows,
  drawCategoryChart,
  drawStatusChart,
  myWorkNote,
  myWorkSwitch,
  numberFormat,
  percentFormat,
  statusChartBody,
  statusRows,
  workList,
} from './dashboard.js';
import { h } from './dom.js';
import { formatDate, formatDateTime, personName } from './format.js';
import { valueLabel } from './labels.js';
import { FLOW_WIDGETS, tableElement } from './widgets-flow.js';

export const PERIODS = [30, 90, 365];
export const DEFAULT_FILTERS = { period: 30, sites: [], categories: [] };

/** Sidebar groups, in order. */
export const WIDGET_GROUPS = ['Key figures', 'Flow and backlog', 'Work orders', 'Lists'];

/**
 * The catalogue, in sidebar order. `size`: S (tile, 1 column), M (2), L (4).
 * `filters` and `rows`: as on the server. `href`: the list behind a tile. `attention`: a
 * count above zero needs someone's attention.
 */
export const WIDGETS = [
  {
    key: 'open_work_orders',
    label: 'Open work orders',
    group: 'Key figures',
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?status=OPEN',
  },
  {
    key: 'in_progress_work_orders',
    label: 'Work orders in progress',
    group: 'Key figures',
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?status=IN_PROGRESS',
  },
  {
    key: 'closed_this_month',
    label: 'Closed this month',
    group: 'Key figures',
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?status=CLOSED',
  },
  {
    key: 'overdue_work_orders',
    label: 'Overdue work orders',
    group: 'Key figures',
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?overdue=true',
    attention: true,
  },
  {
    key: 'assets_broken_down',
    label: 'Assets broken down',
    group: 'Key figures',
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'assets',
    href: '/assets?status=BROKEN_DOWN',
    attention: true,
  },
  {
    key: 'requests_to_review',
    label: 'Staff requests to review',
    group: 'Key figures',
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?to_review=true',
    attention: true,
  },
  {
    key: 'pending_conflicts',
    label: 'Conflicts to arbitrate',
    group: 'Key figures',
    size: 'S',
    filters: [],
    rows: null,
    href: '/conflicts',
    attention: true,
  },
  {
    key: 'opened_vs_closed',
    label: 'Opened vs closed',
    group: 'Flow and backlog',
    size: 'L',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'backlog_age',
    label: 'Backlog by age and priority',
    group: 'Flow and backlog',
    size: 'M',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'backlog_weeks',
    label: 'Backlog in weeks of work',
    group: 'Flow and backlog',
    size: 'M',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'planned_vs_reactive',
    label: 'Planned vs reactive work',
    group: 'Flow and backlog',
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
    options: { basis: ['count', 'hours'] },
  },
  {
    key: 'by_category',
    label: 'Work orders by category',
    group: 'Work orders',
    size: 'M',
    filters: ['period', 'sites'],
    rows: 'work_orders',
  },
  {
    key: 'by_status',
    label: 'Work orders by status',
    group: 'Work orders',
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  { key: 'my_work', label: 'My work', group: 'Lists', size: 'M', filters: [], rows: 'work_orders' },
  {
    key: 'recent_activity',
    label: 'Recent activity',
    group: 'Lists',
    size: 'M',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
  },
];

const BY_KEY = new Map(WIDGETS.map((w) => [w.key, w]));

/** Catalogue entry of a key, or undefined (a widget of a newer version, say). */
export function widgetDef(key) {
  return BY_KEY.get(key);
}

const isTile = (def) => def.size === 'S';

/** "Paris La Défense Headquarters" or "3 sites". Pure. */
function sitesText(sites) {
  return sites.length === 1 ? sites[0] : `${sites.length} sites`;
}

function categoriesText(categories) {
  return categories.length === 1
    ? valueLabel('category', categories[0])
    : `${categories.length} trades`;
}

/**
 * What the figures of a widget cover, e.g. "Last 90 days · Paris · 2 trades", and the
 * dashboard filters it does not use ("Site filter not used"). All sites and all trades are
 * the default and go unsaid. Pure.
 * @param {{ filters: string[] }} def
 * @param {typeof DEFAULT_FILTERS} filters
 */
export function widgetScope(def, filters) {
  const parts = [];
  const uses = (name) => def.filters.includes(name);
  if (uses('period')) parts.push(`Last ${filters.period} days`);
  if (uses('sites') && filters.sites.length) parts.push(sitesText(filters.sites));
  if (uses('categories') && filters.categories.length) {
    parts.push(categoriesText(filters.categories));
  }
  const unused = [];
  if (!uses('sites') && filters.sites.length) unused.push('site');
  if (!uses('categories') && filters.categories.length) unused.push('trade');
  if (unused.length) {
    const names = unused.join(' and ');
    parts.push(`${names[0].toUpperCase()}${names.slice(1)} filter not used`);
  }
  return parts.join(' · ');
}

/**
 * The list behind a tile, with the dashboard's sites and trades when the tile uses them, so
 * the list shows what the tile counts. Sites are joined by "|", as in the lists (D45). Pure.
 */
export function tileHref(def, filters) {
  if (!def.href) return null;
  const [path, search = ''] = def.href.split('?');
  const query = new URLSearchParams(search);
  if (def.filters.includes('sites') && filters.sites.length) {
    query.set('site', filters.sites.join('|'));
  }
  if (def.filters.includes('categories') && filters.categories.length) {
    query.set('category', filters.categories.join(','));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/**
 * The work order list of one segment of a widget (a bar, a slice, a cell; K9), with the
 * dashboard filters the widget uses: `period` for the server, `site` and `category` as the
 * list's own filters. Pure.
 * @param {{ key: string, filters: string[] }} def
 * @param {string | null} segment
 * @param {typeof DEFAULT_FILTERS} filters
 */
export function drillHref(def, segment, filters) {
  const query = new URLSearchParams({
    drill: segment === null ? def.key : `${def.key}:${segment}`,
  });
  if (def.filters.includes('period')) query.set('period', String(filters.period));
  if (def.filters.includes('sites') && filters.sites.length) {
    query.set('site', filters.sites.join('|'));
  }
  if (def.filters.includes('categories') && filters.categories.length) {
    query.set('category', filters.categories.join(','));
  }
  return `/work-orders?${query}`;
}

/** Name of a segment for the drill-down list: "Urgent, 91+ days old". Pure. */
function segmentLabel(key, segment) {
  if (FLOW_WIDGETS[key]) return FLOW_WIDGETS[key].segment(segment);
  if (key === 'by_category') return valueLabel('category', segment);
  if (key === 'by_status') return valueLabel('work_order_status', segment);
  if (key === 'my_work') return segment === 'today' ? 'today' : 'next 7 days';
  return segment;
}

/**
 * What a drill-down list shows: "Backlog by age and priority: Urgent, 91+ days old" (and the
 * period when the widget uses one), or null for an unknown widget. Pure.
 * @param {string} drill `<widget>[:<segment>]`
 * @param {number} [period]
 */
export function drillLabel(drill, period) {
  const at = drill.indexOf(':');
  const key = at < 0 ? drill : drill.slice(0, at);
  const def = widgetDef(key);
  if (!def) return null;
  const segment = at < 0 ? '' : segmentLabel(key, drill.slice(at + 1));
  const days = def.filters.includes('period')
    ? ` (last ${period ?? DEFAULT_FILTERS.period} days)`
    : '';
  return `${def.label}${segment ? `: ${segment}` : ''}${days}`;
}

const workOrderTitle = (wo) => `${wo.number} — ${wo.title}`;

/**
 * Table view of a widget: the values it draws, with labels. Pure.
 * @param {string} key
 * @param {object} data the widget's figures from the server
 * @param {{ myWorkRange?: 'today' | 'week', options?: object,
 *   drill?: (segment: string) => string }} [state] `drill` adds the links of the table view
 * @returns {{ columns: { label: string, numeric?: boolean }[], rows: unknown[][],
 *   links?: (string | null)[][] }}
 */
export function widgetTable(key, data, { myWorkRange = 'today', options, drill } = {}) {
  const def = widgetDef(key);
  if (FLOW_WIDGETS[key]) return FLOW_WIDGETS[key].table(data, { options, drill });
  if (isTile(def)) {
    return {
      columns: [{ label: 'Figure' }, { label: 'Value', numeric: true }],
      rows: [[def.label, data.value]],
    };
  }
  switch (key) {
    case 'by_category':
      return {
        columns: [{ label: 'Category' }, { label: 'Work orders', numeric: true }],
        rows: chartRows({ by_category: data.items }).map((r) => [r.label, r.count]),
      };
    case 'by_status':
      return {
        columns: [
          { label: 'Status' },
          { label: 'Work orders', numeric: true },
          { label: 'Share', numeric: true },
        ],
        rows: statusRows({ by_status: data.items }).map((r) => [
          r.label,
          r.count,
          percentFormat.format(r.share),
        ]),
      };
    case 'my_work':
      return {
        columns: [{ label: 'Work order' }, { label: 'Priority' }, { label: 'Due' }],
        rows: (myWorkRange === 'week' ? data.week_items : data.today_items).map((wo) => [
          workOrderTitle(wo),
          valueLabel('work_order_priority', wo.priority),
          wo.due_on ? formatDate(wo.due_on) : 'No due date',
        ]),
      };
    case 'recent_activity':
      return {
        columns: [
          { label: 'Work order' },
          { label: 'Status' },
          { label: 'Updated' },
          { label: 'By' },
        ],
        rows: data.items.map((wo) => [
          workOrderTitle(wo),
          valueLabel('work_order_status', wo.status),
          formatDateTime(wo.updated_at),
          wo.updated_by ? personName(wo.updated_by) : '',
        ]),
      };
    default:
      return { columns: [], rows: [] };
  }
}

/** Columns of the Work orders (CSV) and Assets (CSV) exports: label → value. */
const RECORD_COLUMNS = {
  work_orders: [
    ['Number', (wo) => wo.number],
    ['Title', (wo) => wo.title],
    ['Type', (wo) => valueLabel('work_order_type', wo.type)],
    ['Status', (wo) => valueLabel('work_order_status', wo.status)],
    ['Priority', (wo) => valueLabel('work_order_priority', wo.priority)],
    ['Category', (wo) => valueLabel('category', wo.category ?? 'UNSPECIFIED')],
    ['Site', (wo) => wo.site],
    ['Location', (wo) => wo.location],
    ['Asset', (wo) => wo.asset?.code],
    ['Assignee', (wo) => (wo.assignee ? personName(wo.assignee) : '')],
    ['Created', (wo) => wo.created_on],
    ['Due', (wo) => wo.due_on],
    ['Started', (wo) => wo.started_on],
    ['Closed', (wo) => wo.closed_on],
    ['Estimated hours', (wo) => wo.estimated_hours],
    ['Actual hours', (wo) => wo.actual_hours],
  ],
  assets: [
    ['Code', (a) => a.code],
    ['Name', (a) => a.name],
    ['Site', (a) => a.site],
    ['Building', (a) => a.building],
    ['Floor', (a) => a.floor],
    ['Category', (a) => valueLabel('category', a.category)],
    ['Criticality', (a) => valueLabel('criticality', a.criticality)],
    ['Status', (a) => valueLabel('asset_status', a.status)],
    ['Brand', (a) => a.brand],
    ['Model', (a) => a.model],
    ['Serial number', (a) => a.serial_number],
    ['Last serviced', (a) => a.last_serviced_on],
  ],
};

/**
 * Records behind a widget as CSV columns and rows (dates as YYYY-MM-DD, which spreadsheets
 * read as dates). Pure.
 * @param {'work_orders' | 'assets'} kind
 * @param {object[]} items
 */
export function recordsTable(kind, items) {
  const columns = RECORD_COLUMNS[kind];
  return {
    columns: columns.map(([label]) => label),
    rows: items.map((item) => columns.map(([, value]) => value(item) ?? '')),
  };
}

/** HTML table view ("Show as a table") of a widget without its own. */
function tableDetails(table, caption) {
  return h(
    'details',
    { class: 'chart-table' },
    h('summary', {}, 'Show as a table'),
    tableElement(table, caption),
  );
}

/**
 * Body of a widget card.
 * @param {string} key
 * @param {object} data the widget's figures
 * @param {{ filters: typeof DEFAULT_FILTERS, myWorkRange: 'today' | 'week',
 *   onMyWorkRange: (range: string) => void, options?: object,
 *   onOption?: (name: string, value: string) => void,
 *   navigate?: (href: string) => void }} context
 * @returns {{ element: HTMLElement | HTMLElement[], flagged?: boolean,
 *   legend?: [string, number][],
 *   charts?: { canvas: HTMLCanvasElement, draw: () => Promise<object> }[] }}
 */
export function widgetBody(key, data, context) {
  const def = widgetDef(key);
  // The records behind a segment: a link (tables, legends) and a click (chart marks).
  const drill =
    def.rows === 'work_orders' ? (segment) => drillHref(def, segment, context.filters) : null;
  const open = drill && context.navigate ? (segment) => context.navigate(drill(segment)) : null;
  if (FLOW_WIDGETS[key]) {
    return FLOW_WIDGETS[key].body(data, { ...context, drill, open });
  }
  if (isTile(def)) {
    const flagged = Boolean(def.attention && data.value > 0);
    return {
      flagged,
      element: h(
        'div',
        { class: 'widget-tile' },
        h(
          'a',
          {
            class: 'kpi-value widget-value',
            href: tileHref(def, context.filters),
            'data-link': true,
            'aria-label': `${numberFormat.format(data.value)}: open the list`,
          },
          numberFormat.format(data.value),
        ),
        flagged
          ? h(
              'span',
              { class: 'badge badge-tone-warning kpi-flag' },
              h('span', { 'aria-hidden': 'true' }, '⚠'),
              'Needs attention',
            )
          : null,
      ),
    };
  }
  switch (key) {
    case 'by_category': {
      const rows = chartRows({ by_category: data.items });
      const body = categoryChartBody(rows, `${def.label}, last ${data.period} days`, (r) =>
        drill(r.code),
      );
      const pick = open ? (r) => open(r.code) : undefined;
      return {
        element: body.element,
        charts: [{ canvas: body.canvas, draw: () => drawCategoryChart(body.canvas, rows, pick) }],
      };
    }
    case 'by_status': {
      const rows = statusRows({ by_status: data.items });
      const body = statusChartBody(rows, (r) => drill(r.code));
      const pick = open ? (r) => open(r.code) : undefined;
      return {
        element: body.element,
        charts: [{ canvas: body.canvas, draw: () => drawStatusChart(body.canvas, rows, pick) }],
      };
    }
    case 'my_work': {
      const range = context.myWorkRange;
      const items = range === 'week' ? data.week_items : data.today_items;
      return {
        element: [
          h(
            'div',
            { class: 'widget-toolbar' },
            myWorkSwitch(range, context.onMyWorkRange),
            myWorkNote(data.week_end, range),
          ),
          workList(items, data.today, range === 'week'),
        ],
      };
    }
    case 'recent_activity':
      return {
        element: [
          activityList(data.items),
          data.items.length ? tableDetails(widgetTable(key, data), def.label) : null,
        ],
      };
    default:
      return { element: h('p', { class: 'empty-state' }, 'No figures for this widget.') };
  }
}

/**
 * Widgets whose image shows their table: no chart, or a chart whose values are only written
 * in its table (the status pie). Pure.
 */
export function imageShowsTable(key) {
  return ['by_status', 'my_work', 'recent_activity', 'backlog_age'].includes(key);
}

/** Widget options with their defaults filled in (the first allowed value). Pure. */
export function widgetOptions(key, options = {}) {
  const defaults = Object.entries(widgetDef(key)?.options ?? {}).map(([name, values]) => [
    name,
    values[0],
  ]);
  return { ...Object.fromEntries(defaults), ...options };
}
