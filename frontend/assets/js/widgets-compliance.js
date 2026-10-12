// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Compliance widgets of the dashboards (docs/spec-dashboards.md §6.3, Phase 23): preventive
// maintenance compliance, week schedule kept, contractor scorecard (the regulatory visits
// late are a tile, in widgets.js). Each has a body, a table view with links to the records
// behind its cells (K9), and the labels of its segments for the drill-down list.
import { numberFormat, percentFormat } from './dashboard.js';
import { h } from './dom.js';
import { valueLabel } from './labels.js';
import { drawRateBars, drawShareWithLine } from './widget-charts.js';
import { bucketAxis, bucketTitle, bucketKeyText, legend, tableElement } from './widgets-flow.js';

export const OUTCOME_LABELS = { on_time: 'On time', late: 'Late', skipped: 'Skipped' };
const OUTCOMES = ['on_time', 'late', 'skipped'];

const rateText = (rate) => (rate === null ? '—' : percentFormat.format(rate));
const plural = (n, word) => `${numberFormat.format(n)} ${word}${n === 1 ? '' : 's'}`;
const oneDecimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

function chartFrame(canvas, height) {
  const frame = h('div', { class: 'chart-frame' }, canvas);
  frame.style.height = `${height}px`;
  return frame;
}

const tableDetails = (table, caption) =>
  h(
    'details',
    { class: 'chart-table' },
    h('summary', {}, 'Show as a table'),
    tableElement(table, caption),
  );

/** Columns and links of outcome counts per row (trade or contractor). */
function outcomeTable(firstLabel, rows, { drill, labelOf, segmentOf }) {
  return {
    columns: [
      { label: firstLabel },
      ...OUTCOMES.map((o) => ({ label: OUTCOME_LABELS[o], numeric: true })),
      { label: 'On time %', numeric: true },
    ],
    rows: rows.map((r) => [labelOf(r), r.on_time, r.late, r.skipped, rateText(r.rate)]),
    links: drill
      ? rows.map((r) => [
          null,
          // Skipped visits often have no work order: their CSV lists them, the list cannot.
          ...OUTCOMES.map((o) => (r[o] && o !== 'skipped' ? drill(`${o}:${segmentOf(r)}`) : null)),
          null,
        ])
      : undefined,
  };
}

// --- Preventive maintenance compliance --------------------------------------------------------

function pmTable(data, { drill }) {
  return outcomeTable('Trade', data.items, {
    drill,
    labelOf: (r) => valueLabel('category', r.category),
    segmentOf: (r) => r.category,
  });
}

function pmBody(data, context) {
  const counted = data.on_time + data.late;
  if (!counted && !data.skipped) {
    return {
      element: h(
        'p',
        { class: 'empty-state' },
        'No preventive visit had its deadline in this period.',
      ),
    };
  }
  const labels = data.items.map((i) => valueLabel('category', i.category));
  const canvas = h('canvas', {
    role: 'img',
    'aria-label': `Bar chart, visits on time per trade. ${data.items
      .map((i, n) => `${labels[n]}: ${rateText(i.rate)}`)
      .join(', ')}.`,
  });
  const late = (text, segment) =>
    context.drill && data.late
      ? h('a', { href: context.drill(segment), 'data-link': true }, text)
      : text;
  const reg = data.regulatory;
  return {
    flagged: reg.late > 0,
    element: [
      h(
        'p',
        { class: 'widget-figure' },
        h('span', { class: 'kpi-value' }, rateText(data.rate)),
        h('span', { class: 'muted' }, ' on time'),
      ),
      h(
        'p',
        { class: 'widget-summary' },
        `${numberFormat.format(data.on_time)} of ${plural(counted, 'visit')} done by their deadline; `,
        late(`${numberFormat.format(data.late)} late`, 'late'),
        data.skipped ? `; ${numberFormat.format(data.skipped)} skipped (not counted).` : '.',
      ),
      reg.on_time + reg.late + reg.skipped
        ? h(
            'p',
            { class: reg.late ? 'widget-alert' : 'widget-note' },
            reg.late
              ? h(
                  'span',
                  { class: 'badge badge-tone-warning' },
                  h('span', { 'aria-hidden': 'true' }, '⚠'),
                  'Regulatory',
                )
              : null,
            ` Regulatory visits: ${numberFormat.format(reg.on_time)} on time, ${numberFormat.format(reg.late)} late${reg.skipped ? `, ${numberFormat.format(reg.skipped)} skipped` : ''}.`,
          )
        : null,
      data.items.length ? chartFrame(canvas, data.items.length * 40 + 36) : null,
      h(
        'p',
        { class: 'widget-note' },
        'A visit counts once its deadline week is over: the planned week plus the plan’s tolerance; for a regulatory visit, its due week.',
      ),
      tableDetails(pmTable(data, context), 'Preventive visits by trade and outcome'),
    ],
    charts: data.items.length
      ? [
          {
            canvas,
            draw: () =>
              drawRateBars(canvas, {
                labels,
                values: data.items.map((i) => i.rate),
                tips: data.items.map((i) =>
                  i.rate === null
                    ? 'all skipped'
                    : `${rateText(i.rate)} (${i.on_time}/${i.on_time + i.late})`,
                ),
                tooltips: data.items.map((i) => [
                  `${numberFormat.format(i.on_time)} on time, ${numberFormat.format(i.late)} late`,
                  ...(i.skipped ? [`${numberFormat.format(i.skipped)} skipped`] : []),
                ]),
                onPick: context.open
                  ? (_s, n) => data.items[n].late && context.open(`late:${data.items[n].category}`)
                  : undefined,
              }),
          },
        ]
      : [],
  };
}

