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
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
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
