// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Responsiveness, asset and people widgets of the dashboards (docs/spec-dashboards.md §6.4,
// Phase 24): response times, staff request service, SLA compliance (D86), bad actors, critical
// downtime, workload and estimate accuracy (the repeat failures are a tile, in widgets.js). Each has a body, a
// table view with links to the records behind its cells (K9), and its segment labels.
import { numberFormat, percentFormat } from './dashboard.js';
import { h } from './dom.js';
import { formatDate, personName } from './format.js';
import { valueLabel } from './labels.js';
import { drawPriorityStack, drawRanges, drawValueBars } from './widget-charts.js';
import { bucketKeyInText, bucketTitle, tableElement } from './widgets-flow.js';
import { locale, plural, t, tn, tx } from './i18n.js';

const oneDecimal = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });

/** A duration in hours as people read it: "45 min", "6.5 h" under 48 hours, else "3.2 d". Pure. */
export function durationText(hours) {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return t('{value} min', { value: Math.round(hours * 60) });
  return hours < 48
    ? `${oneDecimal.format(hours)} h`
    : t('{days} d', { days: oneDecimal.format(hours / 24) });
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
    h('summary', {}, t('Show as a table')),
    tableElement(table, caption),
  );
const link = (href, text) => (href ? h('a', { href, 'data-link': true }, text) : text);

// --- Response times ----------------------------------------------------------------------------

const KINDS = [
  ['start', t('Time to start'), t('From the report to the first “In progress”')],
  ['close', t('Time to done'), t('From the report to “Technically done”')],
];

