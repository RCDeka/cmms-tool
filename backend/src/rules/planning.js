// Preventive maintenance rules that need no database: occurrence series, warnings and the
// year planner figures (docs/data-model.md → Preventive maintenance, BR-P1 to BR-Y4).
import { addWeeks, weekParts, weeksBetween } from '../lib/iso-week.js';

/** Working days counted in a week's capacity (Monday to Friday; open weekends come later). */
export const WORKING_DAYS = 5;
/** Load above which a week is tight, and above which it is over capacity (BR-Y3). */
export const TIGHT_LOAD = 0.85;
/** Capacity of people without a specialty (P17). */
export const GENERAL = 'GENERAL';

/** Default tolerance of a plan: a quarter of its period, at most 8 weeks. */
export function defaultTolerance(frequencyWeeks) {
  return Math.min(8, Math.floor(frequencyWeeks / 4));
}

/**
 * Weeks of a plan's series between `from` and `to` (both included): `anchor + k × frequency`,
 * k ≥ 0, never after `end_week` (BR-P1).
 * @param {{ anchor_week: string, frequency_weeks: number, end_week?: string | null }} plan
 * @param {string} from
 * @param {string} to
 * @returns {string[]}
 */
export function seriesWeeks(plan, from, to) {
  const last = plan.end_week && plan.end_week < to ? plan.end_week : to;
  const offset = weeksBetween(plan.anchor_week, from);
  // First k whose week is not before `from` (k ≥ 0).
  let k = Math.max(0, Math.ceil(offset / plan.frequency_weeks));
  const weeks = [];
  for (;;) {
    const week = addWeeks(plan.anchor_week, k * plan.frequency_weeks);
    if (week > last) return weeks;
    weeks.push(week);
    k += 1;
  }
}

/** True when a week is one of the series' weeks (BR-P1). */
export function isSeriesWeek(plan, week) {
  const offset = weeksBetween(plan.anchor_week, week);
  return (
    offset >= 0 && offset % plan.frequency_weeks === 0 && (!plan.end_week || week <= plan.end_week)
  );
}

/**
 * Weeks a series moved from one anchor to another shifts by; 0 when the frequency changed too
 * (the series is then rebuilt rather than shifted).
 */
export function seriesShift(before, after) {
  return before.frequency_weeks === after.frequency_weeks
    ? weeksBetween(before.anchor_week, after.anchor_week)
    : 0;
}

/**
 * True when a week is inside the plan's season (week numbers, the range may wrap over the
 * new year, e.g. 45 → 10). A plan without a season accepts every week.
 */
export function inSeason(week, seasonFrom, seasonTo) {
  if (!seasonFrom || !seasonTo) return true;
  const n = weekParts(week).week;
  return seasonFrom <= seasonTo
    ? n >= seasonFrom && n <= seasonTo
    : n >= seasonFrom || n <= seasonTo;
}

/** Plan warnings (BR-P8): a visit longer than the longest block will be split. */
export function planWarnings(plan, settings) {
  return plan.estimated_hours > settings.max_block_hours ? ['LONG_VISIT'] : [];
}

/**
 * True when a week is blocked for a site: by an entry for that site or for every site.
 * @param {string} week
 * @param {string} site
 * @param {{ week: string, site: string | null }[]} blockedWeeks
 */
export function isBlocked(week, site, blockedWeeks) {
  return blockedWeeks.some((b) => b.week === week && (b.site === null || b.site === site));
}

/** Occurrence warnings (BR-P8): outside the plan's season, in a blocked week. */
export function occurrenceWarnings(plan, week, blockedWeeks = []) {
  const warnings = [];
  if (!inSeason(week, plan.season_from_week, plan.season_to_week)) warnings.push('OUT_OF_SEASON');
  if (isBlocked(week, plan.site, blockedWeeks)) warnings.push('BLOCKED_WEEK');
  return warnings;
}

/**
 * Weeks one occurrence may move to (BR-P3): its due week ± the plan's tolerance, only earlier
 * for a regulatory plan (its due week is a legal deadline), never before the current week.
 * @returns {{ from: string, to: string }} inclusive; `from > to` when nothing is allowed
 */
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

/** 'week 43' for messages. */
const weekWords = (week) => `week ${weekParts(week).week}`;

/**
 * Why an occurrence cannot move to `week`, or null when it can (BR-P3, BR-P4, BR-P7).
 * @returns {{ rule: string, message: string } | null}
 */
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
    return {
      rule: 'BR-P3',
      message: `${weekWords(week)[0].toUpperCase()}${weekWords(week).slice(1)} is outside this visit's tolerance of ± ${plan.tolerance_weeks} week${plan.tolerance_weeks === 1 ? '' : 's'} around ${weekWords(occurrence.due_week)}.`,
    };
  }
  return null;
}

