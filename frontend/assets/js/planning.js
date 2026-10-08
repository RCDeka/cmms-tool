// Year planner (D48, docs/ui-guidelines.md → Year planner): 52 weeks × maintenance plans, the
// load strip (planned hours vs capacity, stacked by trade), the tiles, and the filters kept in
// the URL. Read-only in Phase 17: plans are created and edited in the side panel
// (plan-panel.js). Needs a connection (P18).
// Chart rules from the data-viz method: one fixed color per trade (categorical slots 1–6 in
// trade order, never by rank), a legend, values written in the tooltip and a table view.
import { badgeClass, h, replaceChildren } from './dom.js';
import { CATEGORIES, PERFORMERS, PLAN_TYPES } from './enums.js';
import { formatDate, formatWeek } from './format.js';
import { valueLabel } from './labels.js';
import { setSplitView } from './layout.js';
import { isBlocked as isBlockedFor } from './planning-rules.js';

/** Group keys of the rows, in switch order. */
export const GROUP_BY = ['site', 'building', 'category'];

/** Filters of the planner in the URL; `from` (a week) or `year` set the range. */
const FILTER_KEYS = ['from', 'year', 'group', 'site', 'category', 'type', 'performed_by', 'q'];
const WEEK = /^\d{4}-W\d{2}$/;

/**
 * Planner filters from the URL query. Unknown or invalid values are left out. Pure.
 * @param {URLSearchParams} query
 */
export function parsePlanningFilters(query) {
  const filters = {};
  const from = query.get('from');
  const year = query.get('year');
  if (from && WEEK.test(from)) filters.from = from;
  else if (year && /^\d{4}$/.test(year)) filters.year = year;
  const group = query.get('group');
  if (GROUP_BY.includes(group) && group !== 'site') filters.group = group;
  const enumValue = (key, values) => {
    const value = query.get(key);
    if (values.includes(value)) filters[key] = value;
  };
  enumValue('category', CATEGORIES);
  enumValue('type', PLAN_TYPES);
  enumValue('performed_by', PERFORMERS);
  for (const key of ['site', 'q']) {
    const value = query.get(key)?.trim();
    if (value) filters[key] = value.slice(0, key === 'q' ? 100 : 200);
  }
  return filters;
}

/** URL of the planner (or of a plan panel) with its filters. Pure. */
export function planningUrl(filters = {}, path = '/planning') {
  const query = new URLSearchParams();
  for (const key of FILTER_KEYS) if (filters[key]) query.set(key, filters[key]);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** Query of GET /api/planning/timeline for these filters. Pure. */
export function timelineQuery(filters) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', filters.from);
  if (filters.year) query.set('year', filters.year);
  query.set('group_by', filters.group ?? 'site');
  for (const key of ['site', 'category', 'type', 'performed_by', 'q']) {
    if (filters[key]) query.set(key, filters[key]);
  }
  return query.toString();
}

/** Body of POST /api/planning/suggestions: the timeline's range and filters (Phase 20). Pure. */
export function suggestionsBody(filters) {
  const body = {};
  if (filters.from) body.from = filters.from;
  if (filters.year) body.year = Number(filters.year);
  for (const key of ['site', 'category', 'type', 'performed_by', 'q']) {
    if (filters[key]) body[key] = filters[key];
  }
  return body;
}

/** True when a filter narrows the plans (the range and grouping do not). Pure. */
export const hasPlanFilters = (filters) =>
  ['site', 'category', 'type', 'performed_by', 'q'].some((k) => filters[k]);

const percentFormat = new Intl.NumberFormat('en-GB', { style: 'percent' });
const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** Load as text: '103 %', or a dash without capacity. Pure. */
export function formatLoad(load) {
  return load === null || load === undefined ? '—' : percentFormat.format(load);
}

/** Hours as text: '3.5 h'. Pure. */
export const formatHours = (hours) => `${numberFormat.format(hours)} h`;

/** 'Week 43' for a column header tooltip and labels. Pure. */
const weekNumber = (week) => Number(week.slice(6));

/** Label of a timeline group (site, "site · building" or trade). Pure. */
export function groupTitle(group) {
  if (group.category) return valueLabel('category', group.category);
  if ('building' in group) return `${group.site} · ${group.building ?? 'No building'}`;
  return group.site;
}

/**
 * What a chip shows: its text (hours, ✓ for a created work order), its style classes and
 * a full description for screen readers and the tooltip. Style is never the only cue (spec
 * §7): released ✓, skipped struck through with "skipped" in the label, regulatory §,
 * contractor outline with the supplier in the label, ⚠ for warnings. Pure.
 */
