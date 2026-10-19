// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Date helpers. Datetimes are ISO 8601 UTC strings; dates are 'YYYY-MM-DD' (D13).

/** Current datetime as ISO 8601 UTC with milliseconds. */
export function nowIso(now = new Date()) {
  return now.toISOString();
}

/**
 * Calendar date ('YYYY-MM-DD') of an instant in the given IANA time zone.
 * @param {string} timeZone
 * @param {Date} [instant]
 */
export function dateInZone(timeZone, instant = new Date()) {
  return formatterFor(timeZone).format(instant);
}

/** One formatter per time zone: building one costs far more than using it (dashboards). */
const formatters = new Map();
function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    // en-CA formats as YYYY-MM-DD.
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  }
  return formatters.get(timeZone);
}

/**
 * Adds (or subtracts) whole days to a 'YYYY-MM-DD' date.
 * @param {string} date
 * @param {number} days
 */
export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday of a 'YYYY-MM-DD' date: 1 Monday … 7 Sunday. */
export function isoWeekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

/** One formatter per time zone giving the wall-clock parts of an instant. */
const partFormatters = new Map();
function partsIn(timeZone, instant) {
  if (!partFormatters.has(timeZone)) {
    partFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }
  const parts = Object.fromEntries(
    partFormatters
      .get(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * The instant at which the wall clock of `timeZone` shows `time` ('HH:MM') on `date`
 * ('YYYY-MM-DD'). A time skipped by a daylight saving change gives the instant just after it.
 * @returns {Date}
 */
export function zonedTime(date, time, timeZone) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  // The offset at a first guess, then at the result (they differ near a change).
  let instant = wanted - (partsIn(timeZone, new Date(wanted)) - wanted);
  instant = wanted - (partsIn(timeZone, new Date(instant)) - instant);
  return new Date(instant);
}
