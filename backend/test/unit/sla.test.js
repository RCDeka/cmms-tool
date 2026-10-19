// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Service levels (docs/data-model.md → BR-SLA1 to BR-SLA5, D86, D88): hand-computed cases in
// Europe/Paris, UTC+2 until 25 October 2026. Friday 9 and Monday 12 October 2026.
import { describe, expect, it } from 'vitest';
import {
  inSlaScope,
  isLate,
  pausedSpells,
  slaDeadline,
  slaOf,
  workOrderDeadlines,
} from '../../src/rules/sla.js';

const TZ = 'Europe/Paris';
const CALENDAR = { hours_mode: 'CALENDAR' };
const BUSINESS = {
  hours_mode: 'BUSINESS',
  business_days: [1, 2, 3, 4, 5],
  business_start: '08:00',
  business_end: '18:00',
};
const NO_HOLIDAYS = new Set();

const deadline = (reportedAt, hours, settings, { spells = [], holidays = NO_HOLIDAYS } = {}) =>
  slaDeadline(reportedAt, hours, spells, settings, holidays, TZ);

describe('slaDeadline in calendar hours (BR-SLA3, BR-SLA4)', () => {
  it('adds the target, with the moment 75 % of it is used', () => {
    expect(deadline('2026-10-05T10:00:00.000Z', 4, CALENDAR)).toEqual({
      due_at: '2026-10-05T14:00:00.000Z',
      risk_at: '2026-10-05T13:00:00.000Z',
    });
  });

  it('counts real elapsed time across a daylight saving change', () => {
    // 25 October 2026: Paris goes back from UTC+2 to UTC+1; 24 h stay 24 h.
    expect(deadline('2026-10-24T22:00:00.000Z', 24, CALENDAR).due_at).toBe(
      '2026-10-25T22:00:00.000Z',
    );
  });

  it('leaves out a paused spell', () => {
    const spells = [{ from: '2026-10-05T11:00:00.000Z', to: '2026-10-05T12:00:00.000Z' }];
    expect(deadline('2026-10-05T10:00:00.000Z', 4, CALENDAR, { spells }).due_at).toBe(
      '2026-10-05T15:00:00.000Z',
    );
  });

  it('gives no deadline without a target', () => {
    expect(deadline('2026-10-05T10:00:00.000Z', null, CALENDAR)).toEqual({
      due_at: null,
      risk_at: null,
    });
  });
});

describe('slaDeadline in business hours (BR-SLA3, BR-SLA4)', () => {
  it('counts the opening hours of the day', () => {
    // Monday 10:00 Paris + 4 h = 14:00 Paris; 75 % (3 h) at 13:00 Paris.
    expect(deadline('2026-10-05T08:00:00.000Z', 4, BUSINESS)).toEqual({
      due_at: '2026-10-05T12:00:00.000Z',
      risk_at: '2026-10-05T11:00:00.000Z',
    });
  });

  it('carries the time left over the weekend', () => {
    // Friday 16:00 Paris: 2 h on Friday, 2 h on Monday → Monday 10:00 Paris.
    expect(deadline('2026-10-09T14:00:00.000Z', 4, BUSINESS)).toEqual({
      due_at: '2026-10-12T08:00:00.000Z',
      risk_at: '2026-10-12T07:00:00.000Z',
    });
  });

  it('starts the clock at the next opening for work reported outside the hours', () => {
    // Saturday: the clock starts on Monday 08:00 Paris.
    expect(deadline('2026-10-10T12:00:00.000Z', 1, BUSINESS).due_at).toBe(
      '2026-10-12T07:00:00.000Z',
    );
    // Friday 19:00 Paris, after the closing: same.
    expect(deadline('2026-10-09T17:00:00.000Z', 1, BUSINESS).due_at).toBe(
      '2026-10-12T07:00:00.000Z',
    );
  });

  it('skips a holiday', () => {
    const holidays = new Set(['2026-10-12']);
    // Friday 16:00 Paris: 2 h on Friday, Monday off, 2 h on Tuesday → Tuesday 10:00 Paris.
    expect(deadline('2026-10-09T14:00:00.000Z', 4, BUSINESS, { holidays }).due_at).toBe(
      '2026-10-13T08:00:00.000Z',
    );
  });

  it('moves a deadline by the business time a weekend pause took, not the calendar time', () => {
    // Friday 08:00 Paris, 24 h: 10 h Friday, 10 h Monday, 4 h Tuesday → Tuesday 12:00 Paris.
    const reported = '2026-10-09T06:00:00.000Z';
    expect(deadline(reported, 24, BUSINESS).due_at).toBe('2026-10-13T10:00:00.000Z');
    // Paused from Friday 17:00 to Monday 08:00 Paris: one business hour lost, not 63.
    const spells = [{ from: '2026-10-09T15:00:00.000Z', to: '2026-10-12T06:00:00.000Z' }];
    expect(deadline(reported, 24, BUSINESS, { spells }).due_at).toBe('2026-10-13T11:00:00.000Z');
  });

  it('follows the business days chosen', () => {
    // Saturday open too: Friday 16:00 Paris + 4 h → Saturday 10:00 Paris.
    const sixDays = { ...BUSINESS, business_days: [1, 2, 3, 4, 5, 6] };
    expect(deadline('2026-10-09T14:00:00.000Z', 4, sixDays).due_at).toBe(
      '2026-10-10T08:00:00.000Z',
    );
  });
});

