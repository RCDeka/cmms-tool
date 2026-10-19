// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as backendPermissions from '../../backend/src/rules/permissions.js';
import * as backendStatus from '../../backend/src/rules/work-order-status.js';
import { WORK_ORDER_FIELDS } from '../../backend/src/rules/fields.js';
import {
  canManageAssets,
  checkBeforeCreateAsset,
  CREATION_FIELDS,
  EDITABLE_BY_ROLE,
  TRANSITIONS,
  checkBeforeCreate,
  checkBeforeSave,
  editableFields,
  isOverride,
  statusActions,
  statusOptions,
} from '../assets/js/rules.js';

describe('copies of the backend rules', () => {
  it('has the same status transitions', () => {
    expect(TRANSITIONS).toEqual(backendStatus.TRANSITIONS);
  });

  it('has the same permission matrix', () => {
    expect(EDITABLE_BY_ROLE).toEqual(backendPermissions.EDITABLE_BY_ROLE);
  });

  it('offers only fields the server accepts at creation', () => {
    for (const fields of Object.values(CREATION_FIELDS)) {
      for (const f of fields) expect(WORK_ORDER_FIELDS).toHaveProperty(f);
    }
    expect(CREATION_FIELDS.TECHNICIAN).not.toContain('assignee_id');
    expect(CREATION_FIELDS.TECHNICIAN).not.toContain('supervisor_id');
  });
});

describe('editableFields', () => {
  const tech = { id: 4, role: 'TECHNICIAN' };
  const sup = { id: 2, role: 'SUPERVISOR' };
  const admin = { id: 1, role: 'ADMIN' };

  it('gives technicians a few fields on their own open work orders only', () => {
    expect(editableFields('work_orders', tech, { status: 'OPEN', assignee_id: 4 })).toEqual([
      'status',
      'started_on',
      'completed_on',
      'actual_hours',
      'work_report',
      'hold_reason',
      'hold_note',
    ]);
    expect(editableFields('work_orders', tech, { status: 'OPEN', assignee_id: 5 })).toEqual([]);
  });

  it('makes terminal work orders and records in conflict read-only', () => {
    expect(editableFields('work_orders', sup, { status: 'CLOSED' })).toEqual([]);
    expect(editableFields('work_orders', sup, { status: 'CANCELLED' })).toEqual([]);
    expect(editableFields('assets', sup, { has_conflict: true })).toEqual([]);
    expect(editableFields('assets', sup, { has_conflict: false })).toContain('name');
  });

  it('lets an admin still move a closed or cancelled one, not a withdrawn request (BR-W17)', () => {
    expect(editableFields('work_orders', admin, { status: 'CLOSED' })).toEqual([
      'status',
      'hold_reason',
      'hold_note',
    ]);
    expect(
      editableFields('work_orders', admin, { status: 'CANCELLED', review_status: 'WITHDRAWN' }),
    ).toEqual([]);
  });
});

describe('statusOptions', () => {
  const tech = { id: 4, role: 'TECHNICIAN' };
  const sup = { id: 2, role: 'SUPERVISOR' };

  it('offers the current status and its allowed next ones', () => {
    expect(statusOptions({ status: 'OPEN' }, tech)).toEqual([
      'OPEN',
      'IN_PROGRESS',
      'ON_HOLD',
      'CANCELLED',
    ]);
    expect(statusOptions({ status: 'ON_HOLD' }, tech)).toEqual([
      'ON_HOLD',
      'OPEN',
      'IN_PROGRESS',
      'CANCELLED',
    ]);
    // Started: no way back to OPEN (BR-W5).
    expect(
      statusOptions({ status: 'ON_HOLD', first_started_at: '2026-10-02T08:00:00Z' }, tech),
    ).toEqual(['ON_HOLD', 'IN_PROGRESS', 'CANCELLED']);
  });

  it('keeps the closing for supervisors and admins (BR-W16)', () => {
    expect(statusOptions({ status: 'COMPLETED' }, tech)).toEqual(['COMPLETED', 'IN_PROGRESS']);
    expect(statusOptions({ status: 'COMPLETED' }, sup)).toEqual([
      'COMPLETED',
      'CLOSED',
      'IN_PROGRESS',
    ]);
  });

  it('marks an admin change outside the steps as an override (BR-W17)', () => {
    const admin = { id: 1, role: 'ADMIN' };
    expect(isOverride({ status: 'OPEN' }, 'IN_PROGRESS', admin)).toBe(false);
    expect(isOverride({ status: 'OPEN' }, 'CLOSED', admin)).toBe(true);
    expect(isOverride({ status: 'CLOSED' }, 'COMPLETED', admin)).toBe(true);
    expect(isOverride({ status: 'OPEN' }, 'CLOSED', sup)).toBe(false);
  });
});

