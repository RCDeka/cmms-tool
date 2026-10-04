// Home dashboard (brief → Home page / Dashboard; docs/data-model.md → KPI definitions).
// Chart rules from the data-viz method: one series → one color for every bar, value at the
// bar tip, no legend (the title names the series), tooltip, and a table as the accessible
// equivalent. Chart.js is loaded only when the dashboard is shown (docs/architecture.md).
import { h, replaceChildren } from './dom.js';
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
export function chartSummary(rows) {
  return `Bar chart. ${rows.map((r) => `${r.label}: ${r.count}`).join(', ')}.`;
}

const numberFormat = new Intl.NumberFormat('en-GB');

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

function chartSection(stats) {
  const rows = chartRows(stats);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const canvas = h('canvas', { role: 'img', 'aria-label': chartSummary(rows) });
  const frame = h('div', { class: 'chart-frame' }, canvas);
  // Plot + axis band: the frame grows with the number of bars instead of scrolling.
  frame.style.height = `${rows.length * ROW_HEIGHT + AXIS_BAND}px`;
  return {
    canvas,
    rows,
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
      frame,
      h(
        'details',
        { class: 'chart-table' },
        h('summary', {}, 'Show as a table'),
        h(
          'table',
          { class: 'data-table' },
          h(
            'caption',
            { class: 'visually-hidden' },
            `Work orders by category, last ${stats.period} days`,
          ),
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
                h('td', { class: 'numeric' }, numberFormat.format(r.count)),
              ),
            ),
          ),
        ),
      ),
    ),
  };
}

function workOrderLink(wo) {
  return h('a', { href: `/work-orders/${wo.id}`, 'data-link': true }, `${wo.number} — ${wo.title}`);
}

function recentSection(items) {
  return h(
    'section',
    { class: 'dashboard-card', 'aria-labelledby': 'recent-heading' },
    h('h2', { id: 'recent-heading' }, 'Recent activity'),
    items.length
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
      : h('p', { class: 'empty-state' }, 'No activity yet.'),
  );
}

function myWorkSection(items, today) {
  return h(
    'section',
    { class: 'dashboard-card', 'aria-labelledby': 'mywork-heading' },
    h('h2', { id: 'mywork-heading' }, 'My work today'),
    items.length
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
      : h('p', { class: 'empty-state' }, 'No work order assigned to you is due today.'),
  );
}

/**
 * Renders the dashboard. Returns the chart canvas and rows, drawn afterwards (async).
 * @param {HTMLElement} container
 * @param {{ data: object, stats: object, fromCache: boolean, fetchedAt: string }} options
 */
export function renderDashboard(container, { data, stats, fromCache, fetchedAt }) {
  const chart = chartSection(stats);
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
      kpiSection(data.kpis),
      h(
        'div',
        { class: 'dashboard-grid' },
        chart.element,
        h(
          'div',
          { class: 'dashboard-lists' },
          myWorkSection(data.my_work_today, data.today),
          recentSection(data.recent_activity),
        ),
      ),
    ),
  );
  return chart;
}

/**
 * Draws the horizontal bar chart. Single series: one color for every bar (brand primary,
 * validated ≥ 3:1 on the card), ≤ 24 px bars with a 4 px rounded end, value at the bar tip
 * in text color, hairline solid grid, tooltip on hover.
 * @returns {Promise<object>} the Chart instance
 */
export async function drawCategoryChart(canvas, rows) {
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
          backgroundColor: token('--color-primary'),
          hoverBackgroundColor: token('--color-primary-hover'),
          borderRadius: { topRight: 4, bottomRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 24,
          categoryPercentage: 0.9,
          barPercentage: 0.9,
        },
      ],
    },
    options: {
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
