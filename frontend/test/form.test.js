// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCreateForm, buildEditForm, sameValue } from '../assets/js/form.js';
import { TREE } from './fixtures/places.js';

const refs = {
  sites: ['Lyon Part-Dieu Branch', 'Paris HQ'],
  places: TREE,
  users: [
    { id: 2, first_name: 'Julien', last_name: 'Bernard', role: 'SUPERVISOR' },
    { id: 4, first_name: 'Karim', last_name: 'Benali', role: 'TECHNICIAN' },
  ],
};
const asset = {
  id: 42,
  code: 'AST-0042',
  name: 'Chiller',
  site: 'Paris HQ',
  location_id: 25,
  place: 'Tower A › B1 › Plant room B1',
  category: 'HVAC',
};
const ctx = (extra = {}) => ({
  refs,
  findAssetByCode: vi.fn(async (code) => (code.toUpperCase() === 'AST-0042' ? asset : null)),
  findAssetById: vi.fn(async (id) => (id === 42 ? asset : null)),
  onChange: vi.fn(),
  ...extra,
});

const workOrder = {
  id: 9,
  number: 'WO-2026-00009',
  title: 'Leak',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  type: 'CORRECTIVE',
  category: null,
  site: 'Lyon Part-Dieu Branch',
  asset_id: null,
  asset: null,
  assignee_id: 4,
  assignee: { id: 4, first_name: 'Karim', last_name: 'Benali' },
  supervisor_id: null,
  supervisor: null,
  created_on: '2026-10-01',
  started_on: '2026-10-02',
  actual_hours: null,
  work_report: null,
  version: 3,
};

let host;
beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = document.getElementById('host');
});