export function chipView(plan, occurrence, { series = false } = {}) {
  const classes = ['chip', `chip-${occurrence.status.toLowerCase()}`];
  const marks = [];
  const moved = occurrence.week !== occurrence.due_week;
  if (plan.type === 'REGULATORY') marks.push('§');
  if (occurrence.status === 'RELEASED') marks.push('✓');
  if (moved) marks.push('↔');
  const warnings = occurrence.warnings ?? [];
  if (warnings.length) marks.push('⚠');
  if (plan.performed_by === 'CONTRACTOR') classes.push('chip-contractor');
  if (moved) classes.push('chip-moved');
  if (warnings.length) classes.push('chip-warning');
  if (series) classes.push('chip-series');

  const parts = [
    `${plan.code}, ${formatWeek(occurrence.week)}`,
    valueLabel('occurrence_status', occurrence.status),
  ];
  if (occurrence.work_order) parts.push(`work order ${occurrence.work_order.number}`);
  parts.push(formatHours(plan.estimated_hours));
  if (plan.type === 'REGULATORY') parts.push('regulatory');
  if (plan.performed_by === 'CONTRACTOR') parts.push(`contractor ${plan.supplier ?? ''}`.trim());
  if (occurrence.week !== occurrence.due_week) {
    parts.push(`moved from ${formatWeek(occurrence.due_week)}`);
  }
  if (warnings.includes('OUT_OF_SEASON')) parts.push('outside the season');
  if (warnings.includes('BLOCKED_WEEK')) parts.push('in a blocked week');
  if (series) parts.push('first planned visit: moving it moves the whole series');
  return {
    text: `${marks.join('')}${numberFormat.format(plan.estimated_hours)}`,
    classes: classes.join(' '),
    label: parts.join(', '),
  };
}

/** Text of a plan's warnings (BR-P8). Pure. */
export function planWarningText(warnings, settings) {
  return warnings.includes('LONG_VISIT')
    ? `Longer than ${formatHours(settings.max_block_hours)}: will be split`
    : null;
}

/**
 * The five tiles (spec §7) as text, for the filters in use. `flagged`: needs attention. Pure.
 * @param {object} tiles `tiles` of the timeline
 * @param {number} weekCount weeks shown
 */
export function tileViews(tiles, weekCount) {
  const { workload, trade_balance: trades, peak_week: peak } = tiles;
  // Trades with capacity, most loaded first; trades with visits but no specialist apart.
  const loaded = trades
    .filter((t) => t.planned_hours > 0 && t.load !== null)
    .sort((a, b) => b.load - a.load)
    .map((t) => `${valueLabel('category', t.category)} ${formatLoad(t.load)}`);
  const uncovered = trades
    .filter((t) => t.planned_hours > 0 && t.load === null)
    .map((t) => valueLabel('category', t.category));
  const tradeDetail = [
    loaded.slice(1).join(' · '),
    uncovered.length ? `No specialist for: ${uncovered.join(', ')}` : '',
  ].filter(Boolean);
  const weeksAbove = (n, what) => `${n} week${n === 1 ? '' : 's'} ${what}`;
  return [
    {
      key: 'workload',
      label: 'Weekly workload',
      value: formatLoad(workload.average_load),
      detail: `average · peak ${formatLoad(workload.peak_load)} · ${weeksAbove(workload.weeks_over, 'over capacity')}, ${workload.weeks_tight} tight`,
      flagged: workload.weeks_over > 0,
    },
    {
      key: 'trades',
      label: 'Trade balance',
      value: loaded[0] ?? (uncovered.length ? 'No specialist' : 'Nothing planned'),
      detail: tradeDetail.join('. ') || `over ${weekCount} weeks`,
      flagged: trades.some((t) => t.planned_hours > 0 && (t.load === null || t.load > 1)),
    },
    {
      key: 'peak',
      label: 'Peak week',
      value: peak ? formatWeek(peak.week) : '—',
      detail: peak
        ? `${formatLoad(peak.load)} of capacity${peak.excess_hours > 0 ? `, ${formatHours(peak.excess_hours)} too many` : ''}`
        : 'No capacity counted',
      flagged: Boolean(peak && peak.load > 1),
    },
    {
      key: 'sites',
      label: 'Site spread',
      value: numberFormat.format(tiles.site_spread.average ?? 0),
      detail: `sites with internal visits a week on average, ${tiles.site_spread.peak} at most`,
      flagged: false,
    },
    {
      key: 'contractors',
      label: 'Contractor visits',
      value: String(tiles.contractor_visits.total),
      detail: tiles.contractor_visits.peak
        ? `at most ${tiles.contractor_visits.peak} in a week (${formatWeek(tiles.contractor_visits.peak_week)}), not in the load`
        : 'none in these weeks',
      flagged: false,
    },
  ];
}

