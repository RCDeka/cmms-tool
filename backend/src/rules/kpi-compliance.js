// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Compliance KPIs of the dashboards (docs/spec-dashboards.md §6.3, Phase 23). Pure: dates
// are 'YYYY-MM-DD' and weeks ISO weeks, in APP_TIMEZONE, given by the caller.
import { addDays } from '../lib/dates.js';
import { addWeeks, mondayOf, weekOfDate } from '../lib/iso-week.js';

/** Outcomes of a visit, in display order. */
export const OUTCOMES = ['on_time', 'late', 'skipped'];

/** Sunday of an ISO week. */
export function weekSunday(week) {
  return addDays(mondayOf(week), 6);
}

/**
 * Last week a visit may be done in (§6.3): its planned week plus the plan's tolerance; a
 * regulatory visit cannot be later than its due week.
 * @param {{ type: string, tolerance_weeks: number }} plan
 * @param {{ due_week: string, week: string }} visit
 */
export function deadlineWeek(plan, visit) {
  return plan.type === 'REGULATORY' ? visit.due_week : addWeeks(visit.week, plan.tolerance_weeks);
}

/**
 * Outcome of a visit whose deadline week is over: skipped, on time (its work order closed by
 * the Sunday of the deadline week), or late (closed later, or not closed).
 * @param {{ status: string, wo_status: string | null, closed_on: string | null }} visit
 * @param {string} deadline Sunday of the deadline week
 */
export function visitOutcome(visit, deadline) {
  if (visit.status === 'SKIPPED') return 'skipped';
  return visit.wo_status === 'CLOSED' && visit.closed_on && visit.closed_on <= deadline
    ? 'on_time'
    : 'late';
}

/** On time ÷ (on time + late), or null when no visit counts. Skipped visits stay apart. */
export function complianceRate(onTime, late) {
  return onTime + late ? onTime / (onTime + late) : null;
}

/**
 * Counts of outcomes per group (trade, contractor…), with their rate.
 * @param {{ outcome: string }[]} visits
 * @param {(visit: object) => string} groupOf
 * @returns {Map<string, { on_time: number, late: number, skipped: number, rate: number | null }>}
 */
export function outcomesBy(visits, groupOf) {
  const groups = new Map();
  for (const visit of visits) {
    const key = groupOf(visit);
    const counts = groups.get(key) ?? { on_time: 0, late: 0, skipped: 0 };
    counts[visit.outcome]++;
    groups.set(key, counts);
  }
  for (const counts of groups.values()) counts.rate = complianceRate(counts.on_time, counts.late);
  return groups;
}

/** ISO weeks whose Sunday falls in [from, to], oldest first. */
export function weeksEndingBetween(from, to) {
  const weeks = [];
  let week = weekOfDate(from);
  if (weekSunday(week) < from) week = addWeeks(week, 1);
  while (weekSunday(week) <= to) {
    weeks.push(week);
    week = addWeeks(week, 1);
  }
  return weeks;
}