/**
 * Why the work order of a released visit cannot be planned in `week`, or null (BR-P4, D55):
 * a visit always has a week, and a regulatory visit cannot go past its due week (its legal
 * deadline). The tolerance does not apply: the work order is what is really done.
 * @param {{ type: string }} plan
 * @param {{ due_week: string }} occurrence
 * @param {string | null} week
 * @returns {{ rule: string, message: string } | null}
 */
export function releasedWeekBlocker(plan, occurrence, week) {
  if (week === null) {
    return { rule: 'BR-P4', message: 'A maintenance visit always has a planned week.' };
  }
  if (plan.type === 'REGULATORY' && week > occurrence.due_week) {
    return {
      rule: 'BR-P3',
      message: `A regulatory visit can only move earlier: ${weekWords(occurrence.due_week)} is its deadline.`,
    };
  }
  return null;
}

/**
 * Weekly capacity (BR-Y2, P16, P17): every active technician and supervisor works
 * `daily_hours` on each working day, minus the corrective reserve. Counted per trade
 * (`specialty`, GENERAL without one) and per site.
 * @param {{ specialty: string | null, site: string | null }[]} people
 * @param {{ daily_hours: number, reserve_percent: number }} settings
 */
export function weeklyCapacity(people, settings) {
  const each = settings.daily_hours * WORKING_DAYS * (1 - settings.reserve_percent / 100);
  const byCategory = {};
  const bySite = {};
  for (const p of people) {
    const trade = p.specialty ?? GENERAL;
    byCategory[trade] = (byCategory[trade] ?? 0) + each;
    if (p.site) bySite[p.site] = (bySite[p.site] ?? 0) + each;
  }
  return { total: each * people.length, by_category: byCategory, by_site: bySite };
}

/** Load level of a week (BR-Y3): null without capacity. */
export function loadLevel(load) {
  if (load === null) return null;
  if (load > 1) return 'OVER';
  return load >= TIGHT_LOAD ? 'TIGHT' : 'OK';
}

const ratio = (planned, capacity) => (capacity > 0 ? planned / capacity : null);
const add = (map, key, value) => {
  map[key] = (map[key] ?? 0) + value;
};

/**
 * Figures of each week (BR-Y1 to BR-Y4). Internal occurrences count their plan's hours in the
 * load, per trade and per site; contractor visits are only counted. Skipped ones count nothing.
 * @param {string[]} weeks
 * @param {{ week: string, status: string, estimated_hours: number, category: string,
 *   site: string, performed_by: string }[]} occurrences
 * @param {ReturnType<typeof weeklyCapacity>} capacity
 */
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

/**
 * Year planner tiles for the weeks shown (spec §7): weekly workload, trade balance, peak week,
 * site spread and contractor visits.
 * @param {ReturnType<typeof weeklyFigures>} figures
 * @param {ReturnType<typeof weeklyCapacity>} capacity
 * @param {string[]} categories trades in display order
 */
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
 * Week a released work order is due (spec §4): its Friday, or today when the release is late.
 * @param {string} fridayOfWeek 'YYYY-MM-DD'
 * @param {string} today 'YYYY-MM-DD'
 */
export function releaseDueDate(fridayOfWeek, today) {
  return fridayOfWeek < today ? today : fridayOfWeek;
}

/**
 * Next series anchor of a FLOATING plan when a visit is closed (BR-P5): the closing week plus
 * the frequency. FIXED plans keep their calendar (null).
 */
export function floatingAnchor(plan, closedWeek) {
  return plan.schedule_mode === 'FLOATING' ? addWeeks(closedWeek, plan.frequency_weeks) : null;
}

/**
 * Next automatic plan code: PM- followed by the next number, at least 4 digits.
 * @param {number | null} highest highest number among existing PM-<digits> codes
 */
export function nextPlanCode(highest) {
  return `PM-${String((highest ?? 0) + 1).padStart(4, '0')}`;
}

/**
 * Checks a plan as it will be stored, across fields. Returns `{ field: message }`, empty when
 * the plan is consistent.
 */
export function planProblems(plan) {
  const problems = {};
  if (plan.end_week && plan.end_week < plan.anchor_week) {
    problems.end_week = 'The end week cannot be before the first visit.';
  }
  if (((plan.season_from_week ?? null) === null) !== ((plan.season_to_week ?? null) === null)) {
    const message = 'Give both ends of the season, or neither.';
    problems[plan.season_from_week ? 'season_to_week' : 'season_from_week'] = message;
  }
  if (plan.performed_by === 'CONTRACTOR' && !plan.supplier) {
    problems.supplier = 'Name the contractor who performs the visits.';
  }
  return problems;
}