/**
 * Stacked segments of a load bar, in trade order (the color follows the trade, never its
 * rank), as shares of the bar's full height `scale` (capacity × the highest load shown). Pure.
 */
export function loadSegments(figure, scale) {
  if (!scale) return [];
  return CATEGORIES.map((category, i) => ({
    category,
    slot: i + 1,
    hours: figure.by_category[category] ?? 0,
    share: (figure.by_category[category] ?? 0) / scale,
  })).filter((s) => s.hours > 0);
}

/** Full height of the load bars: capacity, or more when a week goes over it. Pure. */
export function loadScale(figures) {
  return Math.max(figures[0]?.capacity ?? 0, ...figures.map((f) => f.planned_hours));
}

/** Class of a week's cells: the current week, and the first week of a year after the first. */
function weekClass(data, i) {
  const { week } = data.weeks[i];
  const yearStart = i > 0 && week.slice(0, 4) !== data.weeks[i - 1].week.slice(0, 4);
  return `${week === data.current_week ? ' is-current' : ''}${yearStart ? ' year-start' : ''}`;
}

/** Blocked weeks of a week, as one line: "Change freeze (Saclay Data Center)". Pure. */
export function blockedText(week, blockedWeeks = []) {
  return blockedWeeks
    .filter((b) => b.week === week)
    .map((b) => `${b.reason} (${b.site ?? 'every site'})`)
    .join('; ');
}

/** True when a visit can be dragged: planned, not in the past, and the user may edit. Pure. */
export function isMovable(occurrence, currentWeek, canEdit) {
  return canEdit && occurrence.status === 'PLANNED' && occurrence.week >= currentWeek;
}

/** Field labels of the planning records in the audit log (history.js). */
export const PLANNING_FIELD_LABELS = {
  code: 'Code',
  title: 'Title',
  description: 'Instructions',
  type: 'Type',
  category: 'Trade',
  asset_id: 'Asset',
  site: 'Site',
  building: 'Building',
  location: 'Location',
  estimated_hours: 'Hours per visit',
  frequency_weeks: 'Every (weeks)',
  anchor_week: 'First visit',
  end_week: 'Last week',
  schedule_mode: 'Calendar',
  tolerance_weeks: 'Tolerance (weeks)',
  season_from_week: 'Season from week',
  season_to_week: 'Season to week',
  performed_by: 'Done by',
  supplier: 'Contractor',
  is_active: 'Active',
  status: 'Status',
  week: 'Planned week',
  due_week: 'Due week',
  work_order_id: 'Work order',
  skip_reason: 'Reason for skipping',
  daily_hours: 'Daily capacity',
  reserve_percent: 'Corrective reserve',
  release_weeks_ahead: 'Release horizon (weeks)',
  max_block_hours: 'Longest block',
};

const PLANNING_ENUMS = {
  type: 'work_order_type',
  category: 'category',
  schedule_mode: 'schedule_mode',
  performed_by: 'performed_by',
  status: 'occurrence_status',
};

/** Value of a planning field in the audit log, as text. Pure. */
export function planningFieldValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return h('span', { class: 'no-value' }, 'No value');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (PLANNING_ENUMS[field]) return valueLabel(PLANNING_ENUMS[field], value);
  if (field.endsWith('_hours')) return formatHours(value);
  if (field === 'reserve_percent') return `${value} %`;
  if (field.endsWith('week') && WEEK.test(value)) return formatWeek(value);
  if (field === 'work_order_id' || field === 'asset_id') return `#${value}`;
  return String(value);
}

// --- Rendering ---------------------------------------------------------------------------

