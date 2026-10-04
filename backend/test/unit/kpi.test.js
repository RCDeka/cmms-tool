import { describe, expect, it } from 'vitest';
import { compareMyWork, isMyWorkToday, isOverdue, monthRange } from '../../src/rules/kpi.js';

describe('monthRange', () => {
  it.each([
    ['2026-10-04', '2026-10-01', '2026-10-31'],
    ['2026-12-31', '2026-12-01', '2026-12-31'],
    ['2026-01-01', '2026-01-01', '2026-01-31'],
    ['2028-02-10', '2028-02-01', '2028-02-29'], // leap year
    ['2027-02-10', '2027-02-01', '2027-02-28'],
  ])('%s → %s to %s', (today, from, to) => {
    expect(monthRange(today)).toEqual({ from, to });
  });
});

describe('isOverdue', () => {
  const today = '2026-10-04';
  it.each([
    [{ status: 'OPEN', due_on: '2026-10-03' }, true],
    [{ status: 'ON_HOLD', due_on: '2026-09-01' }, true],
    [{ status: 'OPEN', due_on: '2026-10-04' }, false], // due today is not late
    [{ status: 'OPEN', due_on: null }, false],
    [{ status: 'CLOSED', due_on: '2026-09-01' }, false],
    [{ status: 'CANCELLED', due_on: '2026-09-01' }, false],
  ])('%o → %s', (wo, expected) => {
    expect(isOverdue(wo, today)).toBe(expected);
  });
});

describe('my work today', () => {
  const today = '2026-10-04';
  const wo = (o) => ({
    status: 'OPEN',
    assignee_id: 4,
    due_on: null,
    priority: 'NORMAL',
    number: 'WO-2026-00001',
    ...o,
  });

  it('keeps open work assigned to the user that is due today, late, or has no date', () => {
    expect(isMyWorkToday(wo({ due_on: '2026-10-04' }), 4, today)).toBe(true);
    expect(isMyWorkToday(wo({ due_on: '2026-10-01' }), 4, today)).toBe(true);
    expect(isMyWorkToday(wo({}), 4, today)).toBe(true);
    expect(isMyWorkToday(wo({ due_on: '2026-10-05' }), 4, today)).toBe(false);
    expect(isMyWorkToday(wo({ assignee_id: 5 }), 4, today)).toBe(false);
    expect(isMyWorkToday(wo({ status: 'CLOSED' }), 4, today)).toBe(false);
  });

  it('sorts URGENT first, then by due date with undated last', () => {
    const list = [
      wo({ number: 'a', priority: 'NORMAL', due_on: '2026-10-01' }),
      wo({ number: 'b', priority: 'URGENT', due_on: null }),
      wo({ number: 'c', priority: 'HIGH', due_on: null }),
      wo({ number: 'd', priority: 'HIGH', due_on: '2026-10-02' }),
    ];
    expect(list.sort(compareMyWork).map((w) => w.number)).toEqual(['b', 'd', 'c', 'a']);
  });
});