// --- Week schedule kept ------------------------------------------------------------------------

function scheduleTable(data, { drill }) {
  return {
    columns: [
      { label: data.unit === 'week' ? 'Week' : 'Month' },
      { label: 'Scheduled', numeric: true },
      { label: 'Finished in the week', numeric: true },
      { label: 'Kept %', numeric: true },
      { label: 'Hours booked', numeric: true },
      { label: 'Booked late %', numeric: true },
    ],
    rows: data.buckets.map((b) => [
      bucketTitle(b, data.unit),
      b.scheduled,
      b.kept,
      rateText(b.rate),
      Math.round(b.hours * 10) / 10,
      rateText(b.break_in),
    ]),
    links: drill
      ? data.buckets.map((b) => [
          null,
          b.scheduled ? drill(`scheduled:${b.key}`) : null,
          b.kept ? drill(`kept:${b.key}`) : null,
          b.scheduled > b.kept ? drill(`missed:${b.key}`) : null,
          null,
          null,
        ])
      : undefined,
  };
}

function scheduleBody(data, context) {
  if (!data.scheduled) {
    return {
      element: h(
        'p',
        { class: 'empty-state' },
        'No finished week of this period had work orders scheduled in the week scheduler.',
      ),
    };
  }
  const labels = data.buckets.map((b, i) => bucketAxis(b, data.unit, i));
  const titles = data.buckets.map((b) => bucketTitle(b, data.unit));
  const canvas = h('canvas', {
    role: 'img',
    'aria-label': `Column chart, share of scheduled work orders finished in their week, per ${data.unit}. ${data.buckets
      .map((b, i) => `${titles[i]}: ${rateText(b.rate)}`)
      .join('; ')}.`,
  });
  const missed = data.scheduled - data.kept;
  return {
    element: [
      h(
        'p',
        { class: 'widget-figure' },
        h('span', { class: 'kpi-value' }, rateText(data.rate)),
        h('span', { class: 'muted' }, ' kept'),
      ),
      h(
        'p',
        { class: 'widget-summary' },
        `${numberFormat.format(data.kept)} of ${plural(data.scheduled, 'scheduled work order')} finished in their week; `,
        context.drill && missed
          ? h(
              'a',
              { href: context.drill('missed'), 'data-link': true },
              `${numberFormat.format(missed)} not`,
            )
          : `${numberFormat.format(missed)} not`,
        '.',
      ),
      legend([
        ['Finished in the week', 0],
        ['Hours booked after the week started', 2],
      ]),
      chartFrame(canvas, 220),
      h(
        'p',
        { class: 'widget-note' },
        'Finished weeks only. Hours booked late are blocks added once the week had begun: work that broke into the plan.',
      ),
      tableDetails(scheduleTable(data, context), `Schedule kept per ${data.unit}`),
    ],
    legend: [
      ['Finished in the week', 0],
      ['Hours booked after the week started', 2],
    ],
    charts: [
      {
        canvas,
        draw: () =>
          drawShareWithLine(canvas, {
            labels,
            titles,
            columns: { label: 'Finished in the week', values: data.buckets.map((b) => b.rate) },
            line: {
              label: 'Booked after the week started',
              values: data.buckets.map((b) => b.break_in),
              slot: 2,
            },
            details: data.buckets.map((b) => [
              `${numberFormat.format(b.kept)} of ${numberFormat.format(b.scheduled)} work orders`,
              `${oneDecimal.format(b.break_in_hours)} of ${oneDecimal.format(b.hours)} h booked late`,
            ]),
            onPick: context.open
              ? (_s, i) => {
                  const b = data.buckets[i];
                  if (b.scheduled > b.kept) context.open(`missed:${b.key}`);
                }
              : undefined,
          }),
      },
    ],
  };
}

// --- Contractor scorecard ----------------------------------------------------------------------

/** Columns the contractor table can be sorted by, and how. */
export const CONTRACTOR_SORTS = {
  supplier: (a, b) => a.supplier.localeCompare(b.supplier),
  visits: (a, b) => b.visits - a.visits,
  on_time: (a, b) => b.on_time - a.on_time,
  late: (a, b) => b.late - a.late,
  skipped: (a, b) => b.skipped - a.skipped,
  // The worst first, like the server's order.
  rate: (a, b) => (a.rate ?? 2) - (b.rate ?? 2) || b.late - a.late,
};

