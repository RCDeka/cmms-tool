// Work order creation rules that need no database (docs/data-model.md → BR-W9, BR-W10).
import { dateInZone } from '../lib/dates.js';

/** How far in the past a queued offline creation may date from. */
export const MAX_CREATION_AGE_DAYS = 30;
/** Tolerance for clocks slightly ahead of the server. */
export const FUTURE_TOLERANCE_MS = 60_000;

/**
 * `created_on` from the moment the user created the work order (BR-W9): the date of
 * `editedAt` in the app time zone. Rejects times in the future or too old.
 * @param {string | undefined} editedAt ISO datetime sent by the client
 * @param {Date} now
 * @param {string} timeZone
 * @returns {{ date: string } | { error: { rule: string, message: string } }}
 */
export function creationDate(editedAt, now, timeZone) {
  const at = editedAt ? new Date(editedAt) : now;
  if (at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { error: { rule: 'BR-W9', message: 'The creation time is in the future.' } };
  }
  if (now.getTime() - at.getTime() > MAX_CREATION_AGE_DAYS * 86_400_000) {
    return {
      error: {
        rule: 'BR-W9',
        message: `The creation time is more than ${MAX_CREATION_AGE_DAYS} days old.`,
      },
    };
  }
  return { date: dateInZone(timeZone, at) };
}

/**
 * Next work order number of a year (BR-W10): `WO-YYYY-NNNNN`, restarting at 00001.
 * @param {string} year 'YYYY'
 * @param {string | null} highest highest existing number of that year, or null
 */
export function nextWorkOrderNumber(year, highest) {
  const last = highest ? Number(highest.slice(-5)) : 0;
  return `WO-${year}-${String(last + 1).padStart(5, '0')}`;
}
