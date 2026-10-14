// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Responsiveness, asset and people widgets of the dashboards (docs/spec-dashboards.md §6.4,
// Phase 24): response times, staff request service, bad actors, critical downtime, workload
// and estimate accuracy (the repeat failures are a tile, in widgets.js). Each has a body, a
// table view with links to the records behind its cells (K9), and its segment labels.
import { numberFormat, percentFormat } from './dashboard.js';
import { h } from './dom.js';
import { personName } from './format.js';
import { valueLabel } from './labels.js';
import { drawPriorityStack, drawRanges, drawValueBars } from './widget-charts.js';
import { bucketTitle, tableElement } from './widgets-flow.js';

const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** A duration in hours as people read it: "45 min", "6.5 h" under 48 hours, else "3.2 d". Pure. */
export function durationText(hours) {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return hours < 48 ? `${oneDecimal.format(hours)} h` : `${oneDecimal.format(hours / 24)} d`;
}

const rateText = (rate) => (rate === null || rate === undefined ? '—' : percentFormat.format(rate));
const ratioText = (ratio) => `${oneDecimal.format(ratio)}×`;

function chartFrame(canvas, height) {
  const frame = h('div', { class: 'chart-frame' }, canvas);
  frame.style.height = `${height}px`;
  return frame;
}
const canvasFor = (summary) => h('canvas', { role: 'img', 'aria-label': summary });
const tableDetails = (table, caption) =>
  h(
    'details',
    { class: 'chart-table' },
    h('summary', {}, 'Show as a table'),
    tableElement(table, caption),
  );
const link = (href, text) => (href ? h('a', { href, 'data-link': true }, text) : text);

// --- Response times ----------------------------------------------------------------------------

const KINDS = [
  ['start', 'Time to start', 'From creation to the first “In progress”'],
  ['close', 'Time to close', 'From creation to “Closed”'],
];

function responseTable(data, { drill }) {
  return {
    columns: [
      { label: 'Priority' },
      { label: 'Started', numeric: true },
      { label: 'Median to start', numeric: true },
      { label: '90% started within', numeric: true },
      { label: 'Closed', numeric: true },
      { label: 'Median to close', numeric: true },
      { label: '90% closed within', numeric: true },
    ],
    rows: data.rows.map((r) => [
      valueLabel('work_order_priority', r.priority),
      r.start.count,
      durationText(r.start.median),
      durationText(r.start.p90),
      r.close.count,
      durationText(r.close.median),
      durationText(r.close.p90),
    ]),
    links: drill
      ? data.rows.map((r) => [
          null,
          r.start.count ? drill(`start:${r.priority}`) : null,
          null,
          null,
          r.close.count ? drill(`close:${r.priority}`) : null,
          null,
          null,
        ])
      : undefined,
  };
}

function responseBody(data, context) {
  if (!data.start.count && !data.close.count) {
    return {
      element: h(
        'p',
        { class: 'empty-state' },
        'No work order was started or closed in this period.',
      ),
    };
  }
  const labels = data.rows.map((r) => valueLabel('work_order_priority', r.priority));
  const charts = [];
  const parts = [
    h(
      'p',
      { class: 'widget-summary' },
      'Half the work orders were started within ',
      h('strong', {}, durationText(data.start.median)),
      ' and closed within ',
      h('strong', {}, durationText(data.close.median)),
      '.',
    ),
    h(
      'ul',
      { class: 'chart-legend' },
      h('li', {}, h('span', { class: 'range-dot', 'aria-hidden': 'true' }), 'Median'),
      h(
        'li',
        {},
        h('span', { class: 'range-bar', 'aria-hidden': 'true' }),
        'Up to the 90th percentile',
      ),
    ),
  ];
  for (const [kind, title, hint] of KINDS) {
    const canvas = canvasFor(
      `${title} per priority. ${data.rows
        .map(
          (r, i) =>
            `${labels[i]}: median ${durationText(r[kind].median)}, 90% within ${durationText(r[kind].p90)}`,
        )
        .join('; ')}.`,
    );
    parts.push(
      h('h3', { class: 'chart-subtitle' }, `${title} `, h('span', { class: 'muted' }, `(${hint})`)),
    );
    parts.push(chartFrame(canvas, labels.length * 34 + 36));
    charts.push({
      canvas,
      caption: title,
      draw: () =>
        drawRanges(canvas, {
          labels,
          medians: data.rows.map((r) => r[kind].median),
          p90s: data.rows.map((r) => r[kind].p90),
          counts: data.rows.map((r) => r[kind].count),
          format: durationText,
          onPick: context.open
            ? (_s, i) =>
                data.rows[i][kind].count && context.open(`${kind}:${data.rows[i].priority}`)
            : undefined,
        }),
    });
  }
  parts.push(tableDetails(responseTable(data, context), 'Response times by priority'));
  return { element: parts, charts };
}

