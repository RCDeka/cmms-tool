// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Home dashboard (brief → Home page / Dashboard; docs/data-model.md → KPI definitions).
// Chart rules from the data-viz method: one series → one color for every bar, value at the
// bar tip, no legend (the title names the series), tooltip, and a table as the accessible
// equivalent. The status pie gives each status a fixed color and lists every value next to
// it. Chart.js is loaded only when the dashboard is shown (docs/architecture.md).
import { h, replaceChildren } from './dom.js';
import { ENUMS } from './enums.js';
import { badge, formatDate, formatDateTime, personName } from './format.js';
import { valueLabel } from './labels.js';

const CHART_SCRIPT = '/assets/vendor/chart.js-4.5.1/chart.umd.min.js';
/** Bar band height; bars themselves are capped at 24 px. */
const ROW_HEIGHT = 40;
/** Room for the x axis under the bars, so the frame never scrolls. */
const AXIS_BAND = 36;

/** KPI tiles in display order. `attention`: a count above zero needs someone's attention. */
export const KPI_TILES = [
  { key: 'open_work_orders', label: 'Open work orders', href: '/work-orders?status=OPEN' },
  { key: 'in_progress_work_orders', label: 'In progress', href: '/work-orders?status=IN_PROGRESS' },
  { key: 'closed_this_month', label: 'Closed this month', href: '/work-orders?status=CLOSED' },
  {
    key: 'overdue_work_orders',
    label: 'Overdue work orders',
    href: '/work-orders?overdue=true',
    attention: true,
  },
  {
    key: 'assets_broken_down',
    label: 'Assets broken down',
    href: '/assets?status=BROKEN_DOWN',
    attention: true,
  },
  {
    key: 'requests_to_review',
    label: 'Staff requests to review',
    href: '/work-orders?to_review=true',
    attention: true,
  },
  {
    key: 'pending_conflicts',
    label: 'Conflicts to arbitrate',
    href: '/conflicts',
    attention: true,
  },
];

/** Tiles to show: only KPIs the server sent (technicians get no conflict count). Pure. */
export function kpiTiles(kpis) {
  return KPI_TILES.filter((tile) => tile.key in kpis).map((tile) => ({
    ...tile,
    value: kpis[tile.key],
    flagged: Boolean(tile.attention && kpis[tile.key] > 0),
  }));
}

/** Chart rows: biggest first, "Unspecified" always last, labels from the UI. Pure. */
export function chartRows(stats) {
  const rows = stats.by_category.map((c) => ({
    code: c.category,
    label: valueLabel('category', c.category),
    count: c.count,
  }));
  const named = rows.filter((r) => r.code !== 'UNSPECIFIED').sort((a, b) => b.count - a.count);
  return [...named, ...rows.filter((r) => r.code === 'UNSPECIFIED')];
}

/** Text equivalent of the chart for screen readers. Pure. */
export function chartSummary(rows, kind = 'Bar chart') {
  return `${kind}. ${rows.map((r) => `${r.label}: ${r.count}`).join(', ')}.`;
}

export const numberFormat = new Intl.NumberFormat('en-GB');
export const percentFormat = new Intl.NumberFormat('en-GB', { style: 'percent' });

/**
 * Pie slices: every status in workflow order, each with its fixed color slot (the color
 * follows the status, never its rank) and its share of the total. Pure.
 */
export function statusRows(stats) {
  const counts = new Map(stats.by_status.map((s) => [s.status, s.count]));
  const total = stats.by_status.reduce((sum, s) => sum + s.count, 0);
  return ENUMS.work_order_status.map((code, i) => {
    const count = counts.get(code) ?? 0;
    return {
      code,
      label: valueLabel('work_order_status', code),
      count,
      share: total ? count / total : 0,
      slot: i + 1,
    };
  });
}

/** "My work" periods: today (default) or the next 7 days (`my_work_week`). */
export const MY_WORK_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
];
let myWorkRange = 'today';

let chartLoading = null;
/** Loads Chart.js once, on demand (script from our own origin: allowed by the CSP). */
export function loadChartJs() {
  chartLoading ??= new Promise((resolve, reject) => {
    if (window.Chart) return resolve(window.Chart);
    const script = document.createElement('script');
    script.src = CHART_SCRIPT;
    script.onload = () => resolve(window.Chart);
    script.onerror = () => {
      chartLoading = null;
      reject(new Error('The chart library could not be loaded.'));
    };
    document.head.append(script);
  });
  return chartLoading;
}

