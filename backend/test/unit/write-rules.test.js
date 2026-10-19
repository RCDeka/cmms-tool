// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { WORK_ORDER_STATUSES } from '../../src/rules/enums.js';
import { ASSET_FIELDS, WORK_ORDER_FIELDS } from '../../src/rules/fields.js';
import {
  EDITABLE_BY_ROLE,
  canEditRecord,
  forbiddenCreationFields,
  forbiddenFields,
} from '../../src/rules/permissions.js';
import { decideWrite } from '../../src/rules/versioning.js';
import { creationDate, nextWorkOrderNumber } from '../../src/rules/work-order-creation.js';
import {
  TRANSITIONS,
  applyWorkOrderRules,
  canTransition,
} from '../../src/rules/work-order-status.js';

const TODAY = '2026-10-04';
const EDITED = '2026-10-04T09:30:00.000Z';
const wo = (o = {}) => ({
  status: 'OPEN',
  created_on: '2026-10-01',
  due_on: null,
  started_on: null,
  completed_on: null,
  closed_on: null,
  work_report: null,
  report_waived: 0,
  hold_reason: null,
  hold_note: null,
  first_assigned_at: null,
  first_started_at: null,
  completed_at: null,
  review_status: null,
  ...o,
});
/** Rules as a user of `role` applies them, the edit made at EDITED. */
const apply = (current, changes, role = 'TECHNICIAN', extra = {}) =>
  applyWorkOrderRules(current, changes, {
    today: TODAY,
    role,
    moments: { status: EDITED, assignee_id: EDITED },
    ...extra,
  });
const started = (o = {}) =>
  wo({
    status: 'IN_PROGRESS',
    started_on: '2026-10-02',
    first_started_at: '2026-10-02T08:00:00.000Z',
    ...o,
  });
const done = (o = {}) =>
  started({
    status: 'COMPLETED',
    work_report: 'Fixed',
    completed_on: '2026-10-03',
    completed_at: '2026-10-03T15:00:00.000Z',
    ...o,
  });

describe('status transitions (BR-W4)', () => {
  const allowed = new Set([
    'OPEN>IN_PROGRESS',
    'OPEN>ON_HOLD',
    'OPEN>CANCELLED',
    'IN_PROGRESS>ON_HOLD',
    'IN_PROGRESS>COMPLETED',
    'IN_PROGRESS>CANCELLED',
    'ON_HOLD>OPEN',
    'ON_HOLD>IN_PROGRESS',
    'ON_HOLD>CANCELLED',
    'COMPLETED>CLOSED',
    'COMPLETED>IN_PROGRESS',
  ]);
  const pairs = WORK_ORDER_STATUSES.flatMap((from) =>
    WORK_ORDER_STATUSES.filter((to) => to !== from).map((to) => [from, to]),
  );

  it.each(pairs)('%s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(allowed.has(`${from}>${to}`));
  });

  it('defines every status and treats "no change" as allowed', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...WORK_ORDER_STATUSES].sort());
    for (const s of WORK_ORDER_STATUSES) expect(canTransition(s, s)).toBe(true);
  });

  it('goes back to OPEN from a hold only when the work never started (BR-W5)', () => {
    expect(canTransition('ON_HOLD', 'OPEN', null)).toBe(true);
    expect(canTransition('ON_HOLD', 'OPEN', '2026-10-02T08:00:00.000Z')).toBe(false);
  });
});

