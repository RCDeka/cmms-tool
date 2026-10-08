// ISO weeks (Monday to Sunday), written 'YYYY-Www' (docs/spec-preventive-maintenance.md §2).
// Weeks are computed on UTC midnight times, never on date strings (D56).

export const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// Weeks are computed on UTC times (midnight of a day), never on date strings: the series of a
// plan walks hundreds of weeks on every planner load (D56).

/** UTC time of a date 'YYYY-MM-DD' at midnight. */
const timeOf = (date) =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** Day of the week of a UTC midnight time, Monday = 1 … Sunday = 7. */
const weekdayOf = (time) => new Date(time).getUTCDay() || 7;

/** ISO week of a UTC midnight time: the week belongs to the year of its Thursday. */
function weekOfTime(time) {
  const thursday = time + (4 - weekdayOf(time)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  return formatWeek(year, Math.floor((thursday - Date.UTC(year, 0, 1)) / WEEK_MS) + 1);
}

/** UTC time of the Monday of a week. */
function mondayTime(week) {
  const year = Number(week.slice(0, 4));
  const n = Number(week.slice(6));
  // 4 January is always in week 1.
  const jan4 = Date.UTC(year, 0, 4);
  return jan4 + (1 - weekdayOf(jan4) + (n - 1) * 7) * DAY_MS;
}

/** Number of ISO weeks in a year: 53 when 1 January is a Thursday, or a Wednesday in a leap year. */
export function weeksInYear(year) {
  const jan1 = weekdayOf(Date.UTC(year, 0, 1));
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
  return weekOfTime(timeOf(date));
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
  return new Date(mondayTime(week)).toISOString().slice(0, 10);
}

/** Week `n` weeks after (or before, when negative) a week. */
export function addWeeks(week, n) {
  return weekOfTime(mondayTime(week) + n * WEEK_MS);
}

/** Number of weeks from `a` to `b` (negative when b is earlier). */
export function weeksBetween(a, b) {
  return Math.round((mondayTime(b) - mondayTime(a)) / WEEK_MS);
}

/** `count` consecutive weeks starting at `from`. */
export function weekRange(from, count) {
  const monday = mondayTime(from);
  return Array.from({ length: count }, (_, i) => weekOfTime(monday + i * WEEK_MS));
}
