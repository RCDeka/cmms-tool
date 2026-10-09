// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { addDays, dateInZone } from '../../src/lib/dates.js';

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