const $ = (sel) => host.querySelector(sel);
const type = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('buildEditForm', () => {
  it('gives each editable field a labelled control and shows the others as text', () => {
    const form = buildEditForm({
      entity: 'work_orders',
      record: workOrder,
      editable: ['status', 'started_on', 'actual_hours', 'work_report'],
      ctx: ctx(),
      onSave() {},
      onDiscard() {},
    });
    host.append(form.form);
    expect($('label[for="f-status"]').textContent).toBe('Status');
    expect([...$('#f-status').options].map((o) => o.value)).toEqual([
      'IN_PROGRESS',
      'ON_HOLD',
      'COMPLETED',
      'CANCELLED',
    ]);
    expect($('#f-started_on').type).toBe('date');
    expect($('#f-actual_hours').type).toBe('number');
    expect($('#f-work_report').tagName).toBe('TEXTAREA');
    expect($('#f-title')).toBeNull(); // not editable for this user
    expect(host.textContent).toContain('Leak');
  });

  it('reports only changed fields, with empty text as null', () => {
    const form = buildEditForm({
      entity: 'work_orders',
      record: workOrder,
      editable: ['status', 'work_report', 'actual_hours', 'assignee_id'],
      ctx: ctx(),
      onSave() {},
      onDiscard() {},
    });
    host.append(form.form);
    expect(form.getChanges()).toEqual({ changes: {}, invalid: [] });
    type($('#f-status'), 'COMPLETED');
    type($('#f-work_report'), 'Replaced the valve');
    type($('#f-actual_hours'), '1.5');
    type($('#f-assignee_id'), '2');
    expect(form.getChanges().changes).toEqual({
      status: 'COMPLETED',
      work_report: 'Replaced the valve',
      actual_hours: 1.5,
      assignee_id: 2,
    });
    type($('#f-work_report'), '   ');
    expect(form.getChanges().changes).not.toHaveProperty('work_report');
  });

  it('asks for the hold reason and note while the status is On hold (BR-W14)', () => {
    const form = buildEditForm({
      entity: 'work_orders',
      record: workOrder,
      editable: ['status', 'hold_reason', 'hold_note'],
      ctx: ctx({ user: { id: 2, role: 'SUPERVISOR' } }),
      onSave() {},
      onDiscard() {},
    });
    host.append(form.form);
    const row = (field) => $(`#f-${field}`).closest('.form-row');
    expect(row('hold_reason').hidden).toBe(true);
    expect(row('hold_note').hidden).toBe(true);
    type($('#f-status'), 'ON_HOLD');
    expect(row('hold_reason').hidden).toBe(false);
    expect([...$('#f-hold_reason').options].map((o) => o.value)).toEqual([
      '',
      'WAITING_PARTS',
      'WAITING_CONTRACTOR',
      'WAITING_ACCESS',
      'WAITING_APPROVAL',
      'OTHER',
    ]);
    type($('#f-hold_reason'), 'WAITING_ACCESS');
    type($('#f-hold_note'), 'Room locked');
    expect(form.getChanges().changes).toEqual({
      status: 'ON_HOLD',
      hold_reason: 'WAITING_ACCESS',
      hold_note: 'Room locked',
    });
  });

  it('offers closing to supervisors, and every status to admins (BR-W16, BR-W17)', () => {
    const options = (user, record = { ...workOrder, status: 'COMPLETED' }) => {
      host.replaceChildren(
        buildEditForm({
          entity: 'work_orders',
          record,
          editable: ['status'],
          ctx: ctx({ user }),
          onSave() {},
          onDiscard() {},
        }).form,
      );
      return [...$('#f-status').options].map((o) => o.value);
    };
    expect(options({ id: 4, role: 'TECHNICIAN' })).toEqual(['COMPLETED', 'IN_PROGRESS']);
    expect(options({ id: 2, role: 'SUPERVISOR' })).toEqual(['COMPLETED', 'CLOSED', 'IN_PROGRESS']);
    expect(options({ id: 1, role: 'ADMIN' }, { ...workOrder, status: 'CLOSED' })).toEqual([
      'CLOSED',
      'OPEN',
      'IN_PROGRESS',
      'ON_HOLD',
      'COMPLETED',
      'CANCELLED',
    ]);
  });

  it('enables Save and Discard only when something changed', () => {
    const form = buildEditForm({
      entity: 'work_orders',
      record: workOrder,
      editable: ['status'],
      ctx: ctx(),
      onSave() {},
      onDiscard() {},
    });
    host.append(form.form);
    const save = $('button[type="submit"]');
    expect(save.disabled).toBe(true);
    form.setDirty(true);
    expect(save.disabled).toBe(false);
  });

  it('shows errors next to the fields and marks them invalid', () => {
    const form = buildEditForm({
      entity: 'work_orders',
      record: workOrder,
      editable: ['work_report'],
      ctx: ctx(),
      onSave() {},
      onDiscard() {},
    });
    host.append(form.form);
    form.setErrors({ work_report: 'Required' }, 'Check the highlighted fields.');
    expect($('#f-work_report').getAttribute('aria-invalid')).toBe('true');
    expect($('#f-work_report-error').textContent).toBe('Required');
    expect($('#f-work_report').getAttribute('aria-describedby')).toContain('f-work_report-error');
    expect($('.form-summary').textContent).toBe('Check the highlighted fields.');
    form.setErrors({});
    expect($('#f-work_report').hasAttribute('aria-invalid')).toBe(false);
  });

  it('clears a field error as soon as the user edits the field', () => {
    const form = buildEditForm({
      entity: 'work_orders',
      record: workOrder,
      editable: ['work_report'],
      ctx: ctx(),
      onSave() {},
      onDiscard() {},
    });
    host.append(form.form);
    form.setErrors({ work_report: 'Required' });
    type($('#f-work_report'), 'Fixed');
    expect($('#f-work_report').hasAttribute('aria-invalid')).toBe(false);
    expect($('#f-work_report-error').textContent).toBe('');
  });

  it('edits the planned week as a week field for supervisors, read-only for technicians (D55)', async () => {
    const { EDITABLE_BY_ROLE } = await import('../assets/js/rules.js');
    const record = { ...workOrder, planned_week: '2026-W43' };
    const form = buildEditForm({
      entity: 'work_orders',
      record,
      editable: EDITABLE_BY_ROLE.work_orders.SUPERVISOR,
      ctx: ctx(),
      onSave() {},
      onDiscard() {},
    });
    host.append(form.form);
    const week = $('#f-planned_week');
    expect(week.type).toBe('week');
    expect(week.value).toBe('2026-W43');
    expect(host.querySelector('label[for="f-planned_week"]').textContent).toContain('Planned week');
    type(week, '2026-W45');
    expect(form.getChanges().changes).toEqual({ planned_week: '2026-W45' });
    type(week, '');
    expect(form.getChanges().changes).toEqual({ planned_week: null });

    host.replaceChildren();
    const tech = buildEditForm({
      entity: 'work_orders',
      record,
      editable: EDITABLE_BY_ROLE.work_orders.TECHNICIAN,
      ctx: ctx(),
      onSave() {},
      onDiscard() {},
    });
    host.append(tech.form);
    expect($('#f-planned_week')).toBeNull();
    expect(host.textContent).toContain('Week 43, 2026');
  });

  it('turns a booleans into a checkbox for assets', () => {
    const form = buildEditForm({
      entity: 'assets',
      record: { id: 1, name: 'A', site: 'Lyon Part-Dieu Branch', maintenance_contract: true },
      editable: ['maintenance_contract'],
      ctx: ctx(),
      onSave() {},
      onDiscard() {},
    });
    host.append(form.form);
    $('#f-maintenance_contract').click();
    expect(form.getChanges().changes).toEqual({ maintenance_contract: false });
  });
});

