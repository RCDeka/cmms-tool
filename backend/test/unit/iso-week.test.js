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
