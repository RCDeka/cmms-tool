// Copies of the backend planning rules (backend/src/rules/planning.js, lib/iso-week.js) used
// by the year planner while a visit is dragged: which weeks are allowed (BR-P3) and the
// figures as if it were dropped (BR-Y1 to BR-Y4, live impact). The server still decides;
// test/planning-rules.test.js keeps both copies in step.

const DAY_MS = 86_400_000;
const WEEK = /^(\d{4})-W(\d{2})$/;
export const TIGHT_LOAD = 0.85;
export const GENERAL = 'GENERAL';

const WEEK_MS = 7 * DAY_MS;
// Weeks are computed on UTC times, never on date strings: a drag recomputes many series.
const weekdayOf = (time) => new Date(time).getUTCDay() || 7;
const timeOf = (date) =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
function weekOfTime(time) {
  const thursday = time + (4 - weekdayOf(time)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const n = Math.floor((thursday - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;
  return `${year}-W${String(n).padStart(2, '0')}`;
}
function mondayTime(week) {
  const [, year, n] = WEEK.exec(week);
  const jan4 = Date.UTC(Number(year), 0, 4);
  return jan4 + (1 - weekdayOf(jan4) + (Number(n) - 1) * 7) * DAY_MS;
}

/** ISO week of a date 'YYYY-MM-DD'. */
export const weekOfDate = (date) => weekOfTime(timeOf(date));

/** Monday of a week. */
export const mondayOf = (week) => new Date(mondayTime(week)).toISOString().slice(0, 10);

export const addWeeks = (week, n) => weekOfTime(mondayTime(week) + n * WEEK_MS);

export const weeksBetween = (a, b) => Math.round((mondayTime(b) - mondayTime(a)) / WEEK_MS);

/** Week number of a week ('2026-W43' → 43). */
export const weekNumber = (week) => Number(WEEK.exec(week)[2]);

export function inSeason(week, from, to) {
  if (!from || !to) return true;
  const n = weekNumber(week);
  return from <= to ? n >= from && n <= to : n >= from || n <= to;
}

export function isBlocked(week, site, blockedWeeks) {
  return blockedWeeks.some((b) => b.week === week && (b.site === null || b.site === site));
}

export function occurrenceWarnings(plan, week, blockedWeeks = []) {
  const warnings = [];
  if (!inSeason(week, plan.season_from_week, plan.season_to_week)) warnings.push('OUT_OF_SEASON');
  if (isBlocked(week, plan.site, blockedWeeks)) warnings.push('BLOCKED_WEEK');
  return warnings;
}

export function isSeriesWeek(plan, week) {
  const offset = weeksBetween(plan.anchor_week, week);
  return (
    offset >= 0 && offset % plan.frequency_weeks === 0 && (!plan.end_week || week <= plan.end_week)
  );
}

export function allowedWeeks(plan, occurrence, currentWeek) {
  const earliest = addWeeks(occurrence.due_week, -plan.tolerance_weeks);
  return {
    from: earliest < currentWeek ? currentWeek : earliest,
    to:
      plan.type === 'REGULATORY'
        ? occurrence.due_week
        : addWeeks(occurrence.due_week, plan.tolerance_weeks),
  };
}

const weekWords = (week) => `week ${weekNumber(week)}`;

/** Why a visit cannot move to `week` (same messages as the server), or null. */
export function moveBlocker(plan, occurrence, week, currentWeek) {
  if (occurrence.status === 'RELEASED') {
    return {
      rule: 'BR-P4',
      message: 'This visit already has its work order: change the work order instead of the visit.',
    };
  }
  if (occurrence.status === 'SKIPPED') {
    return { rule: 'BR-P7', message: 'This visit is skipped: restore it first.' };
  }
  if (week < currentWeek) {
    return { rule: 'BR-P3', message: 'A visit cannot be moved into the past.' };
  }
  const { from, to } = allowedWeeks(plan, occurrence, currentWeek);
  if (plan.type === 'REGULATORY' && week > occurrence.due_week) {
    return {
      rule: 'BR-P3',
      message: `A regulatory visit can only move earlier: ${weekWords(occurrence.due_week)} is its deadline.`,
    };
  }
  if (week < from || week > to) {
    const w = weekWords(week);
    return {
      rule: 'BR-P3',
      message: `${w[0].toUpperCase()}${w.slice(1)} is outside this visit's tolerance of ± ${plan.tolerance_weeks} week${plan.tolerance_weeks === 1 ? '' : 's'} around ${weekWords(occurrence.due_week)}.`,
    };
  }
  return null;
}

/** Why the series cannot start its visits in `week`, or null (only the past is refused). */
export function seriesBlocker(week, currentWeek) {
  return week < currentWeek
    ? { rule: 'BR-P2', message: 'The series cannot be moved into the past.' }
    : null;
}

export function loadLevel(load) {
  if (load === null) return null;
  if (load > 1) return 'OVER';
  return load >= TIGHT_LOAD ? 'TIGHT' : 'OK';
}

const ratio = (planned, capacity) => (capacity > 0 ? planned / capacity : null);
const add = (map, key, value) => {
  map[key] = (map[key] ?? 0) + value;
};

/** Same as the server's weeklyFigures (BR-Y1 to BR-Y4). */
export function weeklyFigures(weeks, occurrences, capacity) {
  const byWeek = new Map(
    weeks.map((week) => [
      week,
      { week, planned_hours: 0, by_category: {}, by_site: {}, contractor_visits: 0 },
    ]),
  );
  for (const o of occurrences) {
    const figure = byWeek.get(o.week);
    if (!figure || o.status === 'SKIPPED') continue;
    if (o.performed_by === 'CONTRACTOR') {
      figure.contractor_visits += 1;
      continue;
    }
    figure.planned_hours += o.estimated_hours;
    add(figure.by_category, o.category, o.estimated_hours);
    add(figure.by_site, o.site, o.estimated_hours);
  }
  return [...byWeek.values()].map((f) => {
    const load = ratio(f.planned_hours, capacity.total);
    return {
      ...f,
      capacity: capacity.total,
      load,
      level: loadLevel(load),
      sites_visited: Object.keys(f.by_site).length,
    };
  });
}

const average = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

/** Same as the server's planningTiles. */
export function planningTiles(figures, capacity, categories) {
  const loads = figures.filter((f) => f.load !== null);
  const peak = loads.reduce((worst, f) => (worst && worst.load >= f.load ? worst : f), null);
  const planned = {};
  for (const f of figures)
    for (const [c, hours] of Object.entries(f.by_category)) add(planned, c, hours);
  const trades = [...categories, GENERAL].filter(
    (c) => planned[c] > 0 || capacity.by_category[c] > 0,
  );
  const contractorPeak = figures.reduce(
    (best, f) => (best && best.contractor_visits >= f.contractor_visits ? best : f),
    null,
  );
  return {
    workload: {
      average_load: average(loads.map((f) => f.load)),
      peak_load: peak?.load ?? null,
      weeks_over: figures.filter((f) => f.level === 'OVER').length,
      weeks_tight: figures.filter((f) => f.level === 'TIGHT').length,
    },
    trade_balance: trades.map((category) => {
      const plannedHours = planned[category] ?? 0;
      const capacityHours = (capacity.by_category[category] ?? 0) * figures.length;
      return {
        category,
        planned_hours: plannedHours,
        capacity_hours: capacityHours,
        load: ratio(plannedHours, capacityHours),
      };
    }),
    peak_week: peak
      ? {
          week: peak.week,
          load: peak.load,
          planned_hours: peak.planned_hours,
          capacity: peak.capacity,
          excess_hours: Math.max(0, peak.planned_hours - peak.capacity),
        }
      : null,
    site_spread: {
      average: average(figures.map((f) => f.sites_visited)),
      peak: Math.max(0, ...figures.map((f) => f.sites_visited)),
    },
    contractor_visits: {
      total: figures.reduce((sum, f) => sum + f.contractor_visits, 0),
      peak: contractorPeak?.contractor_visits ?? 0,
      peak_week: contractorPeak?.contractor_visits ? contractorPeak.week : null,
    },
  };
}

/**
 * Weeks of a plan's visits as if a move were applied, within the weeks shown (live impact).
 * `move`: { kind: 'occurrence', id, week } or { kind: 'series', anchor }. A series move
 * replaces the planned visits never moved, carries the moved ones by the same shift and drops
 * those leaving the series; a visit with a work order (or skipped) keeps its week and holds
 * its shifted slot (BR-P2, D51).
 * @returns {{ id: number | null, week: string, due_week: string, status: string }[]}
 */
export function previewPlanVisits(plan, move, { weeks, currentWeek }) {
  if (move.kind === 'occurrence') {
    return plan.occurrences.map((o) => (o.id === move.id ? { ...o, week: move.week } : o));
  }
  const after = { ...plan, anchor_week: move.anchor };
  const shift = weeksBetween(plan.anchor_week, move.anchor);
  const kept = [];
  for (const o of plan.occurrences) {
    if (o.status !== 'PLANNED') {
      const due = addWeeks(o.due_week, shift);
      kept.push(due >= currentWeek ? { ...o, due_week: due } : o);
    } else if (o.week !== o.due_week) {
      const due = addWeeks(o.due_week, shift);
      const week = addWeeks(o.week, shift);
      if (isSeriesWeek(after, due) && week >= currentWeek) kept.push({ ...o, due_week: due, week });
    }
  }
  const taken = new Set(kept.map((o) => o.due_week));
  for (const week of weeks) {
    if (week >= currentWeek && isSeriesWeek(after, week) && !taken.has(week)) {
      kept.push({ id: null, week, due_week: week, status: 'PLANNED' });
    }
  }
  return kept.sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Figures and tiles of the timeline with each plan's visits as `visitsOf(plan)` gives them.
 * @param {object} data timeline response
 */
function figuresWith(data, visitsOf, categories) {
  const occurrences = data.groups.flatMap((group) =>
    group.plans.flatMap((plan) =>
      visitsOf(plan).map((o) => ({
        week: o.week,
        status: o.status,
        estimated_hours: plan.estimated_hours,
        category: plan.category,
        site: plan.site,
        performed_by: plan.performed_by,
      })),
    ),
  );
  const capacity = { total: data.capacity.weekly, by_category: data.capacity.by_category };
  const figures = weeklyFigures(
    data.weeks.map((w) => w.week),
    occurrences,
    capacity,
  );
  return { figures, tiles: planningTiles(figures, capacity, categories) };
}

/**
 * Figures and tiles of the timeline as if `move` were applied to `planId` (live impact).
 * @param {object} data timeline response
 */
export function previewFigures(data, planId, move, categories) {
  const weeks = data.weeks.map((w) => w.week);
  return figuresWith(
    data,
    (plan) =>
      plan.id === planId
        ? previewPlanVisits(plan, move, { weeks, currentWeek: data.current_week })
        : plan.occurrences,
    categories,
  );
}

/**
 * Figures and tiles of the timeline with some visits in other weeks: the balancing proposal,
 * or the part of it the user keeps (Phase 20).
 * @param {object} data timeline response
 * @param {{ occurrence_id: number, to: string }[]} moves
 */
export function previewMoves(data, moves, categories) {
  const weekOf = new Map(moves.map((m) => [m.occurrence_id, m.to]));
  return figuresWith(
    data,
    (plan) => plan.occurrences.map((o) => ({ ...o, week: weekOf.get(o.id) ?? o.week })),
    categories,
  );
}