describe('applyWorkOrderRules', () => {
  it('rejects forbidden transitions (BR-W4), for supervisors too', () => {
    expect(apply(wo(), { status: 'COMPLETED' }).error.rule).toBe('BR-W4');
    expect(apply(started(), { status: 'CLOSED' }, 'SUPERVISOR').error.rule).toBe('BR-W4');
    const held = started({ status: 'ON_HOLD', hold_reason: 'OTHER' });
    expect(apply(held, { status: 'OPEN' }).error).toMatchObject({ rule: 'BR-W5', status: 422 });
  });

  it('sets started_on and first_started_at the first time the order starts (BR-W5)', () => {
    expect(apply(wo(), { status: 'IN_PROGRESS' }).changes).toEqual({
      status: 'IN_PROGRESS',
      started_on: TODAY,
      first_started_at: EDITED,
    });
    const resumed = started({ status: 'ON_HOLD', hold_reason: 'WAITING_PARTS', hold_note: 'Fan' });
    expect(apply(resumed, { status: 'IN_PROGRESS' }).changes).toEqual({
      status: 'IN_PROGRESS',
      hold_reason: null,
      hold_note: null,
    });
  });

  it('needs a reason to hold, and clears it when leaving the hold (BR-W14)', () => {
    expect(apply(wo(), { status: 'ON_HOLD' }).error.rule).toBe('BR-W14');
    expect(apply(wo(), { status: 'ON_HOLD', hold_reason: 'WAITING_ACCESS' }).changes).toEqual({
      status: 'ON_HOLD',
      hold_reason: 'WAITING_ACCESS',
    });
    const held = wo({ status: 'ON_HOLD', hold_reason: 'WAITING_ACCESS' });
    expect(apply(held, { hold_reason: 'OTHER', hold_note: 'Key lost' }).changes).toEqual({
      hold_reason: 'OTHER',
      hold_note: 'Key lost',
    });
    expect(apply(held, { hold_reason: null }).error.rule).toBe('BR-W14');
    expect(apply(held, { status: 'OPEN' }).changes).toEqual({
      status: 'OPEN',
      hold_reason: null,
      hold_note: null,
    });
    expect(apply(started(), { hold_note: 'x' }).error.rule).toBe('BR-W14');
  });

  it('requires a work report to mark technically done, and sets the end (BR-W6)', () => {
    expect(apply(started(), { status: 'COMPLETED' }).error.rule).toBe('BR-W6');
    expect(apply(started(), { status: 'COMPLETED', work_report: '   ' }).error.rule).toBe('BR-W6');
    expect(
      apply(started({ work_report: 'Fixed' }), { status: 'COMPLETED', work_report: null }).error
        .rule,
    ).toBe('BR-W6');
    expect(apply(started({ work_report: 'Fixed' }), { status: 'COMPLETED' }).changes).toEqual({
      status: 'COMPLETED',
      completed_on: TODAY,
      completed_at: EDITED,
    });
    // A completion date given with the change is kept.
    expect(
      apply(started({ work_report: 'Fixed' }), { status: 'COMPLETED', completed_on: '2026-10-03' })
        .changes,
    ).toEqual({ status: 'COMPLETED', completed_on: '2026-10-03', completed_at: EDITED });
  });

  it('lets supervisors and admins waive the report (BR-W6)', () => {
    expect(
      apply(started(), { status: 'COMPLETED', report_waived: true }, 'SUPERVISOR').changes,
    ).toEqual({
      status: 'COMPLETED',
      report_waived: true,
      completed_on: TODAY,
      completed_at: EDITED,
    });
    expect(apply(started(), { report_waived: true }, 'SUPERVISOR').error.rule).toBe('BR-W6');
    expect(
      apply(done({ work_report: null, report_waived: 1 }), { work_report: 'Late' }).changes,
    ).toEqual({ work_report: 'Late' });
  });

  it('closes for supervisors and admins only, and sets closed_on (BR-W16)', () => {
    expect(apply(done(), { status: 'CLOSED' }).error).toMatchObject({
      rule: 'BR-W16',
      status: 403,
    });
    expect(apply(done(), { status: 'CLOSED' }, 'SUPERVISOR').changes).toEqual({
      status: 'CLOSED',
      closed_on: TODAY,
    });
    expect(apply(done(), { closed_on: TODAY }, 'SUPERVISOR').error.rule).toBe('BR-W6');
  });

  it('reopens: clears the technical end, with an active assignee (BR-W15)', () => {
    const waived = done({ work_report: null, report_waived: 1, assignee_id: 4 });
    expect(apply(waived, { status: 'IN_PROGRESS' }).changes).toEqual({
      status: 'IN_PROGRESS',
      completed_on: null,
      completed_at: null,
      report_waived: false,
    });
    expect(
      apply(waived, { status: 'IN_PROGRESS' }, 'SUPERVISOR', { assigneeActive: false }).error.rule,
    ).toBe('BR-W15');
  });

  it.each(['CLOSED', 'CANCELLED'])('keeps %s work orders read-only (BR-W7)', (status) => {
    const row = status === 'CLOSED' ? done({ status, closed_on: TODAY }) : wo({ status });
    expect(apply(row, { title: 'x' }, 'ADMIN').error.rule).toBe('BR-W7');
    expect(apply(row, { status: 'IN_PROGRESS' }, 'SUPERVISOR').error.rule).toBe('BR-W7');
  });

  it('keeps a technically done work order editable (BR-W7)', () => {
    expect(apply(done(), { actual_hours: 2, completed_on: '2026-10-02' }).changes).toEqual({
      actual_hours: 2,
      completed_on: '2026-10-02',
    });
  });

  it('lets an admin set any status, with the dates it needs (BR-W17)', () => {
    const toDone = apply(wo({ work_report: 'Done' }), { status: 'CLOSED' }, 'ADMIN');
    expect(toDone).toEqual({
      override: true,
      changes: {
        status: 'CLOSED',
        started_on: TODAY,
        first_started_at: EDITED,
        completed_on: TODAY,
        completed_at: EDITED,
        closed_on: TODAY,
      },
    });
    const closed = done({ status: 'CLOSED', closed_on: TODAY });
    expect(apply(closed, { status: 'COMPLETED' }, 'ADMIN').changes).toEqual({
      status: 'COMPLETED',
      closed_on: null,
    });
    expect(apply(closed, { status: 'OPEN' }, 'ADMIN').changes).toEqual({
      status: 'OPEN',
      completed_on: null,
      completed_at: null,
      report_waived: false,
      closed_on: null,
    });
    expect(apply(wo({ status: 'CANCELLED' }), { status: 'ON_HOLD' }, 'ADMIN').error.rule).toBe(
      'BR-W14',
    );
    expect(apply(wo(), { status: 'COMPLETED' }, 'ADMIN').error.rule).toBe('BR-W6');
    // An allowed transition is no override.
    expect(apply(wo(), { status: 'IN_PROGRESS' }, 'ADMIN').override).toBe(false);
  });

  it('never brings back a request its requester withdrew or a supervisor rejected (BR-W17)', () => {
    for (const review of ['WITHDRAWN', 'REJECTED']) {
      const row = wo({ status: 'CANCELLED', review_status: review });
      expect(apply(row, { status: 'OPEN' }, 'ADMIN').error.rule).toBe('BR-W17');
    }
  });

  it('sets first_assigned_at once (BR-W18)', () => {
    expect(apply(wo(), { assignee_id: 4 }, 'SUPERVISOR').changes).toEqual({
      assignee_id: 4,
      first_assigned_at: EDITED,
    });
    const assigned = wo({ assignee_id: 4, first_assigned_at: '2026-10-01T08:00:00.000Z' });
    expect(apply(assigned, { assignee_id: 5 }, 'SUPERVISOR').changes).toEqual({ assignee_id: 5 });
  });

  it('checks date order on the result (BR-W8)', () => {
    expect(apply(wo(), { due_on: '2026-09-30' }).error.rule).toBe('BR-W8');
    const late = started({ started_on: '2026-10-03', work_report: 'ok' });
    expect(apply(late, { status: 'COMPLETED', completed_on: '2026-10-02' }).error.rule).toBe(
      'BR-W8',
    );
    expect(apply(done(), { completed_on: '2026-10-05' }).error.rule).toBe('BR-W8');
    const closed = done({ status: 'CLOSED', closed_on: TODAY });
    expect(apply(done(), { status: 'CLOSED', closed_on: '2026-10-02' }, 'ADMIN').error.rule).toBe(
      'BR-W8',
    );
    expect(closed.status).toBe('CLOSED');
    expect(apply(wo(), { due_on: '2026-10-01' }).changes).toEqual({ due_on: '2026-10-01' });
  });
});

