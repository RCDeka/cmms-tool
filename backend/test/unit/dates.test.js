// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { addDays, dateInZone, isoWeekday, zonedTime } from '../../src/lib/dates.js';

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-04', 0)).toBe('2026-10-04');
  });
});

describe('dateInZone', () => {
  it('returns the calendar date in the given time zone', () => {
    const lateEveningUtc = new Date('2026-10-04T22:30:00Z');
    expect(dateInZone('UTC', lateEveningUtc)).toBe('2026-10-04');
    // Paris is UTC+2 in October: already the next day.
    expect(dateInZone('Europe/Paris', lateEveningUtc)).toBe('2026-10-05');
  });
});

describe('isoWeekday', () => {
  it('numbers Monday 1 to Sunday 7', () => {
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-04')).toBe(7);
  });
});

describe('zonedTime', () => {
  it('gives the instant of a wall-clock time in the zone, on both sides of a change', () => {
    expect(zonedTime('2026-10-05', '08:00', 'Europe/Paris').toISOString()).toBe(
      '2026-10-05T06:00:00.000Z',
    );
    // 25 October 2026: back to UTC+1.
    expect(zonedTime('2026-10-26', '08:00', 'Europe/Paris').toISOString()).toBe(
      '2026-10-26T07:00:00.000Z',
    );
    expect(zonedTime('2026-10-05', '08:00', 'UTC').toISOString()).toBe('2026-10-05T08:00:00.000Z');
  });

  it('gives the instant just after a time skipped by the spring change', () => {
    // 29 March 2026, 02:30 does not exist in Paris: 03:30 local, 01:30 UTC.
    expect(zonedTime('2026-03-29', '02:30', 'Europe/Paris').toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });
});