// --- Staff request service ----------------------------------------------------------------------

/** Small line of a series in SVG (no axis: a trend next to its figure). Null values break it. */
export function sparkPoints(values, width = 96, height = 24) {
  const known = values.filter((v) => v !== null);
  if (known.length < 2) return '';
  const max = Math.max(...known);
  const min = Math.min(...known);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) =>
      v === null
        ? null
        : `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / (max - min || 1)) * (height - 4)).toFixed(1)}`,
    )
    .filter(Boolean)
    .join(' ');
}

function sparkline(values, label) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 24');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const points = sparkPoints(values);
  if (points) {
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', points);
    svg.append(line);
  }
  return svg;
}

function requestTable(data) {
  return {
    columns: [
      { label: data.unit === 'week' ? 'Week' : 'Month' },
      { label: 'Requests', numeric: true },
      { label: 'Median to review', numeric: true },
      { label: 'Median to done', numeric: true },
      { label: 'Rejected', numeric: true },
    ],
    rows: data.buckets.map((b) => [
      bucketTitle(b, data.unit),
      b.count,
      durationText(b.review_median),
      durationText(b.done_median),
      rateText(b.rejected_share),
    ]),
  };
}

function requestBody(data, context) {
  if (!data.count) {
    return {
      element: h('p', { class: 'empty-state' }, 'No staff request was sent in this period.'),
    };
  }
  const figure = (label, value, series, trend) =>
    h(
      'div',
      { class: 'mini-figure' },
      h('span', { class: 'mini-label' }, label),
      h('span', { class: 'mini-value' }, value),
      sparkline(series, trend),
    );
  const per = data.unit === 'week' ? 'week' : 'month';
  return {
    element: [
      h(
        'p',
        { class: 'widget-summary' },
        `${numberFormat.format(data.count)} request${data.count === 1 ? '' : 's'} received, ${numberFormat.format(data.reviewed)} reviewed.`,
      ),
      h(
        'div',
        { class: 'mini-figures' },
        figure(
          'Median time to review',
          durationText(data.review_median),
          data.buckets.map((b) => b.review_median),
          `Median time to review per ${per}`,
        ),
        figure(
          'Median time to done',
          durationText(data.done_median),
          data.buckets.map((b) => b.done_median),
          `Median time to done per ${per}`,
        ),
        figure(
          'Rejected',
          link(
            data.rejected && context.drill ? context.drill('rejected') : null,
            rateText(data.rejected_share),
          ),
          data.buckets.map((b) => b.rejected_share),
          `Share rejected per ${per}`,
        ),
      ),
      h(
        'p',
        { class: 'widget-note' },
        link(context.drill?.('pending'), 'Requests waiting for review'),
        ' · ',
        link(context.drill?.('rejected'), 'rejected requests, with their reason'),
      ),
      tableDetails(requestTable(data), `Staff requests per ${per}`),
    ],
  };
}

// --- Bad actors ----------------------------------------------------------------------------------

const criticalOnly = (options) => options?.critical_only === 'yes';
const actorsOf = (data, options) => (criticalOnly(options) ? data.critical : data.all);

function actorsTable(data, { drill, options }) {
  const { items } = actorsOf(data, options);
  return {
    columns: [
      { label: 'Asset' },
      { label: 'Site' },
      { label: 'Criticality' },
      { label: 'Corrective work orders', numeric: true },
      { label: 'Cumulative share', numeric: true },
    ],
    rows: items.map((i) => [
      `${i.asset.code} — ${i.asset.name}`,
      i.asset.site,
      valueLabel('criticality', i.asset.criticality),
      i.count,
      rateText(i.cumulative),
    ]),
    links: drill
      ? items.map((i) => [`/assets/${i.asset.id}`, null, null, drill(`asset:${i.asset.id}`), null])
      : undefined,
  };
}