describe('permission matrix', () => {
  it('lets technicians change only a few fields', () => {
    expect(forbiddenFields('assets', 'TECHNICIAN', ['status', 'comment', 'name'])).toEqual([
      'name',
    ]);
    expect(
      forbiddenFields('work_orders', 'TECHNICIAN', [
        'status',
        'work_report',
        'priority',
        'assignee_id',
      ]),
    ).toEqual(['priority', 'assignee_id']);
  });

  it.each(['SUPERVISOR', 'ADMIN'])('lets %s change every editable field', (role) => {
    expect(forbiddenFields('assets', role, Object.keys(ASSET_FIELDS))).toEqual([]);
    expect(forbiddenFields('work_orders', role, Object.keys(WORK_ORDER_FIELDS))).toEqual([]);
  });

  it('refuses everything to unknown roles', () => {
    expect(forbiddenFields('assets', 'GUEST', ['status'])).toEqual(['status']);
  });

  it('only lists fields that exist', () => {
    for (const [entity, roles] of Object.entries(EDITABLE_BY_ROLE)) {
      const fields = entity === 'assets' ? ASSET_FIELDS : WORK_ORDER_FIELDS;
      for (const list of Object.values(roles))
        for (const f of list) expect(fields).toHaveProperty(f);
    }
  });

  it('limits technicians to the work orders assigned to them', () => {
    const tech = { id: 4, role: 'TECHNICIAN' };
    expect(canEditRecord('work_orders', tech, { assignee_id: 4 })).toBe(true);
    expect(canEditRecord('work_orders', tech, { assignee_id: 5 })).toBe(false);
    expect(canEditRecord('work_orders', tech, { assignee_id: null })).toBe(false);
    expect(canEditRecord('assets', tech, {})).toBe(true);
    expect(canEditRecord('work_orders', { id: 2, role: 'SUPERVISOR' }, { assignee_id: 5 })).toBe(
      true,
    );
  });

  it('restricts technicians when creating (BR-W12)', () => {
    const tech = { id: 4, role: 'TECHNICIAN' };
    expect(forbiddenCreationFields(tech, { assignee_id: 4 })).toEqual([]);
    expect(forbiddenCreationFields(tech, { assignee_id: 5, supervisor_id: 2 })).toEqual([
      'assignee_id',
      'supervisor_id',
    ]);
    expect(
      forbiddenCreationFields({ id: 2, role: 'SUPERVISOR' }, { assignee_id: 5, supervisor_id: 3 }),
    ).toEqual([]);
  });
});