function kpiSection(kpis) {
  return h(
    'section',
    { class: 'dashboard-section', 'aria-labelledby': 'kpi-heading' },
    h('h2', { id: 'kpi-heading', class: 'visually-hidden', tabindex: '-1' }, 'Key figures'),
    h(
      'ul',
      { class: 'kpi-grid' },
      kpiTiles(kpis).map((tile) =>
        h(
          'li',
          {},
          h(
            'a',
            {
              class: `kpi-tile${tile.flagged ? ' is-flagged' : ''}`,
              href: tile.href,
              'data-link': true,
            },
            h('span', { class: 'kpi-label' }, tile.label),
            h('span', { class: 'kpi-value' }, numberFormat.format(tile.value)),
            tile.flagged
              ? h(
                  'span',
                  { class: 'badge badge-tone-warning kpi-flag' },
                  h('span', { 'aria-hidden': 'true' }, '⚠'),
                  'Needs attention',
                )
              : null,
          ),
        ),
      ),
    ),
  );
}

/**
 * Bar chart of work orders by category with its "Show as a table" view.
 * @param {ReturnType<typeof chartRows>} rows
 * @param {string} caption table caption
 * @param {(row: object) => string | null} [linkOf] the list behind a bar (dashboards, K9)
 * @returns {{ canvas: HTMLCanvasElement, element: HTMLElement[] }}
 */
export function categoryChartBody(rows, caption, linkOf) {
  const canvas = h('canvas', { role: 'img', 'aria-label': chartSummary(rows) });
  const frame = h('div', { class: 'chart-frame' }, canvas);
  // Plot + axis band: the frame grows with the number of bars instead of scrolling.
  frame.style.height = `${rows.length * ROW_HEIGHT + AXIS_BAND}px`;
  const table = h(
    'details',
    { class: 'chart-table' },
    h('summary', {}, 'Show as a table'),
    h(
      'table',
      { class: 'data-table' },
      h('caption', { class: 'visually-hidden' }, caption),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, 'Category'),
          h('th', { scope: 'col', class: 'numeric' }, 'Work orders'),
        ),
      ),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, r.label),
            h(
              'td',
              { class: 'numeric' },
              r.count && linkOf?.(r)
                ? h('a', { href: linkOf(r), 'data-link': true }, numberFormat.format(r.count))
                : numberFormat.format(r.count),
            ),
          ),
        ),
      ),
    ),
  );
  return { canvas, element: [frame, table] };
}

function chartSection(stats) {
  const rows = chartRows(stats);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const body = categoryChartBody(rows, `Work orders by category, last ${stats.period} days`);
  return {
    canvas: body.canvas,
    rows,
    draw: drawCategoryChart,
    element: h(
      'figure',
      { class: 'dashboard-card chart-card', 'aria-labelledby': 'chart-heading' },
      h(
        'figcaption',
        {},
        h('h2', { id: 'chart-heading' }, `Work orders by category — last ${stats.period} days`),
        h(
          'p',
          { class: 'muted' },
          `${numberFormat.format(total)} work order${total === 1 ? '' : 's'} created`,
        ),
      ),
      body.element,
    ),
  };
}

/**
 * Status pie with its legend: label, count and share of every status (the table view).
 * @param {ReturnType<typeof statusRows>} rows
 * @param {(row: object) => string | null} [linkOf] the list behind a slice (dashboards, K9)
 * @returns {{ canvas: HTMLCanvasElement, element: HTMLElement }}
 */
export function statusChartBody(rows, linkOf) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const canvas = h('canvas', {
    role: 'img',
    'aria-label': chartSummary(rows, 'Pie chart'),
  });
  return {
    canvas,
    element: total
      ? h(
          'div',
          { class: 'pie-layout' },
          h('div', { class: 'pie-frame' }, canvas),
          h(
            'ul',
            { class: 'pie-legend', 'aria-label': 'Work orders by status' },
            rows.map((r) =>
              h(
                'li',
                {},
                h('span', {
                  class: `pie-swatch chart-series-${r.slot}`,
                  'aria-hidden': 'true',
                }),
                h(
                  'span',
                  { class: 'pie-label' },
                  r.count && linkOf?.(r)
                    ? h('a', { href: linkOf(r), 'data-link': true }, r.label)
                    : r.label,
                ),
                h('span', { class: 'numeric' }, numberFormat.format(r.count)),
                h('span', { class: 'numeric muted' }, percentFormat.format(r.share)),
              ),
            ),
          ),
        )
      : h('p', { class: 'empty-state' }, 'No work order was created in this period.'),
  };
}

function statusChartSection(stats) {
  const rows = statusRows(stats);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const body = statusChartBody(rows);
  return {
    canvas: body.canvas,
    rows,
    draw: drawStatusChart,
    element: h(
      'figure',
      { class: 'dashboard-card chart-card', 'aria-labelledby': 'status-chart-heading' },
      h(
        'figcaption',
        {},
        h(
          'h2',
          { id: 'status-chart-heading' },
          `Work orders by status — last ${stats.period} days`,
        ),
        h(
          'p',
          { class: 'muted' },
          `${numberFormat.format(total)} work order${total === 1 ? '' : 's'} created, by current status`,
        ),
      ),
      body.element,
    ),
  };
}