function filterBar(filters, { sites, currentYear, canEdit, onFilter }) {
  const set = (key, value) => onFilter({ ...filters, [key]: value || undefined });
  const select = (key, label, options) => {
    const control = h(
      'select',
      { id: `plan-filter-${key}`, onChange: (e) => set(key, e.target.value) },
      h('option', { value: '' }, 'All'),
      options.map(([value, text]) => h('option', { value }, text)),
    );
    control.value = filters[key] ?? '';
    return h('div', { class: 'filter-field' }, h('label', { for: control.id }, label), control);
  };

  // Range: the 52 weeks from now (rolling), a calendar year, or 52 weeks from a chosen week.
  const rangeValue = filters.year ? `year:${filters.year}` : filters.from ? 'from' : '';
  const range = h(
    'select',
    {
      id: 'plan-filter-range',
      onChange: (e) => {
        const v = e.target.value;
        const next = { ...filters, from: undefined, year: undefined };
        if (v.startsWith('year:')) next.year = v.slice(5);
        if (v === 'from') next.from = filters.from ?? undefined;
        if (v === 'from' && !next.from) {
          // Show the week field; the range changes once a week is chosen.
          weekField.hidden = false;
          weekInput.focus();
          return;
        }
        onFilter(next);
      },
    },
    h('option', { value: '' }, 'Next 52 weeks'),
    [currentYear, currentYear + 1].map((y) => h('option', { value: `year:${y}` }, `Year ${y}`)),
    h('option', { value: 'from' }, '52 weeks from…'),
  );
  range.value = rangeValue;
  const weekInput = h('input', {
    id: 'plan-filter-from',
    type: 'week',
    value: filters.from ?? '',
    pattern: '\\d{4}-W\\d{2}',
    placeholder: '2026-W45',
    onChange: (e) => WEEK.test(e.target.value) && set('from', e.target.value),
  });
  const weekField = h(
    'div',
    { class: 'filter-field', hidden: !filters.from },
    h('label', { for: weekInput.id }, 'First week'),
    weekInput,
  );

  let searchTimer;
  const search = h('input', {
    id: 'plan-filter-q',
    type: 'search',
    value: filters.q ?? '',
    placeholder: 'Code, title, building…',
    onInput: (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => set('q', e.target.value.trim()), 350);
    },
  });

  return h(
    'div',
    { class: 'filter-bar planner-filters', role: 'search', 'aria-label': 'Planner filters' },
    h('div', { class: 'filter-field' }, h('label', { for: range.id }, 'Weeks shown'), range),
    weekField,
    h(
      'div',
      { class: 'filter-field' },
      h('span', { class: 'filter-label', id: 'plan-group-label' }, 'Group by'),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-labelledby': 'plan-group-label' },
        GROUP_BY.map((key) =>
          h(
            'button',
            {
              type: 'button',
              class: 'segmented-option',
              'aria-pressed': String((filters.group ?? 'site') === key),
              onClick: () => set('group', key === 'site' ? '' : key),
            },
            valueLabel('planning_group', key),
          ),
        ),
      ),
    ),
    select(
      'site',
      'Site',
      sites.map((s) => [s, s]),
    ),
    select(
      'category',
      'Trade',
      CATEGORIES.map((c) => [c, valueLabel('category', c)]),
    ),
    select(
      'type',
      'Type',
      PLAN_TYPES.map((t) => [t, valueLabel('work_order_type', t)]),
    ),
    select(
      'performed_by',
      'Done by',
      PERFORMERS.map((p) => [p, valueLabel('performed_by', p)]),
    ),
    h('div', { class: 'filter-field' }, h('label', { for: search.id }, 'Search'), search),
    hasPlanFilters(filters)
      ? h(
          'button',
          {
            type: 'button',
            class: 'button button-secondary',
            onClick: () =>
              onFilter({ from: filters.from, year: filters.year, group: filters.group }),
          },
          'Clear filters',
        )
      : null,
    canEdit
      ? h(
          'a',
          {
            href: planningUrl(filters, '/planning/plans/new'),
            'data-link': true,
            class: 'button button-primary online-only planner-new',
          },
          '+ New plan',
        )
      : null,
  );
}

function tilesSection(data, preview = false) {
  return h(
    'section',
    { class: 'planner-tiles', 'aria-labelledby': 'planner-tiles-heading' },
    h(
      'h2',
      { id: 'planner-tiles-heading', class: 'visually-hidden', tabindex: '-1' },
      'Key figures of the weeks shown',
    ),
    h(
      'ul',
      { class: 'kpi-grid' },
      tileViews(data.tiles, data.weeks.length).map((tile) =>
        h(
          'li',
          {},
          h(
            'div',
            {
              class: `kpi-tile planner-tile${tile.flagged ? ' is-flagged' : ''}${preview ? ' is-preview' : ''}`,
            },
            h('span', { class: 'kpi-label' }, tile.label),
            h('span', { class: 'kpi-value planner-tile-value' }, tile.value),
            h('span', { class: 'planner-tile-detail' }, tile.detail),
            tile.flagged
              ? h(
                  'span',
                  { class: 'badge badge-tone-warning kpi-flag' },
                  h('span', { 'aria-hidden': 'true' }, '⚠'),
                  'Needs balancing',
                )
              : null,
          ),
        ),
      ),
    ),
  );
}