function actorsBody(data, context) {
  const critical = criticalOnly(context.options);
  const actors = actorsOf(data, context.options);
  const switcher = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Assets' },
    [
      ['no', 'All assets'],
      ['yes', 'High and critical'],
    ].map(([value, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'segmented-option',
          'aria-pressed': String((critical ? 'yes' : 'no') === value),
          dataset: { focus: `critical_only-${value}` },
          onClick: () => {
            if ((critical ? 'yes' : 'no') !== value) context.onOption?.('critical_only', value);
          },
        },
        label,
      ),
    ),
  );
  if (!actors.items.length) {
    return {
      element: [
        h('div', { class: 'widget-toolbar' }, switcher),
        h('p', { class: 'empty-state' }, 'No corrective work on these assets in this period.'),
      ],
    };
  }
  const labels = actors.items.map((i) => i.asset.code);
  const canvas = canvasFor(
    `Bar chart, corrective work orders per asset. ${actors.items.map((i) => `${i.asset.code}: ${i.count}`).join(', ')}.`,
  );
  const top = actors.items.at(-1);
  return {
    element: [
      h('div', { class: 'widget-toolbar' }, switcher),
      h(
        'p',
        { class: 'widget-summary' },
        `These ${actors.items.length} assets account for `,
        h('strong', {}, rateText(top.cumulative)),
        ` of the ${numberFormat.format(actors.total)} corrective work orders on ${numberFormat.format(actors.assets)} assets.`,
      ),
      chartFrame(canvas, actors.items.length * 32 + 36),
      tableDetails(actorsTable(data, context), 'Assets with the most corrective work'),
    ],
    charts: [
      {
        canvas,
        draw: () =>
          drawValueBars(canvas, {
            labels,
            values: actors.items.map((i) => i.count),
            tips: actors.items.map((i) => `${i.count} · ${rateText(i.cumulative)} cum.`),
            tooltips: actors.items.map((i) => [
              i.asset.name,
              `${i.asset.site} · ${valueLabel('criticality', i.asset.criticality)}`,
              `${i.count} corrective work order${i.count === 1 ? '' : 's'}`,
            ]),
            // A bar opens the asset: its panel holds its history.
            onPick: context.navigate
              ? (_s, i) => context.navigate(`/assets/${actors.items[i].asset.id}`)
              : undefined,
          }),
      },
    ],
  };
}

// --- Critical downtime --------------------------------------------------------------------------

function downtimeTable(data, { drill }) {
  return {
    columns: [
      { label: 'Site' },
      { label: 'Days broken down', numeric: true },
      { label: 'Assets affected', numeric: true },
      { label: 'Down today', numeric: true },
    ],
    rows: data.items.map((i) => [i.site, i.days, i.assets, i.down_today]),
    links: drill ? data.items.map((i) => [null, drill(`site:${i.site}`), null, null]) : undefined,
  };
}

function downtimeBody(data, context) {
  if (!data.items.length) {
    return {
      element: h(
        'p',
        { class: 'empty-state' },
        `None of the ${numberFormat.format(data.watched)} high and critical assets was broken down in this period.`,
      ),
    };
  }
  const canvas = canvasFor(
    `Bar chart, days high and critical assets were broken down, per site. ${data.items.map((i) => `${i.site}: ${i.days}`).join(', ')}.`,
  );
  return {
    flagged: data.down_today > 0,
    element: [
      data.down_today
        ? h(
            'p',
            { class: 'widget-alert' },
            h(
              'span',
              { class: 'badge badge-tone-warning' },
              h('span', { 'aria-hidden': 'true' }, '⚠'),
              'Needs attention',
            ),
            ` ${numberFormat.format(data.down_today)} high or critical asset${data.down_today === 1 ? ' is' : 's are'} broken down today.`,
          )
        : null,
      h(
        'p',
        { class: 'widget-summary' },
        `${numberFormat.format(data.days)} days broken down in all, among ${numberFormat.format(data.watched)} high and critical assets.`,
      ),
      chartFrame(canvas, data.items.length * 36 + 36),
      h(
        'p',
        { class: 'widget-note' },
        'Days on which an asset was broken down at some time; a breakdown still going on counts until today.',
      ),
      tableDetails(downtimeTable(data, context), 'Days broken down per site'),
    ],
    charts: [
      {
        canvas,
        draw: () =>
          drawValueBars(canvas, {
            labels: data.items.map((i) => i.site),
            values: data.items.map((i) => i.days),
            tips: data.items.map(
              (i) => `${i.days} d · ${i.assets} asset${i.assets === 1 ? '' : 's'}`,
            ),
            tooltips: data.items.map((i) => [
              `${i.days} days broken down`,
              `${i.assets} asset${i.assets === 1 ? '' : 's'} affected, ${i.down_today} down today`,
            ]),
            onPick: context.open
              ? (_s, i) => context.open(`site:${data.items[i].site}`)
              : undefined,
          }),
      },
    ],
  };
}