function workOrderLink(wo) {
  return h('a', { href: `/work-orders/${wo.id}`, 'data-link': true }, `${wo.number} — ${wo.title}`);
}

/** Recent activity: each work order with its status, when and by whom it was updated. */
export function activityList(items) {
  return items.length
    ? h(
        'ol',
        { class: 'activity-list' },
        items.map((wo) =>
          h(
            'li',
            {},
            h(
              'div',
              { class: 'activity-main' },
              workOrderLink(wo),
              ' ',
              badge('status', 'work_order_status', wo.status),
            ),
            h(
              'p',
              { class: 'muted' },
              `Updated ${formatDateTime(wo.updated_at)}${wo.updated_by ? ` by ${personName(wo.updated_by)}` : ''}`,
            ),
          ),
        ),
      )
    : h('p', { class: 'empty-state' }, 'No activity yet.');
}

function recentSection(items) {
  return h(
    'section',
    { class: 'dashboard-card', 'aria-labelledby': 'recent-heading' },
    h('h2', { id: 'recent-heading' }, 'Recent activity'),
    activityList(items),
  );
}

/** Work orders of the chosen period; `my_work_week` is missing from older saved copies. Pure. */
export function myWorkItems(data, range) {
  return range === 'week' ? (data.my_work_week ?? []) : data.my_work_today;
}

/**
 * "My work" card with its Today / Next 7 days switch; the switch redraws the card only.
 * `myWeekLink`: people with a My week get a link to the day's scheduled blocks (M7).
 */
function myWorkSection(data, myWeekLink) {
  const section = h('section', { class: 'dashboard-card', 'aria-labelledby': 'mywork-heading' });
  const paint = (focusKey) => {
    replaceChildren(
      section,
      ...myWorkContent(
        data,
        (key) => {
          myWorkRange = key;
          paint(key);
        },
        myWeekLink,
      ),
    );
    if (focusKey) section.querySelector(`[data-range="${focusKey}"]`)?.focus();
  };
  paint();
  return section;
}

/** Today / Next 7 days switch of "My work". */
export function myWorkSwitch(range, onRange) {
  return h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Period' },
    MY_WORK_RANGES.map((r) =>
      h(
        'button',
        {
          type: 'button',
          class: 'segmented-option',
          dataset: { range: r.key },
          'aria-pressed': String(r.key === range),
          onClick: () => {
            if (r.key !== range) onRange(r.key);
          },
        },
        r.label,
      ),
    ),
  );
}

/** What "My work" holds for the period chosen. */
export function myWorkNote(weekEnd, range) {
  return h(
    'p',
    { class: 'muted' },
    range === 'week' && weekEnd
      ? `Due by ${formatDate(weekEnd)}, late or without a due date.`
      : 'Due today, late or without a due date.',
  );
}

function myWorkContent(data, onRange, myWeekLink) {
  const items = myWorkItems(data, myWorkRange);
  return [
    h(
      'div',
      { class: 'card-header' },
      h('h2', { id: 'mywork-heading', tabindex: '-1' }, 'My work'),
      myWorkSwitch(myWorkRange, onRange),
    ),
    myWeekLink
      ? h(
          'p',
          { class: 'my-week-link' },
          h(
            'a',
            { href: '/my-week', 'data-link': true, class: 'button button-secondary' },
            'Today in My week →',
          ),
        )
      : null,
    myWorkNote(data.week_end, myWorkRange),
    workList(items, data.today, myWorkRange === 'week'),
  ];
}

/** Work orders of "My work", late ones flagged. */
export function workList(items, today, week) {
  return items.length
    ? h(
        'ul',
        { class: 'activity-list' },
        items.map((wo) => {
          const late = wo.due_on && wo.due_on < today;
          return h(
            'li',
            {},
            h(
              'div',
              { class: 'activity-main' },
              workOrderLink(wo),
              ' ',
              badge('priority', 'work_order_priority', wo.priority),
            ),
            h(
              'p',
              { class: 'muted' },
              wo.due_on ? `Due ${formatDate(wo.due_on)}` : 'No due date',
              late
                ? [
                    ' ',
                    h(
                      'span',
                      { class: 'badge badge-tone-warning' },
                      h('span', { 'aria-hidden': 'true' }, '⚠'),
                      'Overdue',
                    ),
                  ]
                : null,
            ),
          );
        }),
      )
    : h(
        'p',
        { class: 'empty-state' },
        week
          ? 'No work order assigned to you is due in the next 7 days.'
          : 'No work order assigned to you is due today.',
      );
}

