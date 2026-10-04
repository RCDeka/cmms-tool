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
const wo = (o = {}) => ({
  status: 'OPEN',
  created_on: '2026-10-01',
  due_on: null,
  started_on: null,
  closed_on: null,
  work_report: null,
  ...o,
});

describe('status transitions (BR-W4)', () => {
  const allowed = new Set([
    'OPEN>IN_PROGRESS',
    'OPEN>CANCELLED',
    'IN_PROGRESS>ON_HOLD',
    'IN_PROGRESS>CLOSED',
    'IN_PROGRESS>CANCELLED',
    'ON_HOLD>IN_PROGRESS',
    'ON_HOLD>CANCELLED',
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
});

describe('applyWorkOrderRules', () => {
  it('rejects forbidden transitions (BR-W4)', () => {
    expect(applyWorkOrderRules(wo(), { status: 'CLOSED' }, TODAY).error.rule).toBe('BR-W4');
  });

  it('sets started_on the first time the order starts (BR-W5)', () => {
    expect(applyWorkOrderRules(wo(), { status: 'IN_PROGRESS' }, TODAY).changes).toEqual({
      status: 'IN_PROGRESS',
      started_on: TODAY,
    });
    const resumed = wo({ status: 'ON_HOLD', started_on: '2026-10-02' });
    expect(applyWorkOrderRules(resumed, { status: 'IN_PROGRESS' }, TODAY).changes).toEqual({
      status: 'IN_PROGRESS',
    });
  });

  it('requires a work report to close and sets closed_on (BR-W6)', () => {
    const started = wo({ status: 'IN_PROGRESS', started_on: '2026-10-02' });
    expect(applyWorkOrderRules(started, { status: 'CLOSED' }, TODAY).error.rule).toBe('BR-W6');
    expect(
      applyWorkOrderRules(started, { status: 'CLOSED', work_report: '   ' }, TODAY).error.rule,
    ).toBe('BR-W6');
    expect(
      applyWorkOrderRules(
        { ...started, work_report: 'Fixed' },
        { status: 'CLOSED', work_report: null },
        TODAY,
      ).error.rule,
    ).toBe('BR-W6');
    expect(
      applyWorkOrderRules({ ...started, work_report: 'Fixed' }, { status: 'CLOSED' }, TODAY)
        .changes,
    ).toEqual({
      status: 'CLOSED',
      closed_on: TODAY,
    });
  });

  it.each(['CLOSED', 'CANCELLED'])('keeps %s work orders read-only (BR-W7)', (status) => {
    expect(applyWorkOrderRules(wo({ status }), { title: 'x' }, TODAY).error.rule).toBe('BR-W7');
  });

  it('checks date order on the result (BR-W8)', () => {
    expect(applyWorkOrderRules(wo(), { due_on: '2026-09-30' }, TODAY).error.rule).toBe('BR-W8');
    const started = wo({ status: 'IN_PROGRESS', started_on: '2026-10-03', work_report: 'ok' });
    expect(applyWorkOrderRules(started, { closed_on: '2026-10-02' }, TODAY).error.rule).toBe(
      'BR-W8',
    );
    expect(applyWorkOrderRules(wo(), { due_on: '2026-10-01' }, TODAY).changes).toEqual({
      due_on: '2026-10-01',
    });
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
