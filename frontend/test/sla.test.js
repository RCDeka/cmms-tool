// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Service levels on the client (D86): the state of each clock and the list flag follow the
// server's `sla` filter (BR-SLA4); the settings form sends only what changed.
import { describe, expect, it } from 'vitest';
import { parseFilters } from '../assets/js/filters.js';
import {
  clockState,
  slaArea,
  slaBadge,
  slaChanges,
  slaFieldErrors,
  slaFlag,
} from '../assets/js/sla.js';

const NOW = '2026-10-05T12:00:00.000Z';
const clock = (due, risk, at = null) => ({ due_at: due, risk_at: risk, at });
const workOrder = (status, response, resolution, paused = null) => ({
  status,
  sla: { response, resolution, paused: paused !== null, paused_at: paused },
});

describe('clockState', () => {
  const running = clock('2026-10-05T14:00:00.000Z', '2026-10-05T13:00:00.000Z');

  it('says met or missed once the clock stopped', () => {
    const wo = workOrder('IN_PROGRESS', null, null);
    expect(clockState({ ...running, at: '2026-10-05T14:00:00.000Z' }, wo, NOW)).toBe('met');
    expect(clockState({ ...running, at: '2026-10-05T14:01:00.000Z' }, wo, NOW)).toBe('missed');
  });

  it('says running, at risk or late while it runs', () => {
    const wo = workOrder('OPEN', null, null);
    expect(clockState(running, wo, NOW)).toBe('running');
    expect(clockState(running, wo, '2026-10-05T13:00:00.000Z')).toBe('at_risk');
    expect(clockState(running, wo, '2026-10-05T14:30:00.000Z')).toBe('late');
  });

  it('keeps a pause from making work late, unless the deadline passed before it', () => {
    const later = '2026-10-06T00:00:00.000Z';
    expect(
      clockState(running, workOrder('ON_HOLD', null, null, '2026-10-05T13:30:00.000Z'), later),
    ).toBe('paused');
    expect(
      clockState(running, workOrder('ON_HOLD', null, null, '2026-10-05T15:00:00.000Z'), later),
    ).toBe('late');
  });

  it('gives nothing without a target, for a cancelled one or one finished before the stop', () => {
    expect(clockState(clock(null, null), workOrder('OPEN', null, null), NOW)).toBeNull();
    expect(
      clockState(running, workOrder('CANCELLED', null, null), '2026-10-07T00:00:00.000Z'),
    ).toBeNull();
    expect(
      clockState(running, workOrder('COMPLETED', null, null), '2026-10-07T00:00:00.000Z'),
    ).toBeNull();
  });
});

describe('slaFlag and slaBadge', () => {
  const ok = clock('2026-10-08T12:00:00.000Z', '2026-10-07T12:00:00.000Z');

  it('flags a work order late when one clock missed or is past its deadline', () => {
    const missed = clock('2026-10-05T08:00:00.000Z', null, '2026-10-05T09:00:00.000Z');
    expect(slaFlag(workOrder('IN_PROGRESS', missed, ok), NOW)).toBe('late');
    expect(slaFlag(workOrder('OPEN', clock('2026-10-05T11:00:00.000Z', null), ok), NOW)).toBe(
      'late',
    );
  });

  it('flags it at risk past 75 % of a target, and not at all otherwise', () => {
    const risky = clock('2026-10-05T14:00:00.000Z', '2026-10-05T11:00:00.000Z');
    expect(slaFlag(workOrder('OPEN', risky, ok), NOW)).toBe('at_risk');
    expect(slaFlag(workOrder('OPEN', ok, ok), NOW)).toBeNull();
    expect(slaFlag({ status: 'OPEN', sla: null }, NOW)).toBeNull();
  });

  it('shows the flag as a badge with its text', () => {
    const risky = clock('2026-10-05T14:00:00.000Z', '2026-10-05T11:00:00.000Z');
    const badge = slaBadge(workOrder('OPEN', risky, ok), NOW);
    expect(badge.className).toBe('badge badge-sla-at-risk badge-tone-warning');
    expect(badge.textContent).toBe('SLA at risk');
    expect(slaBadge(workOrder('OPEN', ok, ok), NOW)).toBeNull();
  });
});

describe('slaArea', () => {
  it('shows both clocks, and says when they stop', () => {
    const wo = workOrder(
      'ON_HOLD',
      clock('2026-10-05T14:00:00.000Z', null, '2026-10-05T10:00:00.000Z'),
      clock(null, null),
      '2026-10-05T11:00:00.000Z',
    );
    const area = slaArea(wo, NOW);
    expect([...area.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Response',
      'Resolution',
    ]);
    expect(area.querySelector('.badge-sla-met').textContent).toBe('Met');
    expect(area.textContent).toContain('No target for this priority.');
    expect(area.textContent).toContain('The clocks stop while the work waits');
  });

  it('is left out outside the SLA and for a cancelled work order', () => {
    expect(slaArea({ status: 'OPEN', sla: null }, NOW)).toBeNull();
    expect(slaArea(workOrder('CANCELLED', clock('x', null), clock('x', null)), NOW)).toBeNull();
  });
});

const CURRENT = {
  version: 3,
  targets: [
    { priority: 'URGENT', response_hours: 1, resolution_hours: 4 },
    { priority: 'HIGH', response_hours: 4, resolution_hours: 24 },
  ],
  response_stop: 'START',
  hours_mode: 'CALENDAR',
  business_days: [1, 2, 3, 4, 5],
  business_start: '08:00',
  business_end: '18:00',
};
const RAW = {
  'URGENT.response_hours': '1',
  'URGENT.resolution_hours': '4',
  'HIGH.response_hours': '4',
  'HIGH.resolution_hours': '24',
  response_stop: 'START',
  hours_mode: 'CALENDAR',
  business_days: ['1', '2', '3', '4', '5'],
  business_start: '08:00',
  business_end: '18:00',
};

describe('slaChanges', () => {
  it('is null when nothing changed', () => {
    expect(slaChanges(CURRENT, RAW)).toBeNull();
  });

  it('sends the changed targets whole, the changed settings and the version', () => {
    expect(
      slaChanges(CURRENT, {
        ...RAW,
        'HIGH.resolution_hours': '',
        hours_mode: 'BUSINESS',
        business_days: ['6', '1', '2', '3', '4', '5'],
      }),
    ).toEqual({
      targets: [{ priority: 'HIGH', response_hours: 4, resolution_hours: null }],
      hours_mode: 'BUSINESS',
      business_days: [1, 2, 3, 4, 5, 6],
      version: 3,
    });
  });

  it('reads a decimal comma', () => {
    expect(slaChanges(CURRENT, { ...RAW, 'URGENT.response_hours': '0,5' }).targets).toEqual([
      { priority: 'URGENT', response_hours: 0.5, resolution_hours: 4 },
    ]);
  });
});

describe('slaFieldErrors', () => {
  it('names the field of the target that was refused', () => {
    expect(
      slaFieldErrors({ 'targets.0.resolution_hours': 'Too short', business_end: 'Before' }, [
        { priority: 'HIGH' },
      ]),
    ).toEqual({ 'HIGH.resolution_hours': 'Too short', business_end: 'Before' });
  });
});

describe('the sla list filter', () => {
  it('keeps late or at_risk only', () => {
    const q = (s) => new URLSearchParams(s);
    expect(parseFilters('work_orders', q('sla=late'))).toEqual({ sla: 'late' });
    expect(parseFilters('work_orders', q('sla=at_risk'))).toEqual({ sla: 'at_risk' });
    expect(parseFilters('work_orders', q('sla=soon'))).toEqual({});
  });
});
