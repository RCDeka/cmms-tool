// Week scheduler rules (BR-S1 to BR-S10), without a database.
import { describe, expect, it } from 'vitest';
import {
  allocationBlocker,
  appointmentEnd,
  appointmentsOverlap,
  blockChangeBlocker,
  compareBlocks,
  datesOfWeek,
  dayCapacity,
  dayWarnings,
  hoursLeft,
  lockTimeProblem,
  roundUpToHalfHour,
  scheduleDays,
  scheduleTiles,
  trayGroup,
  weekday,
} from '../../src/rules/schedule.js';

const SETTINGS = { daily_hours: 7 };

describe('days of a week (P11)', () => {
  it('lists the seven dates of an ISO week, Monday first', () => {
    expect(datesOfWeek('2026-W41')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(datesOfWeek('2026-W53')[0]).toBe('2026-12-28');
    expect(weekday('2026-10-05')).toBe(1);
    expect(weekday('2026-10-11')).toBe(7);
  });

  it('shows Monday to Friday, and a weekend day once opened', () => {
    const closed = scheduleDays('2026-W41', { saturday_open: false, sunday_open: false });
    expect(closed.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5]);
    const saturday = scheduleDays('2026-W41', { saturday_open: true, sunday_open: false });
    expect(saturday.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(saturday.at(-1)).toEqual({ day: '2026-10-10', weekday: 6, open: true });
  });

  it('keeps a closed weekend day that holds blocks, marked closed (BR-S8)', () => {
    const days = scheduleDays(
      '2026-W41',
      { saturday_open: false, sunday_open: false },
      new Set(['2026-10-11']),
    );
    expect(days.at(-1)).toEqual({ day: '2026-10-11', weekday: 7, open: false });
  });
});

describe('capacity of a day (P5)', () => {
  it('gives the daily hours on weekdays and nothing on weekends', () => {
    expect(dayCapacity('2026-10-05', null, SETTINGS)).toBe(7);
    expect(dayCapacity('2026-10-10', null, SETTINGS)).toBe(0);
  });

  it('uses the override when there is one: leave, part time, weekend work', () => {
    expect(dayCapacity('2026-10-05', { hours: 0 }, SETTINGS)).toBe(0);
    expect(dayCapacity('2026-10-05', { hours: 3.5 }, SETTINGS)).toBe(3.5);
    expect(dayCapacity('2026-10-10', { hours: 4 }, SETTINGS)).toBe(4);
  });
});

describe('hours left on a work order (BR-S2)', () => {
  it('rounds the estimate up to the half hour (P4)', () => {
    expect(roundUpToHalfHour(2)).toBe(2);
    expect(roundUpToHalfHour(1.2)).toBe(1.5);
    expect(roundUpToHalfHour(1.5)).toBe(1.5);
    expect(roundUpToHalfHour(0.1)).toBe(0.5);
  });

  it('shows what is left: a 2 h job with a 1 h 30 block has 30 min left', () => {
    expect(hoursLeft(2, 1.5)).toBe(0.5);
    expect(hoursLeft(2, 2)).toBe(0);
    expect(hoursLeft(2, 3)).toBe(0);
    expect(hoursLeft(1.2, 1)).toBe(0.5);
    expect(hoursLeft(null, 0)).toBeNull();
  });
});

describe('warnings of a day', () => {
  const day = (o) => ({ total: 0, capacity: 7, open: true, absent: false, sites: [], ...o });

  it('flags a day above its capacity, never refuses it (BR-S5)', () => {
    expect(dayWarnings(day({ total: 8.5 }))).toEqual(['OVER_CAPACITY']);
    expect(dayWarnings(day({ total: 7 }))).toEqual([]);
  });

  it('flags blocks on an absent day and on a closed weekend (BR-S8)', () => {
    expect(dayWarnings(day({ total: 2, capacity: 0, absent: true }))).toEqual([
      'OVER_CAPACITY',
      'ABSENT',
    ]);
    expect(dayWarnings(day({ total: 0, capacity: 0, absent: true }))).toEqual([]);
    expect(dayWarnings(day({ total: 2, capacity: 0, open: false }))).toEqual([
      'OVER_CAPACITY',
      'WEEKEND_CLOSED',
    ]);
  });

  it('flags two sites or more in a day (BR-S10)', () => {
    expect(dayWarnings(day({ total: 4, sites: ['Lyon', 'Saclay'] }))).toEqual(['SEVERAL_SITES']);
    expect(dayWarnings(day({ total: 4, sites: ['Lyon'] }))).toEqual([]);
  });
});

describe('appointments (P6, BR-S6)', () => {
  it('accepts a start on the hour or half hour that ends by midnight', () => {
    expect(lockTimeProblem('10:00', 2)).toBeNull();
    expect(lockTimeProblem('22:30', 1.5)).toBeNull();
    expect(lockTimeProblem('10:15', 2)).toMatch(/half hour/);
    expect(lockTimeProblem('24:00', 1)).toMatch(/half hour/);
    expect(lockTimeProblem('23:00', 1.5)).toMatch(/midnight/);
  });

  it('detects overlapping appointments, not touching ones', () => {
    const a = { locked_start: '10:00', hours: 2 };
    expect(appointmentsOverlap(a, { locked_start: '11:30', hours: 1 })).toBe(true);
    expect(appointmentsOverlap(a, { locked_start: '09:00', hours: 1.5 })).toBe(true);
    expect(appointmentsOverlap(a, { locked_start: '12:00', hours: 1 })).toBe(false);
    expect(appointmentsOverlap(a, { locked_start: '08:00', hours: 2 })).toBe(false);
    expect(appointmentEnd('10:00', 2.5)).toBe('12:30');
    expect(appointmentEnd('22:30', 1.5)).toBe('24:00');
  });

  it('refuses to move, resize or remove a locked block; a note is fine', () => {
    const block = { locked_start: '10:00', day: '2026-10-05', technician_id: 4, hours: 2 };
    expect(blockChangeBlocker(block, null, { day: '2026-10-06' })?.rule).toBe('BR-S6');
    expect(blockChangeBlocker(block, null, { technician_id: 5 })?.rule).toBe('BR-S6');
    expect(blockChangeBlocker(block, null, { hours: 2.5 })?.rule).toBe('BR-S6');
    expect(blockChangeBlocker(block, null, 'DELETE')?.message).toMatch(/locked at 10:00/);
    expect(blockChangeBlocker(block, null, { hours: 2, note: 'x' })).toBeNull();
    const free = { ...block, locked_start: null };
    expect(blockChangeBlocker(free, { status: 'OPEN' }, { day: '2026-10-06' })).toBeNull();
  });

  it('keeps the blocks of a finished work order as history (BR-S4)', () => {
    const block = { locked_start: null, day: '2026-10-05', technician_id: 4, hours: 2 };
    expect(blockChangeBlocker(block, { status: 'CLOSED' }, { hours: 1 })?.rule).toBe('BR-S4');
    expect(blockChangeBlocker(block, { status: 'CANCELLED' }, 'DELETE')?.rule).toBe('BR-S4');
  });
});

describe('work orders that can be scheduled (BR-S2, BR-S4)', () => {
  const wo = (o) => ({ status: 'OPEN', review_status: null, estimated_hours: 2, ...o });

  it('refuses finished work, requests waiting for review, and work without an estimate', () => {
    expect(allocationBlocker(wo())).toBeNull();
    expect(allocationBlocker(wo({ status: 'IN_PROGRESS' }))).toBeNull();
    expect(allocationBlocker(wo({ status: 'CLOSED' }))?.rule).toBe('BR-S4');
    expect(allocationBlocker(wo({ status: 'CANCELLED' }))?.rule).toBe('BR-S4');
    expect(allocationBlocker(wo({ review_status: 'PENDING' }))?.rule).toBe('BR-S4');
    expect(allocationBlocker(wo({ review_status: 'APPROVED' }))).toBeNull();
    expect(allocationBlocker(wo({ estimated_hours: null }))?.rule).toBe('BR-S2');
  });
});

describe('tray groups (spec §8, BR-S9)', () => {
  it('sorts work into planned, carried over and not planned', () => {
    expect(trayGroup('2026-W41', '2026-W41')).toBe('PLANNED');
    expect(trayGroup('2026-W40', '2026-W41')).toBe('CARRIED_OVER');
    expect(trayGroup('2025-W52', '2026-W01')).toBe('CARRIED_OVER');
    expect(trayGroup(null, '2026-W41')).toBe('NOT_PLANNED');
    expect(trayGroup('2026-W42', '2026-W41')).toBeNull();
  });
});

describe('order of a day', () => {
  it('puts appointments first by time, then the person’s order', () => {
    const blocks = [
      { id: 1, kind: 'WORK', position: 2, locked_start: null },
      { id: 2, kind: 'TRAVEL', position: 1, locked_start: null },
      { id: 3, kind: 'WORK', position: 3, locked_start: '14:00' },
      { id: 4, kind: 'WORK', position: 4, locked_start: '09:30' },
    ];
    expect([...blocks].sort((a, b) => compareBlocks(a, b)).map((b) => b.id)).toEqual([4, 3, 2, 1]);
    // The scheduler's grid lists work before travel, preparation and other time.
    expect(
      [...blocks].sort((a, b) => compareBlocks(a, b, { workFirst: true })).map((b) => b.id),
    ).toEqual([4, 3, 1, 2]);
  });
});

describe('tiles (spec §8)', () => {
  it('sums booked and available hours, travel share, sites per day and carried-over work', () => {
    const people = [
      {
        days: [
          { total: 6, capacity: 7, sites: ['Lyon', 'Saclay'] },
          { total: 0, capacity: 7, sites: [] },
        ],
      },
      { days: [{ total: 3, capacity: 0, sites: ['Lyon'] }] },
    ];
    const blocks = [
      { kind: 'WORK', hours: 5 },
      { kind: 'TRAVEL', hours: 1 },
      { kind: 'WORK', hours: 3 },
    ];
    const tray = [
      { group: 'PLANNED', hours_left: 1.5 },
      { group: 'CARRIED_OVER', hours_left: 2 },
      { group: 'CARRIED_OVER', hours_left: 0 },
      { group: 'NOT_PLANNED', hours_left: null },
    ];
    expect(scheduleTiles(people, blocks, tray)).toEqual({
      booked_hours: 9,
      available_hours: 14,
      hours_left: { planned: 1.5, carried_over: 2, not_planned: 0 },
      travel_share: 1 / 9,
      sites_per_day: { average: 1.5, worst: 2 },
      carried_over: 2,
    });
    expect(scheduleTiles([], [], []).travel_share).toBeNull();
  });
});
