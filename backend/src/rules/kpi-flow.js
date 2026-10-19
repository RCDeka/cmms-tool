// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Flow and backlog KPIs of the dashboards (docs/spec-dashboards.md §6.2, Phase 22). Pure:
// "today" and the dates are given in APP_TIMEZONE by the caller.
import { addDays } from '../lib/dates.js';
import { mondayOf, weekOfDate } from '../lib/iso-week.js';

/** Periods up to this many days are counted per ISO week; longer ones per calendar month. */
const WEEKLY_UP_TO = 90;

/** First day of a period of `days` days ending today (today included). */
export function periodStart(today, days) {
  return addDays(today, -(days - 1));
}

/** Last day of the calendar month of a date. */
function monthEnd(date) {
  const [y, m] = date.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return addDays(next, -1);
}

/**
 * Buckets of a period: ISO weeks (periods of up to 90 days) or calendar months, oldest first,
 * cut to the period (the first and last ones may be partial: `partial`).
 * @param {string} today 'YYYY-MM-DD'
 * @param {number} days
 * @returns {{ unit: 'week' | 'month', buckets: { key: string, from: string, to: string,
 *   partial: boolean }[] }}
 */
export function periodBuckets(today, days) {
  const start = periodStart(today, days);
  const unit = days <= WEEKLY_UP_TO ? 'week' : 'month';
  const buckets = [];
  let cursor = start;
  while (cursor <= today) {
    const key = unit === 'week' ? weekOfDate(cursor) : cursor.slice(0, 7);
    const first = unit === 'week' ? mondayOf(key) : `${key}-01`;
    const last = unit === 'week' ? addDays(first, 6) : monthEnd(first);
    const from = first < start ? start : first;
    const to = last > today ? today : last;
    buckets.push({ key, from, to, partial: from !== first || to !== last });
    cursor = addDays(last, 1);
  }
  return { unit, buckets };
}

/** Key of the bucket holding a date, or null outside the period. */
export function bucketOf(buckets, date) {
  return buckets.find((b) => date >= b.from && date <= b.to)?.key ?? null;
}

/**
 * Opened vs done (§6.2, D86): per bucket, work orders created, technically done (`closed`,
 * by `completed_on`, closed or not) and cancelled, and those still unfinished at the end of
 * the bucket.
 * @param {{ id: number, created_on: string, status: string, completed_on: string | null }[]} workOrders
 * @param {Map<number, string>} cancelledOn date each cancelled work order was cancelled
 * @param {ReturnType<typeof periodBuckets>['buckets']} buckets
 */
export function flowSeries(workOrders, cancelledOn, buckets) {
  const isDone = (wo) => wo.status === 'COMPLETED' || wo.status === 'CLOSED';
  const finishedOn = (wo) =>
    isDone(wo)
      ? wo.completed_on
      : wo.status === 'CANCELLED'
        ? (cancelledOn.get(wo.id) ?? null)
        : null;
  return buckets.map((b) => {
    const within = (date) => date !== null && date >= b.from && date <= b.to;
    let opened = 0;
    let closed = 0;
    let cancelled = 0;
    let unfinished = 0;
    for (const wo of workOrders) {
      if (within(wo.created_on)) opened++;
      if (isDone(wo) && within(wo.completed_on)) closed++;
      if (wo.status === 'CANCELLED' && within(cancelledOn.get(wo.id) ?? null)) cancelled++;
      const finished = finishedOn(wo);
      if (wo.created_on <= b.to && (finished === null || finished > b.to)) unfinished++;
    }
    return { ...b, opened, closed, cancelled, unfinished };
  });
}

/** Age buckets of the backlog, in days since creation (§6.2). */
export const AGE_BUCKETS = [
  { key: '0-7', min: 0, max: 7 },
  { key: '8-30', min: 8, max: 30 },
  { key: '31-90', min: 31, max: 90 },
  { key: '91+', min: 91, max: null },
];
/** Buckets where urgent and high-priority work needs attention. */
export const OLD_AGE_BUCKETS = ['31-90', '91+'];

/** Range of `created_on` dates of an age bucket: { from?, to } ('YYYY-MM-DD'). */
export function ageDates(bucket, today) {
  const { min, max } = AGE_BUCKETS.find((b) => b.key === bucket);
  return { from: max === null ? null : addDays(today, -max), to: addDays(today, -min) };
}

/** Hours left on a work order: its estimate minus the hours already worked, never below 0. */
export function hoursLeft(estimated, worked) {
  return Math.max(0, estimated - (worked ?? 0));
}

/** Weeks of work for a trade, or null without capacity. */
export function weeksOfWork(hours, capacity) {
  return capacity > 0 ? hours / capacity : null;
}

/** Kinds of closed work (§6.2), in stack order. */
export const WORK_GROUPS = ['PLANNED', 'REACTIVE', 'REQUESTS', 'IMPROVEMENT'];

/** Kind of a work order: planned, reactive, staff request or improvement. */
export function workGroup({ type, review_status: reviewStatus }) {
  if (type === 'PREVENTIVE' || type === 'REGULATORY') return 'PLANNED';
  if (type === 'IMPROVEMENT') return 'IMPROVEMENT';
  return reviewStatus ? 'REQUESTS' : 'REACTIVE';
}

/** SQL condition of a kind of work (constant text, on the alias `w`). */
export const WORK_GROUP_SQL = {
  PLANNED: "w.type IN ('PREVENTIVE', 'REGULATORY')",
  REACTIVE: "w.type = 'CORRECTIVE' AND w.review_status IS NULL",
  REQUESTS: "w.type = 'CORRECTIVE' AND w.review_status IS NOT NULL",
  IMPROVEMENT: "w.type = 'IMPROVEMENT'",
};
