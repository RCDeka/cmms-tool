// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import {
  ageDates,
  bucketOf,
  flowSeries,
  hoursLeft,
  periodBuckets,
  weeksOfWork,
  workGroup,
} from '../../src/rules/kpi-flow.js';

describe('periodBuckets', () => {
  it('cuts 30 days into ISO weeks, the first one partial', () => {
    // 2026-10-04 is a Sunday; the period starts on Saturday 2026-09-05.
    const { unit, buckets } = periodBuckets('2026-10-04', 30);
    expect(unit).toBe('week');
    expect(buckets).toEqual([
      { key: '2026-W36', from: '2026-09-05', to: '2026-09-06', partial: true },
      { key: '2026-W37', from: '2026-09-07', to: '2026-09-13', partial: false },
      { key: '2026-W38', from: '2026-09-14', to: '2026-09-20', partial: false },
      { key: '2026-W39', from: '2026-09-21', to: '2026-09-27', partial: false },
      { key: '2026-W40', from: '2026-09-28', to: '2026-10-04', partial: false },
    ]);
  });

  it('keeps the current week partial on a weekday', () => {
    const { buckets } = periodBuckets('2026-10-07', 30);
    expect(buckets.at(-1)).toEqual({
      key: '2026-W41',
      from: '2026-10-05',
      to: '2026-10-07',
      partial: true,
    });
  });

  it('uses 13 or 14 weeks for 90 days', () => {
    const { buckets } = periodBuckets('2026-10-04', 90);
    expect(buckets[0]).toMatchObject({ key: '2026-W28', from: '2026-07-07', partial: true });
    expect(buckets).toHaveLength(13);
  });

  it('crosses the new year with ISO week 53 of 2026', () => {
    const keys = periodBuckets('2027-01-03', 30).buckets.map((b) => b.key);
    expect(keys).toEqual(['2026-W49', '2026-W50', '2026-W51', '2026-W52', '2026-W53']);
  });

  it('counts 365 days per calendar month', () => {
    const { unit, buckets } = periodBuckets('2026-10-04', 365);
    expect(unit).toBe('month');
    expect(buckets).toHaveLength(13);
    expect(buckets[0]).toEqual({
      key: '2025-10',
      from: '2025-10-05',
      to: '2025-10-31',
      partial: true,
    });
    expect(buckets[4]).toEqual({
      key: '2026-02',
      from: '2026-02-01',
      to: '2026-02-28',
      partial: false,
    });
    expect(buckets.at(-1)).toEqual({
      key: '2026-10',
      from: '2026-10-01',
      to: '2026-10-04',
      partial: true,
    });
  });

  it('finds the bucket of a date', () => {
    const { buckets } = periodBuckets('2026-10-04', 30);
    expect(bucketOf(buckets, '2026-09-13')).toBe('2026-W37');
    expect(bucketOf(buckets, '2026-09-04')).toBeNull();
  });
});

describe('flowSeries', () => {
  const { buckets } = periodBuckets('2026-10-04', 30);
  const wo = (id, created_on, status = 'OPEN', completed_on = null) => ({
    id,
    created_on,
    status,
    completed_on,
  });

  it('counts opened, closed, cancelled and the unfinished at the end of each week', () => {
    const rows = [
      wo(1, '2026-08-01'), // unfinished all along
      wo(2, '2026-09-08', 'CLOSED', '2026-09-15'),
      wo(3, '2026-09-21', 'CANCELLED'),
      wo(4, '2026-07-01', 'CLOSED', '2026-09-01'), // finished before the period
    ];
    const series = flowSeries(rows, new Map([[3, '2026-09-28']]), buckets);
    expect(
      series.map(({ key, opened, closed, cancelled, unfinished }) => [
        key,
        opened,
        closed,
        cancelled,
        unfinished,
      ]),
    ).toEqual([
      ['2026-W36', 0, 0, 0, 1],
      ['2026-W37', 1, 0, 0, 2],
      ['2026-W38', 0, 1, 0, 1],
      ['2026-W39', 1, 0, 0, 2],
      ['2026-W40', 0, 0, 1, 1],
    ]);
  });
});

describe('backlog rules', () => {
  it('gives the creation dates of each age bucket', () => {
    expect(ageDates('0-7', '2026-10-04')).toEqual({ from: '2026-09-27', to: '2026-10-04' });
    expect(ageDates('8-30', '2026-10-04')).toEqual({ from: '2026-09-04', to: '2026-09-26' });
    expect(ageDates('91+', '2026-10-04')).toEqual({ from: null, to: '2026-07-05' });
  });

  it('never counts negative hours left', () => {
    expect(hoursLeft(10, 3)).toBe(7);
    expect(hoursLeft(2, 5)).toBe(0);
    expect(hoursLeft(4, null)).toBe(4);
  });

  it('gives weeks of work, or nothing without capacity', () => {
    expect(weeksOfWork(70, 35)).toBe(2);
    expect(weeksOfWork(5, 0)).toBeNull();
  });

  it.each([
    [{ type: 'PREVENTIVE', review_status: null }, 'PLANNED'],
    [{ type: 'REGULATORY', review_status: null }, 'PLANNED'],
    [{ type: 'CORRECTIVE', review_status: null }, 'REACTIVE'],
    [{ type: 'CORRECTIVE', review_status: 'APPROVED' }, 'REQUESTS'],
    [{ type: 'IMPROVEMENT', review_status: 'APPROVED' }, 'IMPROVEMENT'],
    [{ type: 'PREVENTIVE', review_status: 'APPROVED' }, 'PLANNED'],
  ])('%o is %s work', (wo, group) => {
    expect(workGroup(wo)).toBe(group);
  });
});