describe('buildCreateForm', () => {
  const fields = [
    'title',
    'type',
    'priority',
    'asset_id',
    'location_id',
    'category',
    'description',
    'due_on',
  ];
  /** Chooses `value` in the list of the place picker at `level`. */
  const choose = (level, value) => {
    const list = host.querySelectorAll('.place-picker-fields select')[level];
    list.value = String(value);
    list.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('starts with defaults and returns only filled values', () => {
    const form = buildCreateForm({
      fields,
      values: {},
      ctx: ctx(),
      submitLabel: 'Create',
      onSubmit() {},
    });
    host.append(form.form);
    type($('#f-title'), 'Noise in plant room');
    // The place, level by level from the site (D82).
    choose(0, 1);
    expect(form.getValues().values.location_id).toBe(1);
    choose(1, 10);
    choose(2, 13);
    expect(form.getValues()).toEqual({
      values: {
        title: 'Noise in plant room',
        type: 'CORRECTIVE',
        priority: 'NORMAL',
        location_id: 13,
      },
      invalid: [],
    });
  });

  it('resolves an asset code, takes its place and locks the place', async () => {
    const form = buildCreateForm({
      fields,
      values: {},
      ctx: ctx(),
      submitLabel: 'Create',
      onSubmit() {},
    });
    host.append(form.form);
    type($('#f-asset_id'), 'ast-0042');
    await vi.waitFor(() =>
      expect($('#f-asset_id-hint').textContent).toBe('AST-0042 — Chiller (Paris HQ)'),
    );
    const lists = [...host.querySelectorAll('.place-picker-fields select')];
    expect(lists.map((l) => l.value)).toEqual(['2', '20', '24', '25']);
    expect(lists.every((l) => l.disabled)).toBe(true);
    expect(form.getValues().values).toMatchObject({ asset_id: 42, location_id: 25 });

    type($('#f-asset_id'), 'AST-9999');
    await vi.waitFor(() => expect($('#f-asset_id-hint').textContent).toBe('Unknown asset code'));
    expect(form.getValues().invalid).toEqual(['asset_id']);
  });

  it('does not offer people to technicians', () => {
    const form = buildCreateForm({
      fields,
      values: {},
      ctx: ctx(),
      submitLabel: 'Create',
      onSubmit() {},
    });
    host.append(form.form);
    expect($('#f-assignee_id')).toBeNull();
  });
});

describe('sameValue', () => {
  it('treats null, undefined and empty text as equal', () => {
    expect(sameValue(null, '')).toBe(true);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue(0, null)).toBe(false);
    expect(sameValue('a', 'a')).toBe(true);
  });
});

describe('asset creation form', () => {
  const fields = [
    'code',
    'name',
    'location_id',
    'category',
    'criticality',
    'status',
    'maintenance_contract',
  ];

  it('asks for a place of the tree, found by searching its path (D82)', () => {
    const form = buildCreateForm({
      entity: 'assets',
      fields,
      values: {},
      ctx: ctx(),
      submitLabel: 'Create asset',
      onSubmit() {},
      onlineOnly: true,
    });
    host.append(form.form);
    expect(host.querySelector('label[for="f-location_id"] .required')).not.toBeNull();
    expect([...$('#f-location_id').options].map((o) => o.textContent)).toEqual([
      '— Choose —',
      'Lyon Part-Dieu Branch',
      'Paris HQ',
    ]);
    type($('#f-location_id-search'), 'tower 12.1');
    const found = [...host.querySelectorAll('.place-picker-result')];
    expect(found.map((b) => b.textContent)).toEqual([
      'Paris HQ › Tower A › L12 › Meeting room 12.10',
    ]);
    found[0].click();
    expect(form.getValues().values.location_id).toBe(23);
    expect([...host.querySelectorAll('.place-picker-fields select')].map((l) => l.value)).toEqual([
      '2',
      '20',
      '21',
      '23',
    ]);
  });

  it('starts required lists on "— Choose —" and keeps the default status', () => {
    const form = buildCreateForm({
      entity: 'assets',
      fields,
      values: {},
      ctx: ctx(),
      submitLabel: 'Create asset',
      onSubmit() {},
    });
    host.append(form.form);
    expect($('#f-category').value).toBe('');
    expect($('#f-category').options[0].textContent).toBe('— Choose —');
    expect($('#f-status').value).toBe('IN_SERVICE');
    expect(form.getValues().values).toEqual({ status: 'IN_SERVICE', maintenance_contract: false });
    expect(host.querySelector('label[for="f-criticality"] .required')).not.toBeNull();
  });

  it('marks the submit button as needing a connection', () => {
    const form = buildCreateForm({
      entity: 'assets',
      fields,
      values: {},
      ctx: ctx(),
      submitLabel: 'Create asset',
      onSubmit() {},
      onlineOnly: true,
    });
    expect(form.form.querySelector('button[type="submit"]').classList.contains('online-only')).toBe(
      true,
    );
  });
});