// --- Workload ------------------------------------------------------------------------------------

/** Ordinal step of a priority (4 = Urgent, the darkest). */
const STEPS = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };

function rowsOfWorkload(data) {
  return [
    ...data.people.map((p) => ({ ...p, label: personName(p), segment: `person:${p.id}` })),
    ...(data.unassigned.total
      ? [{ ...data.unassigned, label: 'Unassigned', segment: 'UNASSIGNED' }]
      : []),
  ];
}

function workloadTable(data, { drill }) {
  const rows = rowsOfWorkload(data);
  return {
    columns: [
      { label: 'Person' },
      ...data.priorities.map((p) => ({
        label: valueLabel('work_order_priority', p),
        numeric: true,
      })),
      { label: 'Unfinished', numeric: true },
      { label: 'Hours left', numeric: true },
      { label: 'Booked this week (h)', numeric: true },
      { label: 'Capacity this week (h)', numeric: true },
    ],
    rows: rows.map((r) => [
      r.label,
      ...r.counts,
      r.total,
      Math.round(r.hours_left * 10) / 10,
      r.booked ?? '',
      r.capacity ?? '',
    ]),
    links: drill
      ? rows.map((r) => [
          null,
          ...r.counts.map((n, i) => (n ? drill(`${r.segment}:${data.priorities[i]}`) : null)),
          r.total ? drill(r.segment) : null,
          null,
          null,
          null,
        ])
      : undefined,
  };
}

function workloadBody(data, context) {
  const rows = rowsOfWorkload(data);
  if (!rows.length) {
    return { element: h('p', { class: 'empty-state' }, 'Nobody to show for these sites.') };
  }
  const canvas = canvasFor(
    `Stacked bar chart, unfinished work orders per person by priority. ${rows.map((r) => `${r.label}: ${r.total}`).join(', ')}.`,
  );
  const priorities = data.priorities.map((p) => [valueLabel('work_order_priority', p), STEPS[p]]);
  return {
    element: [
      h(
        'ul',
        { class: 'chart-legend' },
        priorities.map(([label, step]) =>
          h(
            'li',
            {},
            h('span', { class: `pie-swatch ordinal-${step}`, 'aria-hidden': 'true' }),
            label,
          ),
        ),
      ),
      chartFrame(canvas, rows.length * 34 + 36),
      h(
        'p',
        { class: 'widget-note' },
        `Hours left: estimates minus the hours already worked. Booked: blocks of the week scheduler in ${data.week.replace('-W', ', week ')}.`,
      ),
      tableDetails(workloadTable(data, context), 'Unfinished work per person'),
    ],
    legend: priorities.map(([label, step]) => [label, `--color-ordinal-${step}`]),
    charts: [
      {
        canvas,
        draw: () =>
          drawPriorityStack(canvas, {
            labels: rows.map((r) => r.label),
            series: data.priorities.map((p, i) => ({
              label: valueLabel('work_order_priority', p),
              step: STEPS[p],
              values: rows.map((r) => r.counts[i]),
            })),
            tips: rows.map(
              (r) =>
                `${r.total} · ${oneDecimal.format(r.hours_left)} h left${r.capacity ? ` · ${oneDecimal.format(r.booked)}/${oneDecimal.format(r.capacity)} h` : ''}`,
            ),
            onPick: context.open
              ? (series, i) => context.open(`${rows[i].segment}:${data.priorities[series]}`)
              : undefined,
          }),
      },
    ],
  };
}

// --- Estimate accuracy ----------------------------------------------------------------------------

function accuracyTable(data, { drill }) {
  return {
    columns: [
      { label: 'Trade' },
      { label: 'Work orders', numeric: true },
      { label: 'Estimated (h)', numeric: true },
      { label: 'Actual (h)', numeric: true },
      { label: 'Actual ÷ estimate', numeric: true },
    ],
    rows: data.items.map((i) => [
      valueLabel('category', i.category),
      i.count,
      Math.round(i.estimated * 10) / 10,
      Math.round(i.actual * 10) / 10,
      ratioText(i.ratio),
    ]),
    links: drill ? data.items.map((i) => [null, drill(i.category), null, null, null]) : undefined,
  };
}