function reserveLine(data, isAdmin) {
  const { reserve_percent: reserve, daily_hours: daily } = data.settings;
  return h(
    'p',
    { class: 'planner-reserve muted' },
    `Capacity: ${formatHours(data.capacity.weekly)} a week (${formatHours(daily)} a day per technician and supervisor), keeping a ${reserve} % reserve for breakdowns and staff requests, set by the administrators.`,
    isAdmin
      ? [' ', h('a', { href: '/admin/planning', 'data-link': true }, 'Change the settings')]
      : null,
  );
}

/** Tooltip shared by the load bars (pointer hover; the table view holds the same values). */
function loadTooltip() {
  const tip = h('div', { class: 'planner-tooltip', role: 'tooltip', hidden: true });
  return {
    element: tip,
    show(cell, lines) {
      replaceChildren(
        tip,
        lines.map((l, i) => h(i ? 'span' : 'strong', {}, l)),
      );
      tip.hidden = false;
      const box = cell.getBoundingClientRect();
      const host = tip.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
      tip.style.left = `${box.left - host.left + box.width / 2}px`;
      tip.style.top = `${box.bottom - host.top + 4}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

function loadRow(data, tooltip) {
  const scale = loadScale(data.figures);
  const capacity = data.capacity.weekly;
  return h(
    'tr',
    { class: 'load-row' },
    h(
      'th',
      { scope: 'row', class: 'plan-cell' },
      h('span', { class: 'load-title' }, 'Load'),
      h('span', { class: 'plan-meta' }, `planned vs ${formatHours(capacity)} a week`),
    ),
    data.figures.map((f) => {
      const level = f.level ?? 'NONE';
      const lines = [
        `${formatWeek(f.week)}: ${formatLoad(f.load)}`,
        `${formatHours(f.planned_hours)} planned of ${formatHours(f.capacity)}`,
        ...loadSegments(f, scale).map(
          (s) => `${valueLabel('category', s.category)}: ${formatHours(s.hours)}`,
        ),
        f.contractor_visits ? `${f.contractor_visits} contractor visit(s), not counted` : null,
      ].filter(Boolean);
      const bar = h(
        'div',
        { class: 'load-bar', 'aria-hidden': 'true' },
        loadSegments(f, scale).map((s) => {
          const seg = h('span', { class: `load-segment series-${s.slot}` });
          seg.style.height = `${s.share * 100}%`;
          return seg;
        }),
      );
      // The capacity line: 100 % of capacity on the bar's scale.
      const line = h('span', { class: 'load-capacity', 'aria-hidden': 'true' });
      line.style.bottom = `${scale ? (capacity / scale) * 100 : 0}%`;
      return h(
        'td',
        {
          class: `load-cell level-${level.toLowerCase()}`,
          onMouseenter: (e) => tooltip.show(e.currentTarget, lines),
          onMouseleave: () => tooltip.hide(),
        },
        h('div', { class: 'load-plot' }, bar, line),
        h(
          'span',
          { class: 'load-value' },
          f.level === 'OVER' ? h('span', { 'aria-hidden': 'true' }, '⚠') : null,
          formatLoad(f.load),
        ),
        h('span', { class: 'visually-hidden' }, ` ${lines.slice(1).join(', ')}`),
      );
    }),
  );
}

function headerRow(data) {
  let lastYear = null;
  return h(
    'tr',
    {},
    h('th', { scope: 'col', class: 'plan-cell' }, 'Plan'),
    data.weeks.map(({ week, monday }) => {
      const year = week.slice(0, 4);
      const showYear = year !== lastYear;
      lastYear = year;
      const isCurrent = week === data.current_week;
      const blocked = blockedText(week, data.blocked_weeks);
      return h(
        'th',
        {
          scope: 'col',
          class: `week-col${isCurrent ? ' is-current' : ''}${showYear ? ' year-start' : ''}${blocked ? ' is-blocked' : ''}`,
          title: `${formatWeek(week)}, Monday ${formatDate(monday)}${blocked ? `. Blocked: ${blocked}` : ''}`,
          'aria-current': isCurrent ? 'date' : null,
        },
        showYear ? h('span', { class: 'week-year' }, year) : null,
        h('span', { class: 'visually-hidden' }, 'Week '),
        String(weekNumber(week)),
        isCurrent ? h('span', { class: 'visually-hidden' }, ' (this week)') : null,
        blocked
          ? h(
              'span',
              { class: 'week-blocked' },
              h('span', { 'aria-hidden': 'true' }, '⛔'),
              h('span', { class: 'visually-hidden' }, ` blocked: ${blocked}`),
            )
          : null,
      );
    }),
  );
}

function planRow(plan, data, { selectedId, onOpen, canEdit }) {
  const index = new Map(data.weeks.map((w, i) => [w.week, i]));
  const cells = data.weeks.map(() => []);
  // The first visit that can move stands for the series: dragging it moves them all (spec §7).
  const seriesId = plan.occurrences.find((o) => isMovable(o, data.current_week, canEdit))?.id;
  for (const o of plan.occurrences) {
    const movable = isMovable(o, data.current_week, canEdit);
    const view = chipView(plan, o, { series: o.id === seriesId });
    cells[index.get(o.week)].push(
      h(
        'button',
        {
          type: 'button',
          class: `${view.classes}${movable ? ' is-movable' : ''}`,
          'aria-label': view.label,
          'aria-describedby': movable ? 'planner-move-help' : null,
          title: view.label,
          'aria-current': o.id === selectedId ? 'true' : null,
          dataset: {
            occurrence: o.id,
            plan: plan.id,
            ...(movable && { move: o.id === seriesId ? 'series' : 'occurrence' }),
          },
          onClick: () => onOpen(plan.id, o.id),
        },
        view.text,
      ),
    );
  }
  const warning = planWarningText(plan.warnings, data.settings);
  return h(
    'tr',
    {
      class: `plan-row${plan.performed_by === 'CONTRACTOR' ? ' is-contractor' : ''}`,
      dataset: { plan: plan.id },
    },
    h(
      'th',
      { scope: 'row', class: 'plan-cell' },
      h(
        'button',
        { type: 'button', class: 'plan-link', onClick: () => onOpen(plan.id, null) },
        h('span', { class: 'plan-code' }, plan.code),
        ' ',
        plan.title,
      ),
      h(
        'span',
        { class: 'plan-meta' },
        `${formatHours(plan.estimated_hours)} · every ${plan.frequency_weeks} wk`,
        plan.type === 'REGULATORY' ? ' · § regulatory' : null,
        plan.performed_by === 'CONTRACTOR' ? ` · ${plan.supplier ?? 'contractor'}` : null,
      ),
      warning
        ? h('span', { class: 'plan-warning' }, h('span', { 'aria-hidden': 'true' }, '⚠ '), warning)
        : null,
    ),
    cells.map((chips, i) => {
      const blocked = isBlockedFor(data.weeks[i].week, plan.site, data.blocked_weeks ?? []);
      return h(
        'td',
        {
          class: `week-cell${weekClass(data, i)}${blocked ? ' is-blocked' : ''}`,
          dataset: { index: i },
        },
        chips,
      );
    }),
  );
}

function groupRows(group, data, options) {
  return h(
    'tbody',
    {},
    h(
      'tr',
      { class: 'group-row' },
      h(
        'th',
        { scope: 'rowgroup', class: 'plan-cell' },
        groupTitle(group),
        h(
          'span',
          { class: 'plan-meta' },
          ` · ${group.plans.length} plan${group.plans.length === 1 ? '' : 's'}`,
        ),
      ),
      group.hours.map((hours, i) =>
        h(
          'td',
          { class: `group-hours${weekClass(data, i)}` },
          hours ? numberFormat.format(hours) : '',
        ),
      ),
    ),
    group.plans.map((plan) => planRow(plan, data, options)),
  );
}

function legend(canEdit) {
  const chip = (cls, text) => h('span', { class: cls, 'aria-hidden': 'true' }, text);
  return h(
    'div',
    { class: 'planner-legend' },
    h(
      'p',
      { class: 'legend-group' },
      h('span', { class: 'legend-title' }, 'Visits (hours): '),
      h('span', {}, chip('chip chip-planned', '2'), ' planned'),
      h('span', {}, chip('chip chip-released', '✓2'), ' work order created'),
      h('span', {}, chip('chip chip-skipped', '2'), ' skipped'),
      h('span', {}, chip('chip chip-planned', '§2'), ' regulatory'),
      h('span', {}, chip('chip chip-planned chip-contractor', '2'), ' contractor'),
      h('span', {}, chip('chip chip-planned chip-warning', '⚠2'), ' outside its season or blocked'),
      h('span', {}, chip('chip chip-planned chip-moved', '↔2'), ' moved'),
      canEdit
        ? h(
            'span',
            {},
            chip('chip chip-planned chip-series', '2'),
            ' first visit: moves the series',
          )
        : null,
      h('span', {}, chip('legend-blocked', '⛔'), ' blocked week'),
    ),
    h(
      'p',
      { class: 'legend-group' },
      h('span', { class: 'legend-title' }, 'Load by trade: '),
      CATEGORIES.map((c, i) =>
        h(
          'span',
          {},
          h('span', { class: `legend-swatch series-${i + 1}`, 'aria-hidden': 'true' }),
          valueLabel('category', c),
        ),
      ),
      h('span', {}, h('span', { class: 'legend-capacity', 'aria-hidden': 'true' }), 'capacity'),
    ),
  );
}

function figuresTable(data) {
  return h(
    'details',
    { class: 'chart-table planner-figures' },
    h('summary', {}, 'Show the weekly figures as a table'),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'data-table' },
        h('caption', { class: 'visually-hidden' }, 'Planned hours and capacity per week'),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ['Week', 'Planned', 'Capacity', 'Load', 'By trade', 'Contractor visits'].map((t) =>
              h('th', { scope: 'col' }, t),
            ),
          ),
        ),
        h(
          'tbody',
          {},
          data.figures.map((f) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, formatWeek(f.week)),
              h('td', { class: 'numeric' }, formatHours(f.planned_hours)),
              h('td', { class: 'numeric' }, formatHours(f.capacity)),
              h(
                'td',
                { class: 'numeric' },
                f.level === 'OVER' ? '⚠ ' : '',
                formatLoad(f.load),
                f.level === 'TIGHT' ? ' (tight)' : f.level === 'OVER' ? ' (over)' : '',
              ),
              h(
                'td',
                {},
                Object.entries(f.by_category)
                  .map(([c, hours]) => `${valueLabel('category', c)} ${formatHours(hours)}`)
                  .join(', ') || '—',
              ),
              h('td', { class: 'numeric' }, String(f.contractor_visits)),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * Renders the year planner.
 * @param {HTMLElement} container
 * @param {{ data: object, filters: object, sites: string[], canEdit: boolean, isAdmin: boolean,
 *   selectedId?: number | null, onFilter: (filters: object) => void,
 *   onOpen: (planId: number, occurrenceId: number | null) => void }} options
 */
export function renderPlanner(
  container,
  { data, filters, sites, canEdit, isAdmin, selectedId = null, history = null, onFilter, onOpen },
) {
  const tooltip = loadTooltip();
  let tiles = tilesSection(data);
  let load = loadRow(data, tooltip);
  const message = h('p', { class: 'planner-message', role: 'status' });
  const plans = data.groups.reduce((n, g) => n + g.plans.length, 0);
  const range = `${formatWeek(data.from)} to ${formatWeek(data.to)}`;
  replaceChildren(
    container,
    h(
      'div',
      { class: 'planner' },
      filterBar(filters, {
        sites,
        currentYear: Number(data.current_week.slice(0, 4)),
        canEdit,
        onFilter,
      }),
      tiles,
      reserveLine(data, isAdmin),
      legend(canEdit),
      toolbar({ filters, canEdit, history, message }),
      h(
        'div',
        { class: 'planner-scroll', tabindex: '0', 'aria-labelledby': 'planner-caption' },
        tooltip.element,
        h(
          'table',
          { class: 'planner-grid' },
          h(
            'caption',
            { id: 'planner-caption', class: 'visually-hidden' },
            `Maintenance plans, ${range}: ${plans} plan${plans === 1 ? '' : 's'}`,
          ),
          h('thead', {}, headerRow(data), load),
          data.groups.map((g) => groupRows(g, data, { selectedId, onOpen, canEdit })),
        ),
      ),
      plans
        ? null
        : h(
            'p',
            { class: 'empty-state' },
            hasPlanFilters(filters) ? 'No plan matches these filters.' : 'No maintenance plan yet.',
          ),
      figuresTable(data),
    ),
  );

  /** Swaps the tiles and the load strip for other figures (live impact), or back. */
  const show = (next, preview) => {
    const view = { ...data, ...next };
    const nextTiles = tilesSection(view, preview);
    const nextLoad = loadRow(view, tooltip);
    nextLoad.classList.toggle('is-preview', preview);
    tiles.replaceWith(nextTiles);
    load.replaceWith(nextLoad);
    tiles = nextTiles;
    load = nextLoad;
  };
  return {
    /** Ghost chips where the proposed visits would go; the visits leaving fade (Phase 20). */
    propose: (moves) => showProposal(container, data, moves),
    preview: (figures) => show(figures, true),
    reset: () => show({ figures: data.figures, tiles: data.tiles }, false),
    /** A short message under the toolbar: why a drop was refused, what was moved. */
    say: (text, tone = 'info') => {
      message.textContent = text;
      message.dataset.tone = tone;
    },
  };
}

/**
 * Shows a balancing proposal on the grid: a dashed ghost chip in the week each visit would go
 * to, the visit itself faded. A new call replaces the previous proposal.
 */
function showProposal(container, data, moves) {
  const grid = container.querySelector('.planner-grid');
  if (!grid) return;
  for (const el of grid.querySelectorAll('.chip-ghost.is-proposal')) el.remove();
  for (const el of grid.querySelectorAll('.chip.is-leaving')) el.classList.remove('is-leaving');
  const index = new Map(data.weeks.map((w, i) => [w.week, i]));
  for (const move of moves) {
    const chip = grid.querySelector(`.chip[data-occurrence="${move.occurrence_id}"]`);
    const cell = grid.querySelector(
      `tr[data-plan="${move.plan_id}"] td.week-cell[data-index="${index.get(move.to)}"]`,
    );
    if (!chip || !cell) continue;
    chip.classList.add('is-leaving');
    // A picture only: no identity of the visit, so no handler takes it for one.
    const ghost = chip.cloneNode(true);
    ghost.className = 'chip chip-ghost is-proposal';
    for (const name of Object.keys(ghost.dataset)) delete ghost.dataset[name];
    for (const name of ['id', 'title', 'aria-label', 'aria-describedby', 'aria-current']) {
      ghost.removeAttribute(name);
    }
    ghost.setAttribute('aria-hidden', 'true');
    ghost.tabIndex = -1;
    cell.append(ghost);
  }
}

/** Undo / Redo, the blocked weeks, and the hint on how to move visits. */
function toolbar({ filters, canEdit, history, message }) {
  const button = (label, entry, onClick, key) =>
    h(
      'button',
      {
        type: 'button',
        class: 'button button-secondary online-only',
        disabled: !entry,
        title: entry ? `${label}: ${entry} (${key})` : `Nothing to ${label.toLowerCase()}`,
        'aria-keyshortcuts': key.replace('Ctrl', 'Control'),
        onClick,
      },
      label,
      entry ? h('span', { class: 'visually-hidden' }, `: ${entry}`) : null,
    );
  return h(
    'div',
    { class: 'planner-toolbar' },
    canEdit && history
      ? [
          button('Undo', history.undoLabel, history.onUndo, 'Ctrl+Z'),
          button('Redo', history.redoLabel, history.onRedo, 'Ctrl+Y'),
        ]
      : null,
    h(
      'a',
      {
        href: planningUrl(filters, '/planning/blocked-weeks'),
        'data-link': true,
        class: 'button button-secondary',
      },
      'Blocked weeks',
    ),
    canEdit
      ? h(
          'a',
          {
            href: planningUrl(filters, '/planning/suggestions'),
            'data-link': true,
            class: 'button button-secondary online-only',
          },
          'Suggest a smoother plan',
        )
      : null,
    canEdit
      ? h(
          'p',
          { id: 'planner-move-help', class: 'planner-help muted' },
          'Drag a planned visit to another week, or select it and press Shift + arrow keys, then Enter (Escape cancels). The first planned visit of a row moves the whole series; Alt + Shift + arrows move the series from any visit.',
        )
      : null,
    message,
  );
}

/** Routes of the planner that show a side panel (plan or plan form). */
const PANEL_ROUTES = ['plan', 'planCreate', 'blockedWeeks', 'suggestions'];

/**
 * Opens the split view for a plan panel, or closes it (and empties the panel) on the plain
 * planner, so closing the panel or the form really hides it. Returns true when a panel shows.
 * @param {string} routeName
 * @param {HTMLElement} detailContainer
 */
export function setPlannerPanel(routeName, detailContainer) {
  const open = PANEL_ROUTES.includes(routeName);
  setSplitView(open);
  if (!open) replaceChildren(detailContainer);
  return open;
}

/** Badge of an occurrence status. */
export function occurrenceBadge(status) {
  const tone = { PLANNED: 'info', RELEASED: 'success', SKIPPED: 'neutral' }[status];
  return h(
    'span',
    { class: badgeClass('occurrence_status', status, tone) },
    valueLabel('occurrence_status', status),
  );
}