/**
 * Renders the dashboard. Returns the charts, drawn afterwards (async) with
 * `chart.draw(chart.canvas, chart.rows)`. Technicians get no chart: their dashboard is about
 * their own work (product owner, 2026-10-04), so "My work" comes first, before the team
 * tiles (M7).
 * @param {HTMLElement} container
 * @param {{ data: object, stats: object, fromCache: boolean, fetchedAt: string,
 *   charts?: boolean, myWeekLink?: boolean }} options
 * @returns {{ canvas: HTMLCanvasElement, rows: object[], draw: Function, element: HTMLElement }[]}
 */
export function renderDashboard(
  container,
  { data, stats, fromCache, fetchedAt, charts = true, myWeekLink = false },
) {
  const shown = charts ? [chartSection(stats), statusChartSection(stats)] : [];
  const myWork = myWorkSection(data, myWeekLink);
  const recent = recentSection(data.recent_activity);
  replaceChildren(
    container,
    h(
      'div',
      { class: 'dashboard' },
      fromCache
        ? h(
            'div',
            { class: 'banner banner-info', role: 'note' },
            `Offline: figures saved on this device on ${formatDateTime(fetchedAt)}.`,
          )
        : null,
      charts
        ? [
            kpiSection(data.kpis),
            h(
              'div',
              { class: 'dashboard-grid' },
              h(
                'div',
                { class: 'dashboard-charts' },
                shown.map((c) => c.element),
              ),
              h('div', { class: 'dashboard-lists' }, myWork, recent),
            ),
          ]
        : [myWork, kpiSection(data.kpis), recent],
    ),
  );
  // An empty pie has no canvas on the page: nothing to draw.
  return shown.filter((c) => c.canvas.isConnected);
}

/** Click and pointer cursor on the marks of a chart, when it opens the records behind them. */
function pickOptions(onPick, rowOf) {
  if (!onPick) return {};
  return {
    onClick: (_event, elements) => {
      if (elements[0]) onPick(rowOf(elements[0].index));
    },
    onHover: (event, elements) => {
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    },
  };
}

/**
 * Draws the horizontal bar chart. Single series: one color for every bar (dark gray,
 * ≥ 3:1 on the card; brand red on hover), ≤ 24 px bars with a 4 px rounded end, value at the bar tip
 * in text color, hairline solid grid, tooltip on hover.
 * @returns {Promise<object>} the Chart instance
 */
export async function drawCategoryChart(canvas, rows, onPick) {
  const Chart = await loadChartJs();
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const font = token('--font-sans');
  const values = rows.map((r) => r.count);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = token('--color-text');
      ctx.font = `600 13px ${font}`;
      ctx.textBaseline = 'middle';
      chart
        .getDatasetMeta(0)
        .data.forEach((bar, i) => ctx.fillText(numberFormat.format(values[i]), bar.x + 6, bar.y));
      ctx.restore();
    },
  };

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: 'Work orders',
          data: values,
          backgroundColor: token('--color-chart-bar'),
          hoverBackgroundColor: token('--color-chart-bar-hover'),
          borderRadius: { topRight: 4, bottomRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 24,
          categoryPercentage: 0.9,
          barPercentage: 0.9,
        },
      ],
    },
    options: {
      ...pickOptions(onPick, (i) => rows[i]),
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 300 },
      layout: { padding: { right: 36 } },
      interaction: { mode: 'nearest', axis: 'y', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          titleFont: { family: font },
          bodyFont: { family: font, weight: '600' },
          callbacks: { label: (item) => `${numberFormat.format(item.parsed.x)} work orders` },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, color: token('--color-text-muted'), font: { family: font } },
          grid: { color: token('--color-grid'), lineWidth: 1 },
          border: { display: false },
        },
        y: {
          ticks: { color: token('--color-text'), font: { family: font, size: 13 } },
          grid: { display: false },
          border: { color: token('--color-border') },
        },
      },
    },
    plugins: [valueLabels],
  });
}

/**
 * Draws the status pie: fixed color per status (`--color-chart-series-N`), 2 px white gaps
 * between slices, no Chart.js legend (the list next to it names every slice with its
 * value), tooltip with count and share.
 * @returns {Promise<object>} the Chart instance
 */
export async function drawStatusChart(canvas, rows, onPick) {
  const Chart = await loadChartJs();
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const font = token('--font-sans');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return new Chart(canvas, {
    type: 'pie',
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: 'Work orders',
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((r) => token(`--color-chart-series-${r.slot}`)),
          borderColor: token('--color-surface'),
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      ...pickOptions(onPick, (i) => rows[i]),
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 300 },
      layout: { padding: 6 },
      plugins: {
        legend: { display: false },
        tooltip: {
          titleFont: { family: font },
          bodyFont: { family: font, weight: '600' },
          callbacks: {
            label: (item) =>
              `${numberFormat.format(item.parsed)} work orders (${percentFormat.format(rows[item.dataIndex].share)})`,
          },
        },
      },
    },
  });
}
