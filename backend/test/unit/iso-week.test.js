// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import {
  addWeeks,
  isWeek,
  mondayOf,
  weekOfDate,
  weekRange,
  weeksBetween,
  weeksInYear,
} from '../../src/lib/iso-week.js';

describe('ISO weeks', () => {
  it.each([
    ['2026-10-04', '2026-W40'], // a Sunday ends its week
    ['2026-10-05', '2026-W41'],
    ['2026-01-01', '2026-W01'], // a Thursday: week 1 of its own year
    ['2027-01-01', '2026-W53'], // a Friday: last week of the previous year
    ['2024-12-30', '2025-W01'], // a Monday: first week of the next year
    ['2021-01-03', '2020-W53'],
  ])('%s is in %s', (date, week) => {
    expect(weekOfDate(date)).toBe(week);
  });

  it('counts 52 or 53 weeks a year', () => {
    expect(weeksInYear(2026)).toBe(53); // starts on a Thursday
    expect(weeksInYear(2020)).toBe(53); // leap year starting on a Wednesday
    expect(weeksInYear(2025)).toBe(52);
    expect(weeksInYear(2027)).toBe(52);
  });

  it('validates weeks', () => {
    expect(isWeek('2026-W53')).toBe(true);
    expect(isWeek('2027-W53')).toBe(false);
    expect(isWeek('2026-W00')).toBe(false);
    expect(isWeek('2026-W1')).toBe(false);
    expect(isWeek(null)).toBe(false);
  });

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-W41')).toBe('2026-10-05');
    expect(mondayOf('2026-W01')).toBe('2025-12-29');
    expect(mondayOf('2026-W53')).toBe('2026-12-28');
  });

  it('adds weeks across years, through week 53', () => {
    expect(addWeeks('2026-W52', 1)).toBe('2026-W53');
    expect(addWeeks('2026-W52', 2)).toBe('2027-W01');
    expect(addWeeks('2027-W01', -1)).toBe('2026-W53');
    expect(addWeeks('2026-W41', 13)).toBe('2027-W01');
    expect(weeksBetween('2026-W41', '2027-W01')).toBe(13);
    expect(weeksBetween('2027-W01', '2026-W41')).toBe(-13);
  });

  it('lists consecutive weeks', () => {
    expect(weekRange('2026-W52', 3)).toEqual(['2026-W52', '2026-W53', '2027-W01']);
    expect(weekRange('2026-W41', 52)).toHaveLength(52);
  });
});

describe('ISO weeks on UTC times (D56)', () => {
  // The former implementation, on date strings: the reference.
  const DAY = 86_400_000;
  const addDays = (date, days) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const reference = (date) => {
    const thursday = addDays(date, 4 - weekday(date));
    const year = Number(thursday.slice(0, 4));
    const day = Math.round((Date.parse(`${thursday}T00:00:00Z`) - Date.UTC(year, 0, 1)) / DAY);
    return `${year}-W${String(Math.floor(day / 7) + 1).padStart(2, '0')}`;
  };

  it('gives the same week as the reference for every day of 1999 to 2041', () => {
    for (let date = '1999-01-01'; date < '2042-01-01'; date = addDays(date, 1)) {
      if (weekOfDate(date) !== reference(date)) throw new Error(`${date}: ${weekOfDate(date)}`);
    }
  });

  it('round-trips every week of 2000 to 2040 through its Monday and through addWeeks', () => {
    for (const week of weekRange('2000-W01', 2140)) {
      expect(weekOfDate(mondayOf(week))).toBe(week);
      expect(weekday(mondayOf(week))).toBe(1);
      expect(addWeeks(addWeeks(week, 61), -61)).toBe(week);
      expect(weeksBetween(week, addWeeks(week, 37))).toBe(37);
    }
  });
});