/** Audit entries as the work order service writes them. */
const entry = (at, changes, extra = {}) => ({ action: 'UPDATE', changes, at, ...extra });
const hold = (reason) => ({
  status: { from: 'IN_PROGRESS', to: 'ON_HOLD' },
  hold_reason: { from: null, to: reason },
});
const resume = {
  status: { from: 'ON_HOLD', to: 'IN_PROGRESS' },
  hold_reason: { from: 'X', to: null },
};

describe('pausedSpells (BR-SLA3)', () => {
  it('counts a hold waiting for access or approval', () => {
    const entries = [
      entry('2026-10-05T09:00:00.000Z', { status: { from: 'OPEN', to: 'IN_PROGRESS' } }),
      entry('2026-10-05T10:00:00.000Z', hold('WAITING_ACCESS')),
      entry('2026-10-05T12:00:00.000Z', resume),
      entry('2026-10-05T13:00:00.000Z', hold('WAITING_APPROVAL')),
      entry('2026-10-05T14:00:00.000Z', resume),
    ];
    expect(pausedSpells(entries, '2026-10-06T00:00:00.000Z')).toEqual({
      spells: [
        { from: '2026-10-05T10:00:00.000Z', to: '2026-10-05T12:00:00.000Z' },
        { from: '2026-10-05T13:00:00.000Z', to: '2026-10-05T14:00:00.000Z' },
      ],
      pausedSince: null,
    });
  });

  it('does not pause for parts or a contractor', () => {
    const entries = [
      entry('2026-10-05T10:00:00.000Z', hold('WAITING_PARTS')),
      entry('2026-10-05T12:00:00.000Z', resume),
      entry('2026-10-05T13:00:00.000Z', hold('WAITING_CONTRACTOR')),
    ];
    expect(pausedSpells(entries, '2026-10-06T00:00:00.000Z')).toEqual({
      spells: [],
      pausedSince: null,
    });
  });

  it('ends a spell when the reason changes to one that does not pause', () => {
    const entries = [
      entry('2026-10-05T10:00:00.000Z', hold('WAITING_ACCESS')),
      entry('2026-10-05T11:00:00.000Z', {
        hold_reason: { from: 'WAITING_ACCESS', to: 'WAITING_PARTS' },
      }),
    ];
    expect(pausedSpells(entries, '2026-10-06T00:00:00.000Z').spells).toEqual([
      { from: '2026-10-05T10:00:00.000Z', to: '2026-10-05T11:00:00.000Z' },
    ]);
  });

  it('runs a current pause up to now, and says since when', () => {
    const entries = [entry('2026-10-05T10:00:00.000Z', hold('WAITING_ACCESS'))];
    expect(pausedSpells(entries, '2026-10-05T15:00:00.000Z')).toEqual({
      spells: [{ from: '2026-10-05T10:00:00.000Z', to: '2026-10-05T15:00:00.000Z' }],
      pausedSince: '2026-10-05T10:00:00.000Z',
    });
  });

  it('reads each write at its client time and counts an inverted spell as zero', () => {
    const entries = [
      // Synced in this order, but the resume was made offline before the hold.
      entry('2026-10-05T12:00:00.000Z', hold('WAITING_ACCESS'), {
        edited_at: '2026-10-05T11:00:00.000Z',
      }),
      entry('2026-10-05T12:01:00.000Z', resume, { edited_at: '2026-10-05T10:00:00.000Z' }),
    ];
    expect(pausedSpells(entries, '2026-10-06T00:00:00.000Z').spells).toEqual([]);
  });

  it('ignores the edits refused by a conflict', () => {
    const entries = [
      entry('2026-10-05T10:00:00.000Z', hold('WAITING_ACCESS'), { action: 'CONFLICT' }),
    ];
    expect(pausedSpells(entries, '2026-10-06T00:00:00.000Z').spells).toEqual([]);
  });
});

