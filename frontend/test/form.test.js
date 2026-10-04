import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCreateForm, buildEditForm, sameValue } from '../assets/js/form.js';

const refs = {
  sites: ['Lyon Part-Dieu Branch', 'Saclay Data Center'],
  users: [
    { id: 2, first_name: 'Julien', last_name: 'Bernard', role: 'SUPERVISOR' },
    { id: 4, first_name: 'Karim', last_name: 'Benali', role: 'TECHNICIAN' },
  ],
};
const asset = {
  id: 42,
  code: 'AST-0042',
  name: 'Chiller',
  site: 'Saclay Data Center',
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
      'CLOSED',
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
    type($('#f-status'), 'CLOSED');
    type($('#f-work_report'), 'Replaced the valve');
    type($('#f-actual_hours'), '1.5');
    type($('#f-assignee_id'), '2');
    expect(form.getChanges().changes).toEqual({
      status: 'CLOSED',
      work_report: 'Replaced the valve',
      actual_hours: 1.5,
      assignee_id: 2,
    });
    type($('#f-work_report'), '   ');
    expect(form.getChanges().changes).not.toHaveProperty('work_report');
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
    'site',
    'category',
    'description',
    'due_on',
  ];

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
    type($('#f-site'), 'Lyon Part-Dieu Branch');
    expect(form.getValues()).toEqual({
      values: {
        title: 'Noise in plant room',
        type: 'CORRECTIVE',
        priority: 'NORMAL',
        site: 'Lyon Part-Dieu Branch',
      },
      invalid: [],
    });
  });

  it('resolves an asset code, takes its site and locks the site', async () => {
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
      expect($('#f-asset_id-hint').textContent).toBe('AST-0042 — Chiller (Saclay Data Center)'),
    );
    expect($('#f-site').value).toBe('Saclay Data Center');
    expect($('#f-site').disabled).toBe(true);
    expect(form.getValues().values).toMatchObject({ asset_id: 42, site: 'Saclay Data Center' });

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