function accuracyBody(data, context) {
  if (!data.items.length) {
    return {
      element: h(
        'p',
        { class: 'empty-state' },
        'No work order closed in this period has both an estimate and actual hours.',
      ),
    };
  }
  const labels = data.items.map((i) => valueLabel('category', i.category));
  const canvas = canvasFor(
    `Bar chart, actual hours divided by estimated hours per trade. ${data.items.map((i, n) => `${labels[n]}: ${ratioText(i.ratio)}`).join(', ')}.`,
  );
  const total = data.ratio;
  return {
    element: [
      h(
        'p',
        { class: 'widget-summary' },
        'Work took ',
        h('strong', {}, ratioText(total)),
        total > 1.05
          ? ' its estimate: estimates are too low.'
          : total < 0.95
            ? ' its estimate: estimates are too high.'
            : ' its estimate: estimates are about right.',
      ),
      chartFrame(canvas, data.items.length * 36 + 36),
      h(
        'p',
        { class: 'widget-note' },
        `Dashed line: 1.0×, the estimate. ${numberFormat.format(data.count)} closed work orders with both hours.`,
      ),
      tableDetails(accuracyTable(data, context), 'Estimates against actual hours, by trade'),
    ],
    charts: [
      {
        canvas,
        draw: () =>
          drawValueBars(canvas, {
            labels,
            values: data.items.map((i) => i.ratio),
            tips: data.items.map((i) => `${ratioText(i.ratio)} (${i.count})`),
            tooltips: data.items.map((i) => [
              `${oneDecimal.format(i.actual)} h worked for ${oneDecimal.format(i.estimated)} h estimated`,
              `${i.count} work order${i.count === 1 ? '' : 's'}`,
            ]),
            tick: (v) => `${v}×`,
            reference: 1,
            onPick: context.open ? (_s, i) => context.open(data.items[i].category) : undefined,
          }),
      },
    ],
  };
}

// --- Catalogue part ------------------------------------------------------------------------------

function segmentText(key, segment) {
  const at = segment.indexOf(':');
  const first = at < 0 ? segment : segment.slice(0, at);
  const rest = at < 0 ? null : segment.slice(at + 1);
  switch (key) {
    case 'response_times':
      return [
        first === 'start' ? 'started' : 'closed',
        rest ? valueLabel('work_order_priority', rest) : null,
      ]
        .filter(Boolean)
        .join(', ');
    case 'request_service':
      return { rejected: 'rejected', pending: 'waiting for review', done: 'done' }[first] ?? first;
    case 'bad_actors':
      return first === 'critical' ? 'high and critical assets' : `asset ${rest}`;
    case 'critical_downtime':
      return rest ?? segment;
    case 'workload': {
      const [who, priority] =
        first === 'UNASSIGNED'
          ? ['unassigned', rest]
          : [`person ${rest?.split(':')[0]}`, rest?.split(':')[1]];
      return [who, priority ? valueLabel('work_order_priority', priority) : null]
        .filter(Boolean)
        .join(', ');
    }
    case 'estimate_accuracy':
      return valueLabel('category', segment);
    default:
      return segment;
  }
}

/** The responsiveness, asset and people widgets: `body`, `table`, `segment`. */
export const PEOPLE_WIDGETS = {
  response_times: { body: responseBody, table: responseTable },
  request_service: { body: requestBody, table: requestTable },
  bad_actors: { body: actorsBody, table: actorsTable },
  critical_downtime: { body: downtimeBody, table: downtimeTable },
  workload: { body: workloadBody, table: workloadTable },
  estimate_accuracy: { body: accuracyBody, table: accuracyTable },
};
for (const [key, widget] of Object.entries(PEOPLE_WIDGETS)) {
  widget.segment = (segment) => segmentText(key, segment);
}

/** Columns a widget adds to its exported records (from `dashboard` of each row). */
export const EXTRA_COLUMNS = {
  response_times: [['Hours', (r) => r.dashboard?.hours]],
  request_service: [
    ['Hours to review', (r) => r.dashboard?.hours_to_review],
    ['Hours to done', (r) => r.dashboard?.hours_to_done],
    ['Reason rejected', (r) => r.review_note],
  ],
  repeat_failures: [
    ['Previous work order', (r) => r.dashboard?.previous],
    ['Days since it closed', (r) => r.dashboard?.days_since_previous],
  ],
  critical_downtime: [['Days broken down', (r) => r.dashboard?.days_down]],
  estimate_accuracy: [['Actual ÷ estimate', (r) => r.dashboard?.ratio]],
};