function responseTable(data, { drill }) {
  return {
    columns: [
      { label: t('Priority') },
      { label: t('count|Started'), numeric: true },
      { label: t('Median to start'), numeric: true },
      { label: t('90% started within'), numeric: true },
      { label: t('count|Done'), numeric: true },
      { label: t('Median to done'), numeric: true },
      { label: t('90% done within'), numeric: true },
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
        t('No work order was started or done in this period.'),
      ),
    };
  }
  const labels = data.rows.map((r) => valueLabel('work_order_priority', r.priority));
  const charts = [];
  const parts = [
    h(
      'p',
      { class: 'widget-summary' },
      tx('Half the work orders were started within {start} and done within {close}.', {
        start: h('strong', {}, durationText(data.start.median)),
        close: h('strong', {}, durationText(data.close.median)),
      }),
    ),
    h(
      'ul',
      { class: 'chart-legend' },
      h('li', {}, h('span', { class: 'range-dot', 'aria-hidden': 'true' }), t('Median')),
      h(
        'li',
        {},
        h('span', { class: 'range-bar', 'aria-hidden': 'true' }),
        t('Up to the 90th percentile'),
      ),
    ),
  ];
  for (const [kind, title, hint] of KINDS) {
    const canvas = canvasFor(
      t('{title} per priority. {map}.', {
        title,
        map: data.rows
          .map((r, i) =>
            t('{priority}: median {median}, 90% within {p90}', {
              priority: labels[i],
              median: durationText(r[kind].median),
              p90: durationText(r[kind].p90),
            }),
          )
          .join('; '),
      }),
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
  parts.push(tableDetails(responseTable(data, context), t('Response times by priority')));
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
      { label: data.unit === 'week' ? t('Week') : t('Month') },
      { label: t('Requests'), numeric: true },
      { label: t('Median to review'), numeric: true },
      { label: t('Median to done'), numeric: true },
      { label: t('count|Rejected'), numeric: true },
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
      element: h('p', { class: 'empty-state' }, t('No staff request was sent in this period.')),
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
  const weekly = data.unit === 'week';
  return {
    element: [
      h(
        'p',
        { class: 'widget-summary' },
        tn(
          data.count,
          '{n} request received, {reviewed} reviewed.',
          '{n} requests received, {reviewed} reviewed.',
          {
            reviewed: numberFormat.format(data.reviewed),
          },
        ),
      ),
      h(
        'div',
        { class: 'mini-figures' },
        figure(
          t('Median time to review'),
          durationText(data.review_median),
          data.buckets.map((b) => b.review_median),
          weekly ? t('Median time to review per week') : t('Median time to review per month'),
        ),
        figure(
          t('Median time to done'),
          durationText(data.done_median),
          data.buckets.map((b) => b.done_median),
          weekly ? t('Median time to done per week') : t('Median time to done per month'),
        ),
        figure(
          t('count|Rejected'),
          link(
            data.rejected && context.drill ? context.drill('rejected') : null,
            rateText(data.rejected_share),
          ),
          data.buckets.map((b) => b.rejected_share),
          weekly ? t('Share rejected per week') : t('Share rejected per month'),
        ),
      ),
      h(
        'p',
        { class: 'widget-note' },
        link(context.drill?.('pending'), t('Requests waiting for review')),
        ' · ',
        link(context.drill?.('rejected'), t('rejected requests, with their reason')),
      ),
      tableDetails(
        requestTable(data),
        weekly ? t('Staff requests per week') : t('Staff requests per month'),
      ),
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
      { label: t('Asset') },
      { label: t('Site') },
      { label: t('Criticality') },
      { label: t('Corrective work orders'), numeric: true },
      { label: t('Cumulative share'), numeric: true },
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
    { class: 'segmented', role: 'group', 'aria-label': t('Assets') },
    [
      ['no', t('All assets')],
      ['yes', t('High and critical')],
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
        h('p', { class: 'empty-state' }, t('No corrective work on these assets in this period.')),
      ],
    };
  }
  const labels = actors.items.map((i) => i.asset.code);
  const canvas = canvasFor(
    t('Bar chart, corrective work orders per asset. {map}.', {
      map: actors.items
        .map((i) => t('{label}: {value}', { label: i.asset.code, value: i.count }))
        .join(', '),
    }),
  );
  const top = actors.items.at(-1);
  return {
    element: [
      h('div', { class: 'widget-toolbar' }, switcher),
      h(
        'p',
        { class: 'widget-summary' },
        tx(
          plural(
            actors.items.length,
            'This asset accounts for {share} of the {total} corrective work orders on {assets} assets.',
            'These {count} assets account for {share} of the {total} corrective work orders on {assets} assets.',
          ),
          {
            count: numberFormat.format(actors.items.length),
            share: h('strong', {}, rateText(top.cumulative)),
            total: numberFormat.format(actors.total),
            assets: numberFormat.format(actors.assets),
          },
        ),
      ),
      chartFrame(canvas, actors.items.length * 32 + 36),
      tableDetails(actorsTable(data, context), t('Assets with the most corrective work')),
    ],
    charts: [
      {
        canvas,
        draw: () =>
          drawValueBars(canvas, {
            labels,
            values: actors.items.map((i) => i.count),
            tips: actors.items.map((i) =>
              t('{count} · {rateText} cum.', { count: i.count, rateText: rateText(i.cumulative) }),
            ),
            tooltips: actors.items.map((i) => [
              i.asset.name,
              `${i.asset.site} · ${valueLabel('criticality', i.asset.criticality)}`,
              tn(i.count, '{n} corrective work order', '{n} corrective work orders'),
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
      { label: t('Site') },
      { label: t('Days broken down'), numeric: true },
      { label: t('Assets affected'), numeric: true },
      { label: t('Down today'), numeric: true },
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
        t('None of the {watched} high and critical assets was broken down in this period.', {
          watched: numberFormat.format(data.watched),
        }),
      ),
    };
  }
  const canvas = canvasFor(
    t('Bar chart, days high and critical assets were broken down, per site. {map}.', {
      map: data.items
        .map((i) => t('{label}: {value}', { label: i.site, value: i.days }))
        .join(', '),
    }),
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
              t('Needs attention'),
            ),
            tn(
              data.down_today,
              ' {n} high or critical asset is broken down today.',
              ' {n} high or critical assets are broken down today.',
            ),
          )
        : null,
      h(
        'p',
        { class: 'widget-summary' },
        t('{days} days broken down in all, among {watched} high and critical assets.', {
          days: numberFormat.format(data.days),
          watched: numberFormat.format(data.watched),
        }),
      ),
      chartFrame(canvas, data.items.length * 36 + 36),
      h(
        'p',
        { class: 'widget-note' },
        t(
          'Days on which an asset was broken down at some time; a breakdown still going on counts until today.',
        ),
      ),
      tableDetails(downtimeTable(data, context), t('Days broken down per site')),
    ],
    charts: [
      {
        canvas,
        draw: () =>
          drawValueBars(canvas, {
            labels: data.items.map((i) => i.site),
            values: data.items.map((i) => i.days),
            tips: data.items.map((i) =>
              tn(i.assets, '{days} d · {n} asset', '{days} d · {n} assets', { days: i.days }),
            ),
            tooltips: data.items.map((i) => [
              t('{days} days broken down', { days: i.days }),
              tn(
                i.assets,
                '{n} asset affected, {down} down today',
                '{n} assets affected, {down} down today',
                {
                  down: i.down_today,
                },
              ),
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
      ? [{ ...data.unassigned, label: t('Unassigned'), segment: 'UNASSIGNED' }]
      : []),
  ];
}

function workloadTable(data, { drill }) {
  const rows = rowsOfWorkload(data);
  return {
    columns: [
      { label: t('Person') },
      ...data.priorities.map((p) => ({
        label: valueLabel('work_order_priority', p),
        numeric: true,
      })),
      { label: t('Unfinished'), numeric: true },
      { label: t('Hours left'), numeric: true },
      { label: t('Booked this week (h)'), numeric: true },
      { label: t('Capacity this week (h)'), numeric: true },
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
    return { element: h('p', { class: 'empty-state' }, t('Nobody to show for these sites.')) };
  }
  const canvas = canvasFor(
    t('Stacked bar chart, unfinished work orders per person by priority. {map}.', {
      map: rows.map((r) => t('{label}: {value}', { label: r.label, value: r.total })).join(', '),
    }),
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
        t(
          'Hours left: estimates minus the hours already worked. Booked: blocks of the week scheduler in {week}.',
          { week: bucketKeyInText(data.week) },
        ),
      ),
      tableDetails(workloadTable(data, context), t('Unfinished work per person')),
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
            tips: rows.map((r) =>
              t('{total} · {hours_left} h left{value}', {
                total: r.total,
                hours_left: oneDecimal.format(r.hours_left),
                value: r.capacity
                  ? ` · ${oneDecimal.format(r.booked)}/${oneDecimal.format(r.capacity)} h`
                  : '',
              }),
            ),
            onPick: context.open
              ? (series, i) => context.open(`${rows[i].segment}:${data.priorities[series]}`)
              : undefined,
          }),
      },
    ],
  };
}

// --- SLA compliance (D86) -------------------------------------------------------------------------

/** "82 % (41 of 50)", or a dash when nothing was counted. Pure. */
const metText = (measure) =>
  measure.counted
    ? t('{share} ({met} of {counted})', {
        share: rateText(measure.share),
        met: numberFormat.format(measure.met),
        counted: numberFormat.format(measure.counted),
      })
    : '—';

function slaTable(data, { drill }) {
  return {
    columns: [
      { label: t('Priority') },
      { label: t('Response met'), numeric: true },
      { label: t('Resolution met'), numeric: true },
    ],
    rows: data.rows.map((r) => [
      valueLabel('work_order_priority', r.priority),
      metText(r.response),
      metText(r.resolution),
    ]),
    links: drill
      ? data.rows.map((r) => [
          null,
          r.response.counted ? drill(`response:${r.priority}`) : null,
          r.resolution.counted ? drill(`resolution:${r.priority}`) : null,
        ])
      : undefined,
  };
}

function slaBody(data, context) {
  const note = h(
    'p',
    { class: 'widget-note' },
    t(
      'Corrective work and staff requests reported since {date}. Unfinished work already late counts as missed.',
      { date: formatDate(data.measured_from.slice(0, 10)) },
    ),
  );
  if (!data.response.counted && !data.resolution.counted) {
    return {
      element: [
        h(
          'p',
          { class: 'empty-state' },
          t('No work order with a service level stopped its clock or is late in this period.'),
        ),
        note,
      ],
    };
  }
  return {
    element: [
      h(
        'p',
        { class: 'widget-summary' },
        tx('Response met: {response}. Resolution met: {resolution}.', {
          response: h('strong', {}, rateText(data.response.share)),
          resolution: h('strong', {}, rateText(data.resolution.share)),
        }),
      ),
      tableElement(slaTable(data, context), t('Service levels met, by priority')),
      note,
    ],
  };
}

/** Outcome of a clock in the export. */
const OUTCOME_LABELS = { met: t('Met'), missed: t('Missed') };

// --- Estimate accuracy ----------------------------------------------------------------------------

function accuracyTable(data, { drill }) {
  return {
    columns: [
      { label: t('Trade') },
      { label: t('Work orders'), numeric: true },
      { label: t('Estimated (h)'), numeric: true },
      { label: t('Actual (h)'), numeric: true },
      { label: t('Actual ÷ estimate'), numeric: true },
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
        t('No work order done in this period has both an estimate and actual hours.'),
      ),
    };
  }
  const labels = data.items.map((i) => valueLabel('category', i.category));
  const canvas = canvasFor(
    t('Bar chart, actual hours divided by estimated hours per trade. {map}.', {
      map: data.items
        .map((i, n) => t('{label}: {value}', { label: labels[n], value: ratioText(i.ratio) }))
        .join(', '),
    }),
  );
  const total = data.ratio;
  return {
    element: [
      h(
        'p',
        { class: 'widget-summary' },
        tx(
          total > 1.05
            ? 'Work took {ratio} its estimate: estimates are too low.'
            : total < 0.95
              ? 'Work took {ratio} its estimate: estimates are too high.'
              : 'Work took {ratio} its estimate: estimates are about right.',
          { ratio: h('strong', {}, ratioText(total)) },
        ),
      ),
      chartFrame(canvas, data.items.length * 36 + 36),
      h(
        'p',
        { class: 'widget-note' },
        t('Dashed line: 1.0×, the estimate. {count} done work orders with both hours.', {
          count: numberFormat.format(data.count),
        }),
      ),
      tableDetails(accuracyTable(data, context), t('Estimates against actual hours, by trade')),
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
              t('{actual} h worked for {estimated} h estimated', {
                actual: oneDecimal.format(i.actual),
                estimated: oneDecimal.format(i.estimated),
              }),
              tn(i.count, '{n} work order', '{n} work orders'),
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
        first === 'start' ? t('started') : t('response|done'),
        rest ? valueLabel('work_order_priority', rest) : null,
      ]
        .filter(Boolean)
        .join(', ');
    case 'sla_compliance':
      return [
        first === 'response' ? t('response') : t('resolution'),
        rest ? valueLabel('work_order_priority', rest) : null,
      ]
        .filter(Boolean)
        .join(', ');
    case 'request_service':
      return (
        { rejected: t('rejected'), pending: t('waiting for review'), done: t('done') }[first] ??
        first
      );
    case 'bad_actors':
      return first === 'critical' ? t('high and critical assets') : t('asset {rest}', { rest });
    case 'critical_downtime':
      return rest ?? segment;
    case 'workload': {
      const [who, priority] =
        first === 'UNASSIGNED'
          ? [t('unassigned'), rest]
          : [t('person {split}', { split: rest?.split(':')[0] }), rest?.split(':')[1]];
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
  sla_compliance: { body: slaBody, table: slaTable },
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
  response_times: [[t('Hours'), (r) => r.dashboard?.hours]],
  request_service: [
    [t('Hours to review'), (r) => r.dashboard?.hours_to_review],
    [t('Hours to done'), (r) => r.dashboard?.hours_to_done],
    [t('Reason rejected'), (r) => r.review_note],
  ],
  sla_compliance: [
    [t('Response'), (r) => OUTCOME_LABELS[r.dashboard?.response] ?? ''],
    [t('Resolution'), (r) => OUTCOME_LABELS[r.dashboard?.resolution] ?? ''],
  ],
  repeat_failures: [
    [t('Previous work order'), (r) => r.dashboard?.previous],
    [t('Days since it was done'), (r) => r.dashboard?.days_since_previous],
  ],
  critical_downtime: [[t('Days broken down'), (r) => r.dashboard?.days_down]],
  estimate_accuracy: [[t('Actual ÷ estimate'), (r) => r.dashboard?.ratio]],
};
