// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Flow and backlog widgets of the dashboards (docs/spec-dashboards.md §6.2, Phase 22):
// opened vs done, backlog by age and priority, backlog in weeks of work, planned vs
// reactive work. Each has a body, a table view (with a link per counted cell to the records
// behind it, K9) and the labels of its segments for the drill-down list.
import { numberFormat, percentFormat } from './dashboard.js';
import { h } from './dom.js';
import { formatWeek } from './format.js';
import { valueLabel } from './labels.js';
import { drawLine, drawPairedColumns, drawShareColumns, drawWeekBars } from './widget-charts.js';
import { locale, plural, t, tn, tx } from './i18n.js';

const dayMonth = new Intl.DateTimeFormat(locale(), {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const monthYear = new Intl.DateTimeFormat(locale(), {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthLong = new Intl.DateTimeFormat(locale(), {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const asDate = (date) => new Date(`${date}T00:00:00Z`);
const oneDecimal = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });

const monthShort = new Intl.DateTimeFormat(locale(), { month: 'short', timeZone: 'UTC' });

/**
 * Short axis label of a bucket: "W37"; months "Oct 2025", "Nov"… with the year only on the
 * first month and on January, so twelve labels fit a half-width card. Pure.
 */
export function bucketAxis(bucket, unit, index = 0) {
  if (unit === 'week') return t('W{key}', { key: Number(bucket.key.slice(6)) });
  const date = asDate(bucket.from);
  return index === 0 || date.getUTCMonth() === 0 ? monthYear.format(date) : monthShort.format(date);
}

/** Full name of a bucket: "Week 37: 7–13 Sept" (dates in the period) or "September 2026". Pure. */
export function bucketTitle(bucket, unit) {
  if (unit === 'month') {
    return `${monthLong.format(asDate(bucket.from))}${bucket.partial ? ` (${dayMonth.format(asDate(bucket.from))}–${dayMonth.format(asDate(bucket.to))})` : ''}`;
  }
  const from = asDate(bucket.from);
  const to = asDate(bucket.to);
  // "7–13 Sept", or "28 Sept–4 Oct" when the week spans two months.
  const days =
    bucket.from === bucket.to
      ? dayMonth.format(from)
      : from.getUTCMonth() === to.getUTCMonth()
        ? `${from.getUTCDate()}–${dayMonth.format(to)}`
        : `${dayMonth.format(from)}–${dayMonth.format(to)}`;
  return t('Week {key}: {days}', { key: Number(bucket.key.slice(6)), days });
}

/** "Week 40, 2026" or "September 2026" from a bucket key alone (drill labels). Pure. */
export function bucketKeyText(key) {
  return key.includes('-W') ? formatWeek(key) : monthLong.format(asDate(`${key}-01`));
}

/** The same inside a sentence: "week 40, 2026", "September 2026". Pure. */
export function bucketKeyInText(key) {
  const text = bucketKeyText(key);
  const week = t('Week');
  return text.startsWith(week) ? t('week') + text.slice(week.length) : text;
}

export const AGE_LABELS = {
  '0-7': t('0–7 days'),
  '8-30': t('8–30 days'),
  '31-90': t('31–90 days'),
  '91+': t('91+ days'),
};
/** Old urgent and high work: the cells with the attention style. */
const OLD = ['31-90', '91+'];

export const WORK_GROUP_LABELS = {
  PLANNED: t('Planned'),
  REACTIVE: t('Reactive'),
  REQUESTS: t('Staff requests'),
  IMPROVEMENT: t('Improvement'),
};
/** Fixed color slot of each kind of work (the color follows the kind, never its rank). */
const WORK_GROUP_SLOTS = { PLANNED: 1, REACTIVE: 2, REQUESTS: 3, IMPROVEMENT: 4 };

/** Rule of thumb for the backlog (§2): neither starving nor drowning. */
export const BACKLOG_BAND = [2, 4];

/**
 * Legend in HTML: a swatch per series, in text color (identity never by color alone). Slot 0
 * is the gray of a single series (--color-chart-bar).
 */
export function legend(items) {
  return h(
    'ul',
    { class: 'chart-legend' },
    items.map(([label, slot]) =>
      h(
        'li',
        {},
        h('span', {
          class: `pie-swatch ${slot ? `chart-series-${slot}` : 'chart-bar-swatch'}`,
          'aria-hidden': 'true',
        }),
        label,
      ),
    ),
  );
}

function chartFrame(canvas, height) {
  const frame = h('div', { class: 'chart-frame' }, canvas);
  frame.style.height = `${height}px`;
  return frame;
}

const canvasFor = (summary) => h('canvas', { role: 'img', 'aria-label': summary });

/** HTML table of a table view, with links on the counted cells. */
export function tableElement(table, caption, { cellClass } = {}) {
  return h(
    'table',
    { class: 'data-table' },
    h('caption', { class: 'visually-hidden' }, caption),
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        table.columns.map((c) =>
          h('th', { scope: 'col', class: c.numeric ? 'numeric' : null }, c.label),
        ),
      ),
    ),
    h(
      'tbody',
      {},
      table.rows.map((row, r) =>
        h(
          'tr',
          {},
          row.map((cell, i) => {
            const text = typeof cell === 'number' ? numberFormat.format(cell) : String(cell ?? '');
            const href = table.links?.[r]?.[i];
            const content = href ? h('a', { href, 'data-link': true }, text) : text;
            return i === 0
              ? h('th', { scope: 'row' }, content)
              : h(
                  'td',
                  {
                    class:
                      [table.columns[i].numeric ? 'numeric' : '', cellClass?.(r, i, cell) ?? '']
                        .join(' ')
                        .trim() || null,
                  },
                  content,
                );
          }),
        ),
      ),
    ),
  );
}

const tableDetails = (table, caption) =>
  h(
    'details',
    { class: 'chart-table' },
    h('summary', {}, t('Show as a table')),
    tableElement(table, caption),
  );

// --- Opened vs done (D86) -------------------------------------------------------------------

const FLOW_KINDS = [
  ['opened', t('Opened')],
  ['closed', t('count|Done')],
  ['cancelled', t('count|Cancelled')],
];

function flowTable(data, { drill }) {
  return {
    columns: [
      { label: data.unit === 'week' ? t('Week') : t('Month') },
      { label: t('Opened'), numeric: true },
      { label: t('count|Done'), numeric: true },
      { label: t('count|Cancelled'), numeric: true },
      { label: t('Unfinished at the end'), numeric: true },
    ],
    rows: data.buckets.map((b) => [
      bucketTitle(b, data.unit),
      b.opened,
      b.closed,
      b.cancelled,
      b.unfinished,
    ]),
    links: drill
      ? data.buckets.map((b) => [
          null,
          ...FLOW_KINDS.map(([kind]) => (b[kind] ? drill(`${kind}:${b.key}`) : null)),
          null,
        ])
      : undefined,
  };
}

function flowBody(data, context) {
  const labels = data.buckets.map((b, i) => bucketAxis(b, data.unit, i));
  const titles = data.buckets.map((b) => bucketTitle(b, data.unit));
  const sum = (kind) => data.buckets.reduce((s, b) => s + b[kind], 0);
  const opened = sum('opened');
  const closed = sum('closed');
  const cancelled = sum('cancelled');
  const last = data.buckets.at(-1);
  const bars = canvasFor(
    t(
      data.unit === 'week'
        ? 'Column chart, opened and done per week. {map}.'
        : 'Column chart, opened and done per month. {map}.',
      {
        map: data.buckets
          .map((b, i) =>
            t('{title}: {opened} opened, {closed} done', {
              title: titles[i],
              opened: b.opened,
              closed: b.closed,
            }),
          )
          .join('; '),
      },
    ),
  );
  const line = canvasFor(
    t(
      data.unit === 'week'
        ? 'Line chart, unfinished work orders at the end of each week. {map}.'
        : 'Line chart, unfinished work orders at the end of each month. {map}.',
      {
        map: data.buckets
          .map((b, i) => t('{label}: {value}', { label: titles[i], value: b.unfinished }))
          .join('; '),
      },
    ),
  );
  const unfinishedTitle =
    data.unit === 'week'
      ? t('Unfinished at the end of each week')
      : t('Unfinished at the end of each month');
  return {
    element: [
      h(
        'p',
        { class: 'widget-summary' },
        t('{opened} opened, {closed} done, {cancelled} cancelled. ', {
          opened: numberFormat.format(opened),
          closed: numberFormat.format(closed),
          cancelled: numberFormat.format(cancelled),
        }),
        h(
          'strong',
          {},
          opened > closed + cancelled
            ? t('The backlog grew by {value}.', {
                value: numberFormat.format(opened - closed - cancelled),
              })
            : opened < closed + cancelled
              ? t('The backlog shrank by {value}.', {
                  value: numberFormat.format(closed + cancelled - opened),
                })
              : t('The backlog is stable.'),
        ),
      ),
      legend([
        [t('Opened'), 1],
        [t('count|Done'), 2],
      ]),
      chartFrame(bars, 220),
      h(
        'h3',
        { class: 'chart-subtitle' },
        unfinishedTitle,
        last ? t(' (now {unfinished})', { unfinished: numberFormat.format(last.unfinished) }) : '',
      ),
      chartFrame(line, 140),
      tableDetails(
        flowTable(data, context),
        data.unit === 'week' ? t('Opened and done per week') : t('Opened and done per month'),
      ),
    ],
    legend: [
      [t('Opened'), 1],
      [t('count|Done'), 2],
    ],
    charts: [
      {
        canvas: bars,
        draw: () =>
          drawPairedColumns(bars, {
            labels,
            titles,
            series: [
              { label: t('Opened'), values: data.buckets.map((b) => b.opened), slot: 1 },
              { label: t('count|Done'), values: data.buckets.map((b) => b.closed), slot: 2 },
            ],
            onPick: context.open
              ? (series, i) =>
                  context.open(`${series === 0 ? 'opened' : 'closed'}:${data.buckets[i].key}`)
              : undefined,
          }),
      },
      {
        canvas: line,
        caption: unfinishedTitle,
        draw: () =>
          drawLine(line, {
            labels,
            titles,
            label: t('Unfinished'),
            values: data.buckets.map((b) => b.unfinished),
          }),
      },
    ],
  };
}

// --- Backlog by age and priority --------------------------------------------------------------

function ageTable(data, { drill }) {
  const columnTotals = data.buckets.map((_, i) => data.rows.reduce((s, r) => s + r.counts[i], 0));
  return {
    columns: [
      { label: t('Priority') },
      ...data.buckets.map((b) => ({ label: AGE_LABELS[b], numeric: true })),
      { label: t('Total'), numeric: true },
    ],
    rows: [
      ...data.rows.map((r) => [
        valueLabel('work_order_priority', r.priority),
        ...r.counts,
        r.counts.reduce((s, n) => s + n, 0),
      ]),
      [t('Total'), ...columnTotals, data.total],
    ],
    links: drill
      ? [
          ...data.rows.map((r) => [
            null,
            ...r.counts.map((n, i) => (n ? drill(`${r.priority}:${data.buckets[i]}`) : null)),
            r.counts.some((n) => n) ? drill(r.priority) : null,
          ]),
          [null, ...columnTotals.map((n, i) => (n ? drill(`:${data.buckets[i]}`) : null)), null],
        ]
      : undefined,
  };
}

/** Heat step 0–4 of a count against the largest cell (0 = no fill). Pure. */
export function heatStep(count, max) {
  return count && max ? Math.max(1, Math.ceil((count / max) * 4)) : 0;
}

function ageBody(data, context) {
  const table = ageTable(data, context);
  const max = Math.max(0, ...data.rows.flatMap((r) => r.counts));
  const priorityCount = data.rows.length;
  const flagged = data.urgent_old > 0;
  return {
    flagged,
    element: [
      flagged
        ? h(
            'p',
            { class: 'widget-alert' },
            h(
              'span',
              { class: 'badge badge-tone-warning' },
              h('span', { 'aria-hidden': 'true' }, '⚠'),
              t('Needs attention'),
            ),
            tn(
              data.urgent_old,
              ' {n} urgent or high-priority work order is more than 30 days old.',
              ' {n} urgent or high-priority work orders are more than 30 days old.',
            ),
          )
        : null,
      h(
        'div',
        { class: 'heatmap-scroll' },
        tableElement(table, t('Unfinished work orders by priority and age'), {
          cellClass: (r, i, cell) => {
            if (r >= priorityCount || i === 0 || i > data.buckets.length) return 'heat-total';
            const old =
              OLD.includes(data.buckets[i - 1]) &&
              ['URGENT', 'HIGH'].includes(data.rows[r].priority);
            return `heat heat-${heatStep(cell, max)}${old && cell ? ' heat-old' : ''}`;
          },
        }),
      ),
      h(
        'p',
        { class: 'widget-note' },
        t(
          '{total} unfinished work orders, by days since they were created. Darker cells hold more.',
          { total: numberFormat.format(data.total) },
        ),
      ),
    ],
  };
}

// --- Backlog in weeks of work ----------------------------------------------------------------

const weeksText = (item) =>
  item.weeks === null
    ? t('{hours} h, no capacity', { hours: oneDecimal.format(item.hours) })
    : t('{weeks} wk', { weeks: oneDecimal.format(item.weeks) });

function weeksTable(data, { drill }) {
  const rows = data.items.map((i) => [
    valueLabel('category', i.category),
    i.work_orders,
    oneDecimal.format(i.hours),
    oneDecimal.format(i.capacity),
    i.weeks === null ? '—' : oneDecimal.format(i.weeks),
  ]);
  const links = data.items.map((i) => [
    null,
    i.work_orders ? drill?.(i.category) : null,
    null,
    null,
    null,
  ]);
  if (data.unspecified) {
    rows.push([
      t('Unspecified'),
      data.unspecified.work_orders,
      oneDecimal.format(data.unspecified.hours),
      '—',
      '—',
    ]);
    links.push([null, drill?.('UNSPECIFIED') ?? null, null, null, null]);
  }
  return {
    columns: [
      { label: t('Trade') },
      { label: t('Work orders'), numeric: true },
      { label: t('Hours left'), numeric: true },
      { label: t('Weekly capacity (h)'), numeric: true },
      { label: t('Weeks of work'), numeric: true },
    ],
    rows,
    links: drill ? links : undefined,
  };
}

function weeksBody(data, context) {
  const notes = [
    data.unspecified
      ? h(
          'p',
          { class: 'widget-note' },
          tx(
            plural(
              data.unspecified.work_orders,
              '{hours} left on {n} work order without a trade.',
              '{hours} left on {n} work orders without a trade.',
            ),
            {
              n: numberFormat.format(data.unspecified.work_orders),
              hours: context.drill
                ? h(
                    'a',
                    { href: context.drill('UNSPECIFIED'), 'data-link': true },
                    `${oneDecimal.format(data.unspecified.hours)} h`,
                  )
                : `${oneDecimal.format(data.unspecified.hours)} h`,
            },
          ),
        )
      : null,
    data.without_estimate
      ? h(
          'p',
          { class: 'widget-note' },
          tx(
            plural(
              data.without_estimate,
              '{orders} without an estimate is not counted.',
              '{orders} without an estimate are not counted.',
            ),
            {
              orders: context.drill
                ? h(
                    'a',
                    { href: context.drill('NO_ESTIMATE'), 'data-link': true },
                    tn(
                      data.without_estimate,
                      '{n} unfinished work order',
                      '{n} unfinished work orders',
                    ),
                  )
                : tn(
                    data.without_estimate,
                    '{n} unfinished work order',
                    '{n} unfinished work orders',
                  ),
            },
          ),
        )
      : null,
  ];
  if (!data.items.length) {
    return {
      element: [
        h('p', { class: 'empty-state' }, t('No unfinished work and no capacity for these trades.')),
        ...notes,
      ],
    };
  }
  const labels = data.items.map((i) => valueLabel('category', i.category));
  const canvas = canvasFor(
    t('Bar chart, weeks of work per trade. {map}.', {
      map: data.items
        .map((i, n) => t('{label}: {value}', { label: labels[n], value: weeksText(i) }))
        .join(', '),
    }),
  );
  return {
    element: [
      chartFrame(canvas, data.items.length * 40 + 36),
      h(
        'p',
        { class: 'widget-note' },
        t(
          "Hours left on unfinished work, divided by the trade's weekly capacity. Shaded: {BACKLOG_BAND} to {BACKLOG_BAND2} weeks, a common rule of thumb.",
          { BACKLOG_BAND: BACKLOG_BAND[0], BACKLOG_BAND2: BACKLOG_BAND[1] },
        ),
      ),
      ...notes,
      tableDetails(weeksTable(data, context), t('Backlog in weeks of work, by trade')),
    ],
    charts: [
      {
        canvas,
        draw: () =>
          drawWeekBars(canvas, {
            labels,
            values: data.items.map((i) => i.weeks),
            tips: data.items.map((i) => weeksText(i)),
            band: BACKLOG_BAND,
            tooltips: data.items.map((i) => [
              tn(
                i.work_orders,
                '{hours} h left on {n} work order',
                '{hours} h left on {n} work orders',
                {
                  hours: oneDecimal.format(i.hours),
                },
              ),
              t('Capacity: {capacity} h a week', { capacity: oneDecimal.format(i.capacity) }),
            ]),
            onPick: context.open ? (_s, n) => context.open(data.items[n].category) : undefined,
          }),
      },
    ],
  };
}

// --- Planned vs reactive work -----------------------------------------------------------------

const hoursText = (hours) => `${oneDecimal.format(hours)} h`;

function workTable(data, { drill, options }) {
  const basis = options?.basis ?? 'count';
  const value = (cell) => (basis === 'hours' ? Math.round(cell.hours * 10) / 10 : cell.count);
  return {
    columns: [
      { label: data.unit === 'week' ? t('Week') : t('Month') },
      ...data.groups.map((g) => ({ label: WORK_GROUP_LABELS[g], numeric: true })),
      { label: basis === 'hours' ? t('Total hours') : t('Total'), numeric: true },
    ],
    rows: data.buckets.map((b) => {
      const values = data.groups.map((g) => value(b.values[g]));
      return [
        bucketTitle(b, data.unit),
        ...values,
        Math.round(values.reduce((s, v) => s + v, 0) * 10) / 10,
      ];
    }),
    links: drill
      ? data.buckets.map((b) => [
          null,
          ...data.groups.map((g) => (b.values[g].count ? drill(`${g}:${b.key}`) : null)),
          null,
        ])
      : undefined,
  };
}

/** Share of planned work over the whole period, by the basis chosen. Pure. */
export function plannedShare(data, basis) {
  const pick = (cell) => (basis === 'hours' ? cell.hours : cell.count);
  let planned = 0;
  let total = 0;
  for (const b of data.buckets) {
    for (const g of data.groups) {
      total += pick(b.values[g]);
      if (g === 'PLANNED') planned += pick(b.values[g]);
    }
  }
  return total ? planned / total : null;
}

function workBody(data, context) {
  const basis = context.options?.basis ?? 'count';
  const labels = data.buckets.map((b, i) => bucketAxis(b, data.unit, i));
  const titles = data.buckets.map((b) => bucketTitle(b, data.unit));
  const share = plannedShare(data, basis);
  const canvas = canvasFor(
    `${
      data.unit === 'week'
        ? t(
            'Stacked column chart, share of planned, reactive, staff request and improvement work done per week',
          )
        : t(
            'Stacked column chart, share of planned, reactive, staff request and improvement work done per month',
          )
    }${
      share === null
        ? ''
        : t('; planned work: {share} over the period', { share: percentFormat.format(share) })
    }.`,
  );
  const switcher = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': t('Count') },
    [
      ['count', t('Work orders')],
      ['hours', t('Hours')],
    ].map(([value, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'segmented-option',
          'aria-pressed': String(basis === value),
          dataset: { focus: `basis-${value}` },
          onClick: () => {
            if (basis !== value) context.onOption?.('basis', value);
          },
        },
        label,
      ),
    ),
  );
  return {
    element: [
      h('div', { class: 'widget-toolbar' }, switcher),
      h(
        'p',
        { class: 'widget-summary' },
        share === null
          ? t('No work order was done in this period.')
          : tx(
              basis === 'hours'
                ? 'Planned work: {share} of the hours worked on the work orders done in the period.'
                : 'Planned work: {share} of the work orders done in the period.',
              { share: h('strong', {}, percentFormat.format(share)) },
            ),
      ),
      legend(data.groups.map((g) => [WORK_GROUP_LABELS[g], WORK_GROUP_SLOTS[g]])),
      chartFrame(canvas, 220),
      basis === 'hours' && data.without_actual_hours
        ? h(
            'p',
            { class: 'widget-note' },
            tn(
              data.without_actual_hours,
              '{n} done work order has no actual hours (counted as 0 h).',
              '{n} done work orders have no actual hours (counted as 0 h).',
            ),
          )
        : null,
      tableDetails(
        workTable(data, context),
        data.unit === 'week'
          ? t('Work closed per week, by kind')
          : t('Work closed per month, by kind'),
      ),
    ],
    legend: data.groups.map((g) => [WORK_GROUP_LABELS[g], WORK_GROUP_SLOTS[g]]),
    charts: [
      {
        canvas,
        draw: () =>
          drawShareColumns(canvas, {
            labels,
            titles,
            series: data.groups.map((g) => ({
              label: WORK_GROUP_LABELS[g],
              slot: WORK_GROUP_SLOTS[g],
              values: data.buckets.map((b) =>
                basis === 'hours' ? b.values[g].hours : b.values[g].count,
              ),
            })),
            format: basis === 'hours' ? hoursText : (v) => numberFormat.format(v),
            onPick: context.open
              ? (series, i) => context.open(`${data.groups[series]}:${data.buckets[i].key}`)
              : undefined,
          }),
      },
    ],
  };
}

// --- Catalogue part ---------------------------------------------------------------------------

/** "Urgent, 91+ days old", "opened in week 40, 2026", "Planned, week 38, 2026"… Pure. */
function segmentText(key, segment) {
  const [first, second] = segment.includes(':')
    ? [segment.slice(0, segment.indexOf(':')), segment.slice(segment.indexOf(':') + 1)]
    : [segment, null];
  switch (key) {
    case 'opened_vs_closed':
      return t(
        first === 'opened'
          ? 'opened in {bucket}'
          : first === 'closed'
            ? 'closed in {bucket}'
            : 'cancelled in {bucket}',
        { bucket: bucketKeyInText(second) },
      );
    case 'backlog_age': {
      const priority = first ? valueLabel('work_order_priority', first) : null;
      const age = second ? t('{age} old', { age: AGE_LABELS[second] }) : null;
      return [priority, age].filter(Boolean).join(', ');
    }
    case 'backlog_weeks':
      return segment === 'NO_ESTIMATE'
        ? t('without an estimate')
        : segment === 'UNSPECIFIED'
          ? t('without a trade')
          : valueLabel('category', segment);
    case 'planned_vs_reactive':
      return [WORK_GROUP_LABELS[first], second ? bucketKeyInText(second) : null]
        .filter(Boolean)
        .join(', ');
    default:
      return segment;
  }
}

/**
 * The flow and backlog widgets: `body(data, context)`, `table(data, context)` (CSV, image and
 * table view) and `segment(segment)` (the drill-down label).
 */
export const FLOW_WIDGETS = {
  opened_vs_closed: { body: flowBody, table: flowTable },
  backlog_age: { body: ageBody, table: ageTable },
  backlog_weeks: { body: weeksBody, table: weeksTable },
  planned_vs_reactive: { body: workBody, table: workTable },
};
for (const [key, widget] of Object.entries(FLOW_WIDGETS)) {
  widget.segment = (segment) => segmentText(key, segment);
}