const SETTINGS = {
  ...CALENDAR,
  response_stop: 'START',
  measured_from: '2026-10-01T00:00:00.000Z',
};
const TARGETS = new Map([
  ['URGENT', { response_hours: 1, resolution_hours: 4 }],
  ['NORMAL', { response_hours: 24, resolution_hours: 72 }],
]);
const WO = {
  type: 'CORRECTIVE',
  priority: 'NORMAL',
  status: 'OPEN',
  reported_at: '2026-10-05T10:00:00.000Z',
  first_started_at: null,
  first_assigned_at: null,
  completed_at: null,
};
const deadlines = (workOrder, { entries = [], settings = SETTINGS, keep } = {}) =>
  workOrderDeadlines(
    { ...WO, ...workOrder },
    {
      settings,
      targets: TARGETS,
      holidays: NO_HOLIDAYS,
      entries,
      now: '2026-10-05T20:00:00.000Z',
      timeZone: TZ,
      keep,
    },
  );

describe('workOrderDeadlines (BR-SLA1 to BR-SLA5)', () => {
  it('measures corrective work reported since the SLA exists only', () => {
    expect(inSlaScope(WO, SETTINGS)).toBe(true);
    expect(inSlaScope({ ...WO, type: 'PREVENTIVE' }, SETTINGS)).toBe(false);
    expect(inSlaScope({ ...WO, reported_at: '2026-09-30T23:59:00.000Z' }, SETTINGS)).toBe(false);
    expect(deadlines({ type: 'IMPROVEMENT' })).toEqual({
      response_due_at: null,
      response_risk_at: null,
      resolution_due_at: null,
      resolution_risk_at: null,
      sla_paused_at: null,
    });
  });

  it('gives no deadline for a priority without a target', () => {
    expect(deadlines({ priority: 'LOW' }).resolution_due_at).toBeNull();
  });

  it('tightens the deadlines when the priority is raised', () => {
    expect(deadlines({}).resolution_due_at).toBe('2026-10-08T10:00:00.000Z');
    expect(deadlines({ priority: 'URGENT' })).toMatchObject({
      response_due_at: '2026-10-05T11:00:00.000Z',
      resolution_due_at: '2026-10-05T14:00:00.000Z',
    });
  });

  it('does not count a pause after a clock stopped for that clock', () => {
    const entries = [
      entry('2026-10-05T11:00:00.000Z', { status: { from: 'OPEN', to: 'IN_PROGRESS' } }),
      entry('2026-10-05T12:00:00.000Z', hold('WAITING_ACCESS')),
      entry('2026-10-05T14:00:00.000Z', resume),
    ];
    const result = deadlines(
      { status: 'IN_PROGRESS', priority: 'URGENT', first_started_at: '2026-10-05T11:00:00.000Z' },
      { entries },
    );
    expect(result.response_due_at).toBe('2026-10-05T11:00:00.000Z');
    expect(result.resolution_due_at).toBe('2026-10-05T16:00:00.000Z');
    expect(result.sla_paused_at).toBeNull();
  });

  it('keeps a stopped clock when asked (BR-SLA5)', () => {
    const stored = { response_due_at: '2026-10-06T10:00:00.000Z', response_risk_at: 'x' };
    expect(
      deadlines(
        { ...stored, priority: 'URGENT', first_started_at: '2026-10-05T12:00:00.000Z' },
        { keep: { response: true } },
      ).response_due_at,
    ).toBe('2026-10-06T10:00:00.000Z');
  });

  it('stops the response at the first assignment when set so', () => {
    const wo = { priority: 'URGENT', first_assigned_at: '2026-10-05T10:30:00.000Z' };
    const settings = { ...SETTINGS, response_stop: 'ASSIGNMENT' };
    expect(slaOf({ ...WO, ...wo, ...deadlines(wo, { settings }) }, 'ASSIGNMENT').response).toEqual({
      due_at: '2026-10-05T11:00:00.000Z',
      risk_at: '2026-10-05T10:45:00.000Z',
      at: '2026-10-05T10:30:00.000Z',
      met: true,
    });
  });

  it('marks a work order on a pausing hold as paused, and only while unfinished', () => {
    const entries = [entry('2026-10-05T12:00:00.000Z', hold('WAITING_APPROVAL'))];
    expect(deadlines({ status: 'ON_HOLD' }, { entries }).sla_paused_at).toBe(
      '2026-10-05T12:00:00.000Z',
    );
    expect(deadlines({ status: 'CANCELLED' }, { entries }).sla_paused_at).toBeNull();
  });
});

