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

  it('gives technicians a few fields on their own open work orders only', () => {
    expect(editableFields('work_orders', tech, { status: 'OPEN', assignee_id: 4 })).toEqual([
      'status',
      'started_on',
      'actual_hours',
      'work_report',
    ]);
    expect(editableFields('work_orders', tech, { status: 'OPEN', assignee_id: 5 })).toEqual([]);
  });

  it('makes terminal work orders and records in conflict read-only', () => {
    expect(editableFields('work_orders', sup, { status: 'CLOSED' })).toEqual([]);
    expect(editableFields('work_orders', sup, { status: 'CANCELLED' })).toEqual([]);
    expect(editableFields('assets', sup, { has_conflict: true })).toEqual([]);
    expect(editableFields('assets', sup, { has_conflict: false })).toContain('name');
  });
});

describe('statusOptions', () => {
  it('offers the current status and its allowed next ones', () => {
    expect(statusOptions('OPEN')).toEqual(['OPEN', 'IN_PROGRESS', 'CANCELLED']);
    expect(statusOptions('ON_HOLD')).toEqual(['ON_HOLD', 'IN_PROGRESS', 'CANCELLED']);
  });
});

describe('checks before saving', () => {
  const wo = { status: 'IN_PROGRESS', created_on: '2026-10-01', work_report: null };

  it('requires a work report to close (BR-W6)', () => {
    expect(checkBeforeSave('work_orders', wo, { status: 'CLOSED' })).toHaveProperty('work_report');
    expect(checkBeforeSave('work_orders', wo, { status: 'CLOSED', work_report: 'Done' })).toEqual(
      {},
    );
  });

  it('checks required fields and date order', () => {
    expect(checkBeforeSave('assets', {}, { name: '  ' })).toEqual({ name: 'Required' });
    expect(checkBeforeSave('work_orders', wo, { due_on: '2026-09-30' })).toHaveProperty('due_on');
  });

  it('requires a title, a type and an asset or a site to create', () => {
    expect(checkBeforeCreate({})).toEqual({
      title: 'Required',
      type: 'Required',
      site: 'Choose an asset or a site',
    });
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
      site: 'Required',
      category: 'Required',
      criticality: 'Required',
    });
    const ok = { name: 'Chiller', site: 'Lyon', category: 'HVAC', criticality: 'LOW' };
    expect(checkBeforeCreateAsset({ ...ok, code: 'cta-01' })).toEqual({});
    expect(checkBeforeCreateAsset({ ...ok, code: 'AST 01' })).toHaveProperty('code');
  });
});