/** Contractor rows sorted by a column (the server order for `rate`). Pure. */
export function sortContractors(items, sort = 'rate') {
  return [...items].sort(CONTRACTOR_SORTS[sort] ?? CONTRACTOR_SORTS.rate);
}

function contractorTable(data, { drill, sort }) {
  const rows = sortContractors(data.items, sort);
  const table = outcomeTable('Contractor', rows, {
    drill,
    labelOf: (r) => r.supplier || 'Unnamed contractor',
    segmentOf: (r) => r.supplier,
  });
  table.columns.splice(1, 0, { label: 'Visits', numeric: true });
  table.rows.forEach((row, i) => row.splice(1, 0, rows[i].visits));
  table.links?.forEach((row, i) =>
    row.splice(1, 0, rows[i].visits && drill ? drill(`:${rows[i].supplier}`) : null),
  );
  return table;
}

function contractorBody(data, context) {
  if (!data.items.length) {
    return {
      element: h(
        'p',
        { class: 'empty-state' },
        'No contractor visit had its deadline in this period.',
      ),
    };
  }
  const holder = h('div', { class: 'scorecard' });
  let sort = 'rate';
  const keys = ['supplier', 'visits', 'on_time', 'late', 'skipped', 'rate'];
  const paint = (focusKey) => {
    const table = contractorTable(data, { ...context, sort });
    const element = tableElement(table, 'Contractor visits by outcome');
    // Sortable headers: a button in each, aria-sort on the column in use.
    element.querySelectorAll('thead th').forEach((th, i) => {
      const key = keys[i];
      const label = th.textContent;
      th.replaceChildren(
        h(
          'button',
          {
            type: 'button',
            class: 'sort-button',
            dataset: { sort: key },
            onClick: () => {
              sort = key;
              paint(key);
            },
          },
          label,
        ),
      );
      if (key === sort)
        th.setAttribute('aria-sort', key === 'supplier' ? 'ascending' : 'descending');
    });
    holder.replaceChildren(element);
    if (focusKey) holder.querySelector(`[data-sort="${focusKey}"]`)?.focus();
  };
  paint();
  return {
    flagged: data.items.some((i) => i.late),
    element: [
      h(
        'p',
        { class: 'widget-summary' },
        data.rate === null
          ? 'No contractor visit counted (all skipped).'
          : ['Contractor visits on time: ', h('strong', {}, rateText(data.rate)), '.'],
      ),
      h('div', { class: 'heatmap-scroll' }, holder),
      h('p', { class: 'widget-note' }, 'The worst first. Select a column title to sort by it.'),
    ],
  };
}

// --- Catalogue part ---------------------------------------------------------------------------

function segmentText(key, segment) {
  const at = segment.indexOf(':');
  const first = at < 0 ? segment : segment.slice(0, at);
  const second = at < 0 ? null : segment.slice(at + 1);
  const outcome = OUTCOME_LABELS[first]?.toLowerCase();
  switch (key) {
    case 'pm_compliance':
      return [second ? valueLabel('category', second) : null, outcome].filter(Boolean).join(', ');
    case 'contractor_scorecard':
      return [second || null, outcome].filter(Boolean).join(', ');
    case 'schedule_compliance': {
      const kind =
        {
          scheduled: 'scheduled',
          kept: 'finished in their week',
          missed: 'not finished in their week',
        }[first] ?? first;
      return [second ? bucketKeyText(second).replace(/^Week/, 'week') : null, kind]
        .filter(Boolean)
        .join(', ');
    }
    default:
      return segment;
  }
}

/** The compliance widgets: `body`, `table` and `segment`, like FLOW_WIDGETS. */
export const COMPLIANCE_WIDGETS = {
  pm_compliance: { body: pmBody, table: pmTable },
  schedule_compliance: { body: scheduleBody, table: scheduleTable },
  contractor_scorecard: { body: contractorBody, table: contractorTable },
};
for (const [key, widget] of Object.entries(COMPLIANCE_WIDGETS)) {
  widget.segment = (segment) => segmentText(key, segment);
}

/** Columns of the Visits (CSV) export. */
export const VISIT_COLUMNS = [
  ['Plan', (v) => v.plan_code],
  ['Title', (v) => v.plan_title],
  ['Type', (v) => valueLabel('work_order_type', v.type)],
  ['Trade', (v) => valueLabel('category', v.category)],
  ['Site', (v) => v.site],
  [
    'Done by',
    (v) => (v.performed_by === 'CONTRACTOR' ? v.supplier || 'Contractor' : 'Internal team'),
  ],
  ['Due week', (v) => v.due_week],
  ['Planned week', (v) => v.week],
  ['Deadline', (v) => v.deadline_on],
  ['Outcome', (v) => OUTCOME_LABELS[v.outcome]],
  ['Reason skipped', (v) => v.skip_reason],
  ['Work order', (v) => v.work_order_number],
  ['Closed', (v) => v.closed_on],
];
