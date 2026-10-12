// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import {
  breakdownSpells,
  daysBetween,
  downDays,
  durationStats,
  hoursBetween,
  median,
  percentile,
  repeatFailures,
} from '../../src/rules/kpi-people.js';

describe('median and 90th percentile', () => {
  it('takes the middle value of an odd count, the mean of the two middle ones otherwise', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });

  it('uses the nearest rank for the 90th percentile', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 90)).toBe(10);
    expect(percentile([2, 4, 1], 90)).toBe(4);
    expect(percentile([3], 90)).toBe(3);
    expect(percentile([], 90)).toBeNull();
    expect(durationStats([24, 48])).toEqual({ count: 2, median: 36, p90: 48 });
  });

  it('measures hours and days', () => {
    expect(hoursBetween('2026-09-10T08:00:00.000Z', '2026-09-11T10:30:00.000Z')).toBe(26.5);
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(29);
  });
});

describe('repeatFailures', () => {
  const wo = (id, asset, created, status = 'OPEN', closed = null) => ({
    id,
    number: `WO-${id}`,
    asset_id: asset,
    created_on: created,
    status,
    closed_on: closed,
  });
  const inSeptember = (w) => w.created_on >= '2026-09-01';

  it('counts work coming back less than 30 days after the previous one closed', () => {
    const list = [
      wo(1, 1, '2026-08-01', 'CLOSED', '2026-09-01'),
      wo(2, 1, '2026-09-30'), // 29 days: a repeat
      wo(3, 2, '2026-08-01', 'CLOSED', '2026-08-31'),
      wo(4, 2, '2026-09-30'), // 30 days: not
      wo(5, 3, '2026-08-01', 'CLOSED', '2026-08-30'),
      wo(6, 3, '2026-09-30'), // 31 days: not
      wo(7, 4, '2026-09-02'),
      wo(8, 4, '2026-09-03'), // the previous one is still open: not a repeat
    ];
    const repeats = repeatFailures(list, inSeptember);
    expect(repeats.map((r) => [r.id, r.previous.id, r.gap])).toEqual([[2, 1, 29]]);
  });

  it('only counts the work created in the period, compared with any earlier one', () => {
    const list = [wo(1, 1, '2026-08-01', 'CLOSED', '2026-08-02'), wo(2, 1, '2026-08-10')];
    expect(repeatFailures(list, inSeptember)).toEqual([]);
  });
});

describe('downtime', () => {
  it('builds breakdown spells from the status history', () => {
    expect(
      breakdownSpells([
        { day: '2026-01-01', to: 'IN_SERVICE' },
        { day: '2026-09-29', to: 'BROKEN_DOWN' },
        { day: '2026-10-01', to: 'IN_SERVICE' },
        { day: '2026-10-03', to: 'BROKEN_DOWN' },
      ]),
    ).toEqual([
      { start: '2026-09-29', end: '2026-10-01' },
      { start: '2026-10-03', end: null },
    ]);
  });

  it('counts the calendar days touched, a breakdown still going on until today', () => {
    expect(downDays([{ start: '2026-09-29', end: '2026-10-01' }], '2026-09-05', '2026-10-04')).toBe(
      3,
    );
    expect(downDays([{ start: '2026-08-01', end: null }], '2026-09-05', '2026-10-04')).toBe(30);
    expect(downDays([{ start: '2026-10-04', end: '2026-10-04' }], '2026-09-05', '2026-10-04')).toBe(
      1,
    );
    expect(downDays([{ start: '2026-08-01', end: '2026-08-05' }], '2026-09-05', '2026-10-04')).toBe(
      0,
    );
  });
});
