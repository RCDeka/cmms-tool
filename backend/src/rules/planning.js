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

/** Occurrence warnings (BR-P8): outside the plan's season. */
export function occurrenceWarnings(plan, week) {
  return inSeason(week, plan.season_from_week, plan.season_to_week) ? [] : ['OUT_OF_SEASON'];
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
