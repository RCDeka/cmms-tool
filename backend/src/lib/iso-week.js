// ISO weeks (Monday to Sunday), written 'YYYY-Www' (docs/spec-preventive-maintenance.md §2).
// A week is handled through its Monday ('YYYY-MM-DD'), so adding weeks is adding 7 days.
import { addDays } from './dates.js';

export const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;

const DAY_MS = 86_400_000;

/** Day of the week of a date, Monday = 1 … Sunday = 7. */
function isoWeekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

/** Number of ISO weeks in a year: 53 when 1 January is a Thursday, or a Wednesday in a leap year. */
export function weeksInYear(year) {
  const jan1 = isoWeekday(`${year}-01-01`);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}

/** True for a well-formed week that exists ('2026-W53' does, '2027-W53' does not). */
export function isWeek(value) {
  const match = typeof value === 'string' && WEEK_PATTERN.exec(value);
  if (!match) return false;
  const n = Number(match[2]);
  return n >= 1 && n <= weeksInYear(Number(match[1]));
}

/** ISO week of a date 'YYYY-MM-DD'. */
export function weekOfDate(date) {
  // The week belongs to the year of its Thursday.
  const thursday = addDays(date, 4 - isoWeekday(date));
  const year = Number(thursday.slice(0, 4));
  const dayOfYear = Math.round(
    (Date.parse(`${thursday}T00:00:00Z`) - Date.UTC(year, 0, 1)) / DAY_MS,
  );
  return formatWeek(year, Math.floor(dayOfYear / 7) + 1);
}

/** 'YYYY-Www' from a year and a week number. */
export function formatWeek(year, week) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Year and week number of a week. */
export function weekParts(week) {
  const [, year, n] = WEEK_PATTERN.exec(week);
  return { year: Number(year), week: Number(n) };
}

/** Monday of a week, 'YYYY-MM-DD'. */
export function mondayOf(week) {
  const { year, week: n } = weekParts(week);
  // 4 January is always in week 1.
  const jan4 = `${year}-01-04`;
  return addDays(jan4, 1 - isoWeekday(jan4) + (n - 1) * 7);
}

/** Week `n` weeks after (or before, when negative) a week. */
export function addWeeks(week, n) {
  return weekOfDate(addDays(mondayOf(week), n * 7));
}

/** Number of weeks from `a` to `b` (negative when b is earlier). */
export function weeksBetween(a, b) {
  return Math.round(
    (Date.parse(`${mondayOf(b)}T00:00:00Z`) - Date.parse(`${mondayOf(a)}T00:00:00Z`)) /
      (7 * DAY_MS),
  );
}

/** `count` consecutive weeks starting at `from`. */
export function weekRange(from, count) {
  const monday = mondayOf(from);
  return Array.from({ length: count }, (_, i) => weekOfDate(addDays(monday, i * 7)));
}