describe('decideWrite (BR-V2 to BR-V4)', () => {
  it.each([
    [{ storedVersion: 3, sentVersion: 3, hasConflict: false }, 'apply'],
    [{ storedVersion: 4, sentVersion: 3, hasConflict: false }, 'conflict'],
    [{ storedVersion: 3, sentVersion: 4, hasConflict: false }, 'conflict'],
    [{ storedVersion: 3, sentVersion: 3, hasConflict: true }, 'locked'],
    [{ storedVersion: 4, sentVersion: 3, hasConflict: true }, 'locked'],
  ])('%o → %s', (input, expected) => {
    expect(decideWrite(input)).toBe(expected);
  });
});

describe('work order creation', () => {
  const now = new Date('2026-10-04T12:00:00Z');

  it('dates the work order from the edit time, in the app time zone (BR-W9)', () => {
    expect(creationDate(undefined, now, 'Europe/Paris')).toEqual({ date: '2026-10-04' });
    expect(creationDate('2026-10-02T23:30:00Z', now, 'Europe/Paris')).toEqual({
      date: '2026-10-03',
    });
    expect(creationDate('2026-10-04T12:00:30Z', now, 'Europe/Paris')).toEqual({
      date: '2026-10-04',
    });
  });

  it('rejects edit times in the future or more than 30 days old', () => {
    expect(creationDate('2026-10-04T12:05:00Z', now, 'UTC').error.rule).toBe('BR-W9');
    expect(creationDate('2026-09-03T12:00:00Z', now, 'UTC').error.rule).toBe('BR-W9');
    expect(creationDate('2026-09-05T12:00:00Z', now, 'UTC').date).toBe('2026-09-05');
  });

  it('numbers work orders per year (BR-W10)', () => {
    expect(nextWorkOrderNumber('2026', 'WO-2026-00200')).toBe('WO-2026-00201');
    expect(nextWorkOrderNumber('2027', null)).toBe('WO-2027-00001');
    expect(nextWorkOrderNumber('2026', 'WO-2026-09999')).toBe('WO-2026-10000');
  });
});