describe('slaOf and isLate (BR-SLA2, BR-SLA4)', () => {
  const row = {
    ...WO,
    response_due_at: '2026-10-05T11:00:00.000Z',
    response_risk_at: '2026-10-05T10:45:00.000Z',
    resolution_due_at: '2026-10-05T14:00:00.000Z',
    resolution_risk_at: '2026-10-05T13:00:00.000Z',
    sla_paused_at: null,
  };

  it('is null outside the SLA', () => {
    expect(slaOf({ ...WO, response_due_at: null, resolution_due_at: null }, 'START')).toBeNull();
  });

  it('says whether each clock stopped in time', () => {
    const sla = slaOf(
      {
        ...row,
        status: 'COMPLETED',
        first_started_at: '2026-10-05T10:50:00.000Z',
        completed_at: '2026-10-05T15:00:00.000Z',
      },
      'START',
    );
    expect(sla.response.met).toBe(true);
    expect(sla.resolution.met).toBe(false);
    expect(sla.paused).toBe(false);
  });

  it('counts a cancelled work order in neither', () => {
    const cancelled = { ...row, status: 'CANCELLED', first_started_at: '2026-10-05T12:00:00.000Z' };
    expect(slaOf(cancelled, 'START').response.met).toBeNull();
    expect(
      isLate({ due_at: row.response_due_at, at: null }, cancelled, '2026-10-06T00:00:00.000Z'),
    ).toBe(false);
  });

  it('keeps a work order paused after missing its deadline late, not one paused in time', () => {
    const clock = { due_at: row.resolution_due_at, at: null };
    const later = '2026-10-06T00:00:00.000Z';
    expect(
      isLate(clock, { status: 'ON_HOLD', sla_paused_at: '2026-10-05T15:00:00.000Z' }, later),
    ).toBe(true);
    expect(
      isLate(clock, { status: 'ON_HOLD', sla_paused_at: '2026-10-05T13:00:00.000Z' }, later),
    ).toBe(false);
    expect(isLate(clock, { status: 'IN_PROGRESS', sla_paused_at: null }, later)).toBe(true);
    expect(
      isLate(clock, { status: 'IN_PROGRESS', sla_paused_at: null }, '2026-10-05T13:30:00.000Z'),
    ).toBe(false);
  });
});
