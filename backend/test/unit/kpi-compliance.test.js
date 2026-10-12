// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import {
  complianceRate,
  deadlineWeek,
  outcomesBy,
  visitOutcome,
  weekSunday,
  weeksEndingBetween,
} from '../../src/rules/kpi-compliance.js';

describe('deadlineWeek', () => {
  it('adds the tolerance to the planned week', () => {
    expect(
      deadlineWeek(
        { type: 'PREVENTIVE', tolerance_weeks: 2 },
        { due_week: '2026-W38', week: '2026-W39' },
      ),
    ).toBe('2026-W41');
    expect(
      deadlineWeek(
        { type: 'PREVENTIVE', tolerance_weeks: 1 },
        { due_week: '2026-W52', week: '2026-W53' },
      ),
    ).toBe('2027-W01');
  });

  it('keeps a regulatory visit to its due week, whatever the tolerance or a move', () => {
    expect(
      deadlineWeek(
        { type: 'REGULATORY', tolerance_weeks: 4 },
        { due_week: '2026-W38', week: '2026-W36' },
      ),
    ).toBe('2026-W38');
  });
});

describe('visitOutcome', () => {
  const deadline = weekSunday('2026-W38'); // 2026-09-20

  it('is on time when closed by the Sunday of the deadline week, late from the Monday', () => {
    expect(deadline).toBe('2026-09-20');
    expect(
      visitOutcome({ status: 'RELEASED', wo_status: 'CLOSED', closed_on: '2026-09-20' }, deadline),
    ).toBe('on_time');
    expect(
      visitOutcome({ status: 'RELEASED', wo_status: 'CLOSED', closed_on: '2026-09-21' }, deadline),
    ).toBe('late');
  });

  it('is late while unfinished, skipped when skipped', () => {
    expect(
      visitOutcome({ status: 'RELEASED', wo_status: 'IN_PROGRESS', closed_on: null }, deadline),
    ).toBe('late');
    expect(
      visitOutcome({ status: 'RELEASED', wo_status: 'CANCELLED', closed_on: null }, deadline),
    ).toBe('late');
    expect(visitOutcome({ status: 'SKIPPED', wo_status: null, closed_on: null }, deadline)).toBe(
      'skipped',
    );
  });
});

describe('rates', () => {
  it('leaves skipped visits out of the rate', () => {
    const visits = [
      { outcome: 'on_time', trade: 'HVAC' },
      { outcome: 'late', trade: 'HVAC' },
      { outcome: 'skipped', trade: 'HVAC' },
      { outcome: 'skipped', trade: 'PLUMBING' },
    ];
    const by = outcomesBy(visits, (v) => v.trade);
    expect(by.get('HVAC')).toEqual({ on_time: 1, late: 1, skipped: 1, rate: 0.5 });
    expect(by.get('PLUMBING')).toEqual({ on_time: 0, late: 0, skipped: 1, rate: null });
    expect(complianceRate(3, 1)).toBe(0.75);
    expect(complianceRate(0, 0)).toBeNull();
  });
});

describe('weeksEndingBetween', () => {
  it('lists the weeks whose Sunday falls in the range', () => {
    expect(weeksEndingBetween('2026-09-05', '2026-10-03')).toEqual([
      '2026-W36',
      '2026-W37',
      '2026-W38',
      '2026-W39',
    ]);
    expect(weeksEndingBetween('2026-09-07', '2026-09-12')).toEqual([]);
  });
});
