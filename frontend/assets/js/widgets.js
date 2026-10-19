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
import { COMPLIANCE_WIDGETS, VISIT_COLUMNS } from './widgets-compliance.js';
import { FLOW_WIDGETS, tableElement } from './widgets-flow.js';
import { EXTRA_COLUMNS, PEOPLE_WIDGETS } from './widgets-people.js';
import { t } from './i18n.js';

/** Widgets defined in their own modules (Phases 22 to 24). */
const MODULE_WIDGETS = { ...FLOW_WIDGETS, ...COMPLIANCE_WIDGETS, ...PEOPLE_WIDGETS };

export const PERIODS = [30, 90, 365];
export const DEFAULT_FILTERS = { period: 30, sites: [], categories: [] };

/** Sidebar groups, in order. */
export const WIDGET_GROUPS = [
  t('Key figures'),
  t('Flow and backlog'),
  t('Compliance'),
  t('Responsiveness'),
  t('Assets'),
  t('People'),
  t('Work orders'),
  t('Lists'),
];

/**
 * The catalogue, in sidebar order. `size`: S (tile, 1 column), M (2), L (4).
 * `filters` and `rows`: as on the server. `href`: the list behind a tile. `attention`: a
 * count above zero needs someone's attention.
 */
export const WIDGETS = [
  {
    key: 'open_work_orders',
    label: t('Open work orders'),
    group: t('Key figures'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?status=OPEN',
  },
  {
    key: 'in_progress_work_orders',
    label: t('Work orders in progress'),
    group: t('Key figures'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?status=IN_PROGRESS',
  },
  // Technically done this month, closed or not (D86); the key stays for saved dashboards.
  {
    key: 'closed_this_month',
    label: t('Done this month'),
    group: t('Key figures'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?status=COMPLETED,CLOSED&sort=completed_on&order=desc',
  },
  // Technically done, waiting for the administrative closing (D86), oldest first.
  {
    key: 'to_close',
    label: t('To close'),
    group: t('Key figures'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?status=COMPLETED&sort=completed_on&order=asc',
    attention: true,
  },
  {
    key: 'overdue_work_orders',
    label: t('Overdue work orders'),
    group: t('Key figures'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?overdue=true',
    attention: true,
  },
  {
    key: 'assets_broken_down',
    label: t('Assets broken down'),
    group: t('Key figures'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'assets',
    href: '/assets?status=BROKEN_DOWN',
    attention: true,
  },
  {
    key: 'requests_to_review',
    label: t('Staff requests to review'),
    group: t('Key figures'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?to_review=true',
    attention: true,
  },
  {
    key: 'requests_awaiting_reply',
    label: t('Requests waiting for a reply'),
    group: t('Key figures'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    href: '/work-orders?awaiting_reply=true',
    attention: true,
  },
  {
    key: 'pending_conflicts',
    label: t('Conflicts to arbitrate'),
    group: t('Key figures'),
    size: 'S',
    filters: [],
    rows: null,
    href: '/conflicts',
    attention: true,
  },
  {
    key: 'opened_vs_closed',
    label: t('Opened vs done'),
    group: t('Flow and backlog'),
    size: 'L',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'backlog_age',
    label: t('Backlog by age and priority'),
    group: t('Flow and backlog'),
    size: 'M',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'backlog_weeks',
    label: t('Backlog in weeks of work'),
    group: t('Flow and backlog'),
    size: 'M',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'planned_vs_reactive',
    label: t('Planned vs reactive work'),
    group: t('Flow and backlog'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
    options: { basis: ['count', 'hours'] },
  },
  {
    key: 'pm_compliance',
    label: t('Preventive maintenance compliance'),
    group: t('Compliance'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'visits',
  },
  {
    key: 'regulatory_late',
    label: t('Regulatory visits late'),
    group: t('Compliance'),
    size: 'S',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
    attention: true,
  },
  {
    key: 'schedule_compliance',
    label: t('Week schedule kept'),
    group: t('Compliance'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'contractor_scorecard',
    label: t('Contractors'),
    group: t('Compliance'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'visits',
  },
  {
    key: 'response_times',
    label: t('Time to start and to close'),
    group: t('Responsiveness'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'request_service',
    label: t('Staff requests'),
    group: t('Responsiveness'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'sla_compliance',
    label: t('Service levels met'),
    group: t('Responsiveness'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'bad_actors',
    label: t('Assets with the most breakdowns'),
    group: t('Assets'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
    options: { critical_only: ['no', 'yes'] },
  },
  {
    key: 'repeat_failures',
    label: t('Repeat failures'),
    group: t('Assets'),
    size: 'S',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
    attention: true,
  },
  {
    key: 'critical_downtime',
    label: t('Critical assets out of service'),
    group: t('Assets'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'assets',
  },
  {
    key: 'workload',
    label: t('Workload per person'),
    group: t('People'),
    size: 'L',
    filters: ['sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'estimate_accuracy',
    label: t('Estimates vs actual hours'),
    group: t('People'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'by_category',
    label: t('Work orders by category'),
    group: t('Work orders'),
    size: 'M',
    filters: ['period', 'sites'],
    rows: 'work_orders',
  },
  {
    key: 'by_status',
    label: t('Work orders by status'),
    group: t('Work orders'),
    size: 'M',
    filters: ['period', 'sites', 'categories'],
    rows: 'work_orders',
  },
  {
    key: 'my_work',
    label: t('My work'),
    group: t('Lists'),
    size: 'M',
    filters: [],
    rows: 'work_orders',
  },
  {
    key: 'recent_activity',
    label: t('Recent activity'),
    group: t('Lists'),
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
  return sites.length === 1 ? sites[0] : t('{length} sites', { length: sites.length });
}

function categoriesText(categories) {
  return categories.length === 1
    ? valueLabel('category', categories[0])
    : t('{length} trades', { length: categories.length });
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
  if (uses('period')) parts.push(t('Last {period} days', { period: filters.period }));
  if (uses('sites') && filters.sites.length) parts.push(sitesText(filters.sites));
  if (uses('categories') && filters.categories.length) {
    parts.push(categoriesText(filters.categories));
  }
  const sitesUnused = !uses('sites') && filters.sites.length;
  const tradesUnused = !uses('categories') && filters.categories.length;
  if (sitesUnused && tradesUnused) parts.push(t('Site and trade filter not used'));
  else if (sitesUnused) parts.push(t('Site filter not used'));
  else if (tradesUnused) parts.push(t('Trade filter not used'));
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
  // The asset widgets open the asset list, the others the work order list.
  return `${def.rows === 'assets' ? '/assets' : '/work-orders'}?${query}`;
}

/** Name of a segment for the drill-down list: "Urgent, 91+ days old". Pure. */
function segmentLabel(key, segment) {
  if (MODULE_WIDGETS[key]) return MODULE_WIDGETS[key].segment(segment);
  if (key === 'by_category') return valueLabel('category', segment);
  if (key === 'by_status') return valueLabel('work_order_status', segment);
  if (key === 'my_work') return segment === 'today' ? t('today') : t('next 7 days');
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
    ? t(' (last {value} days)', { value: period ?? DEFAULT_FILTERS.period })
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
  if (MODULE_WIDGETS[key]) return MODULE_WIDGETS[key].table(data, { options, drill });
  if (isTile(def)) {
    return {
      columns: [{ label: t('Figure') }, { label: t('Value'), numeric: true }],
      rows: [[def.label, data.value]],
    };
  }
  switch (key) {
    case 'by_category':
      return {
        columns: [{ label: t('Category') }, { label: t('Work orders'), numeric: true }],
        rows: chartRows({ by_category: data.items }).map((r) => [r.label, r.count]),
      };
    case 'by_status':
      return {
        columns: [
          { label: t('Status') },
          { label: t('Work orders'), numeric: true },
          { label: t('Share'), numeric: true },
        ],
        rows: statusRows({ by_status: data.items }).map((r) => [
          r.label,
          r.count,
          percentFormat.format(r.share),
        ]),
      };
    case 'my_work':
      return {
        columns: [{ label: t('Work order') }, { label: t('Priority') }, { label: t('Due') }],
        rows: (myWorkRange === 'week' ? data.week_items : data.today_items).map((wo) => [
          workOrderTitle(wo),
          valueLabel('work_order_priority', wo.priority),
          wo.due_on ? formatDate(wo.due_on) : t('No due date'),
        ]),
      };
    case 'recent_activity':
      return {
        columns: [
          { label: t('Work order') },
          { label: t('Status') },
          { label: t('Updated') },
          { label: t('By') },
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
    [t('Number'), (wo) => wo.number],
    [t('Title'), (wo) => wo.title],
    [t('Type'), (wo) => valueLabel('work_order_type', wo.type)],
    [t('Status'), (wo) => valueLabel('work_order_status', wo.status)],
    [t('Priority'), (wo) => valueLabel('work_order_priority', wo.priority)],
    [t('Category'), (wo) => valueLabel('category', wo.category ?? 'UNSPECIFIED')],
    [t('Site'), (wo) => wo.site],
    [t('Location'), (wo) => wo.location],
    [t('Asset'), (wo) => wo.asset?.code],
    [t('Assignee'), (wo) => (wo.assignee ? personName(wo.assignee) : '')],
    [t('Created'), (wo) => wo.created_on],
    [t('Due'), (wo) => wo.due_on],
    [t('Started'), (wo) => wo.started_on],
    [t('Technically done'), (wo) => wo.completed_on],
    [t('Closed'), (wo) => wo.closed_on],
    [t('Estimated hours'), (wo) => wo.estimated_hours],
    [t('Actual hours'), (wo) => wo.actual_hours],
  ],
  assets: [
    [t('Code'), (a) => a.code],
    [t('asset|Name'), (a) => a.name],
    [t('Site'), (a) => a.site],
    [t('Place'), (a) => a.place],
    [t('Category'), (a) => valueLabel('category', a.category)],
    [t('Criticality'), (a) => valueLabel('criticality', a.criticality)],
    [t('Status'), (a) => valueLabel('asset_status', a.status)],
    [t('Brand'), (a) => a.brand],
    [t('Model'), (a) => a.model],
    [t('Serial number'), (a) => a.serial_number],
    [t('Last serviced'), (a) => a.last_serviced_on],
  ],
};

/**
 * Records behind a widget as CSV columns and rows (dates as YYYY-MM-DD, which spreadsheets
 * read as dates). Pure.
 * @param {'work_orders' | 'assets'} kind
 * @param {object[]} items
 */
export function recordsTable(kind, items, key) {
  const columns = [
    ...(kind === 'visits' ? VISIT_COLUMNS : RECORD_COLUMNS[kind]),
    ...(EXTRA_COLUMNS[key] ?? []),
  ];
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
    h('summary', {}, t('Show as a table')),
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
  const drill = ['work_orders', 'visits', 'assets'].includes(def.rows)
    ? (segment) => drillHref(def, segment, context.filters)
    : null;
  const open = drill && context.navigate ? (segment) => context.navigate(drill(segment)) : null;
  if (MODULE_WIDGETS[key]) {
    return MODULE_WIDGETS[key].body(data, { ...context, drill, open });
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
            href: tileHref(def, context.filters) ?? drillHref(def, null, context.filters),
            'data-link': true,
            'aria-label': t('{value}: open the list', { value: numberFormat.format(data.value) }),
          },
          numberFormat.format(data.value),
        ),
        data.share !== undefined && data.share !== null
          ? h(
              'span',
              { class: 'widget-tile-note' },
              t('{share} of the corrective work', { share: percentFormat.format(data.share) }),
            )
          : null,
        flagged
          ? h(
              'span',
              { class: 'badge badge-tone-warning kpi-flag' },
              h('span', { 'aria-hidden': 'true' }, '⚠'),
              t('Needs attention'),
            )
          : null,
      ),
    };
  }
  switch (key) {
    case 'by_category': {
      const rows = chartRows({ by_category: data.items });
      const body = categoryChartBody(
        rows,
        t('{label}, last {period} days', { label: def.label, period: data.period }),
        (r) => drill(r.code),
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
      return { element: h('p', { class: 'empty-state' }, t('No figures for this widget.')) };
  }
}

/**
 * Widgets whose image shows their table: no chart, or a chart whose values are only written
 * in its table (the status pie). Pure.
 */
export function imageShowsTable(key) {
  return [
    'by_status',
    'my_work',
    'recent_activity',
    'backlog_age',
    'pm_compliance',
    'contractor_scorecard',
    'request_service',
  ].includes(key);
}

/** Widget options with their defaults filled in (the first allowed value). Pure. */
export function widgetOptions(key, options = {}) {
  const defaults = Object.entries(widgetDef(key)?.options ?? {}).map(([name, values]) => [
    name,
    values[0],
  ]);
  return { ...Object.fromEntries(defaults), ...options };
}
