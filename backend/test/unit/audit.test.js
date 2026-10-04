import { describe, expect, it } from 'vitest';
import { auditLabel, creationChanges, diffChanges } from '../../src/rules/audit.js';

describe('diffChanges', () => {
  it('keeps only fields whose value changes, with both values', () => {
    expect(
      diffChanges(
        { status: 'OPEN', title: 'Leak', due_on: null },
        { status: 'IN_PROGRESS', title: 'Leak', due_on: '' },
      ),
    ).toEqual({
      status: { from: 'OPEN', to: 'IN_PROGRESS' },
    });
  });

  it('treats missing values as null on both sides', () => {
    expect(diffChanges({}, { comment: 'New' })).toEqual({ comment: { from: null, to: 'New' } });
    expect(diffChanges({ comment: 'Old' }, { comment: null })).toEqual({
      comment: { from: 'Old', to: null },
    });
    expect(diffChanges({ maintenance_contract: true }, { maintenance_contract: false })).toEqual({
      maintenance_contract: { from: true, to: false },
    });
  });
});

describe('creationChanges', () => {
  it('lists every field that has a value', () => {
    expect(
      creationChanges({ code: 'AST-0501', comment: null, floor: '', status: 'IN_SERVICE' }),
    ).toEqual({
      code: { from: null, to: 'AST-0501' },
      status: { from: null, to: 'IN_SERVICE' },
    });
  });
});

describe('auditLabel', () => {
  it('names records the way people know them', () => {
    expect(auditLabel('assets', { code: 'AST-0001', name: 'Chiller' })).toBe('AST-0001 — Chiller');
    expect(auditLabel('work_orders', { number: 'WO-2026-00001', title: 'Leak' })).toBe(
      'WO-2026-00001 — Leak',
    );
    expect(auditLabel('users', { first_name: 'Ada', last_name: 'Byron', username: 'ada' })).toBe(
      'Ada Byron (ada)',
    );
  });
});