describe('statusActions', () => {
  const tech = { id: 4, role: 'TECHNICIAN' };
  const sup = { id: 2, role: 'SUPERVISOR' };
  const admin = { id: 1, role: 'ADMIN' };
  const keys = (record, user) => statusActions(record, user).map((a) => a.key);

  it('follows BR-W4 and the role', () => {
    const started = { status: 'IN_PROGRESS', assignee_id: 4, work_report: null };
    expect(keys(started, tech)).toEqual(['hold', 'complete']);
    expect(keys(started, sup)).toEqual(['hold', 'complete', 'waive']);
    expect(keys({ ...started, work_report: 'Done' }, sup)).toEqual(['hold', 'complete']);
    const done = { status: 'COMPLETED', assignee_id: 4, work_report: 'Done' };
    expect(keys(done, tech)).toEqual(['reopen']);
    expect(keys(done, sup)).toEqual(['close', 'reopen']);
    expect(keys({ status: 'CLOSED' }, admin)).toEqual(['override']);
    expect(keys({ status: 'CLOSED' }, sup)).toEqual([]);
    expect(keys({ ...started, assignee_id: 5 }, tech)).toEqual([]);
  });

  it('waives the report with the technical end (BR-W6)', () => {
    const [, , waive] = statusActions({ status: 'IN_PROGRESS', work_report: '' }, sup);
    expect(waive).toEqual({ key: 'waive', status: 'COMPLETED', waive: true });
  });
});

describe('checks before saving', () => {
  const wo = { status: 'IN_PROGRESS', created_on: '2026-10-01', work_report: null };

  it('requires a work report, or its waiver, to mark technically done (BR-W6)', () => {
    expect(checkBeforeSave('work_orders', wo, { status: 'COMPLETED' })).toHaveProperty(
      'work_report',
    );
    expect(
      checkBeforeSave('work_orders', wo, { status: 'COMPLETED', work_report: 'Done' }),
    ).toEqual({});
    expect(
      checkBeforeSave('work_orders', wo, { status: 'COMPLETED', report_waived: true }),
    ).toEqual({});
  });

  it('requires a hold reason (BR-W14)', () => {
    expect(checkBeforeSave('work_orders', wo, { status: 'ON_HOLD' })).toHaveProperty('hold_reason');
    expect(
      checkBeforeSave('work_orders', wo, { status: 'ON_HOLD', hold_reason: 'WAITING_PARTS' }),
    ).toEqual({});
  });

  it('checks required fields and date order', () => {
    expect(checkBeforeSave('assets', {}, { name: '  ' })).toEqual({ name: 'Required' });
    expect(checkBeforeSave('work_orders', wo, { due_on: '2026-09-30' })).toHaveProperty('due_on');
  });

  it('requires a title, a type and an asset or a place to create', () => {
    expect(checkBeforeCreate({})).toEqual({
      title: 'Required',
      type: 'Required',
      location_id: 'Choose an asset or a place',
    });
    expect(checkBeforeCreate({ title: 'x', type: 'CORRECTIVE', location_id: 3 })).toEqual({});
    expect(checkBeforeCreate({ title: 'x', type: 'CORRECTIVE', asset_id: 3 })).toEqual({});
  });
});

describe('asset creation', () => {
  it('lets supervisors and admins manage assets', () => {
    expect(canManageAssets({ role: 'SUPERVISOR' })).toBe(true);
    expect(canManageAssets({ role: 'ADMIN' })).toBe(true);
    expect(canManageAssets({ role: 'TECHNICIAN' })).toBe(false);
    expect(canManageAssets(null)).toBe(false);
  });

  it('checks required fields and the code format', () => {
    expect(checkBeforeCreateAsset({})).toEqual({
      name: 'Required',
      category: 'Required',
      criticality: 'Required',
      location_id: 'Required',
    });
    const ok = { name: 'Chiller', location_id: 3, category: 'HVAC', criticality: 'LOW' };
    expect(checkBeforeCreateAsset({ ...ok, code: 'cta-01' })).toEqual({});
    expect(checkBeforeCreateAsset({ ...ok, code: 'AST 01' })).toHaveProperty('code');
  });
});
