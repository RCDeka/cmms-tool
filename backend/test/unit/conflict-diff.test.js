import { describe, expect, it } from 'vitest';
import { divergentFields, sameValue, snapshotToApi } from '../../src/rules/conflict-diff.js';

describe('snapshotToApi', () => {
  it('turns stored 0/1 booleans into true/false', () => {
    expect(
      snapshotToApi('assets', { maintenance_contract: 1, has_conflict: 0, name: 'x' }),
    ).toEqual({
      maintenance_contract: true,
      has_conflict: false,
      name: 'x',
    });
  });
});

describe('divergentFields (BR-V6)', () => {
  const a = { status: 'IN_SERVICE', comment: null, maintenance_contract: true, floor: 'L2' };

  it('lists only the client fields whose value differs from version A', () => {
    expect(divergentFields(a, { status: 'BROKEN_DOWN', floor: 'L2' })).toEqual(['status']);
    expect(divergentFields(a, { comment: 'New', maintenance_contract: false })).toEqual([
      'comment',
      'maintenance_contract',
    ]);
  });

  it('treats empty text, null and missing values as the same', () => {
    expect(divergentFields(a, { comment: '' })).toEqual([]);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue(0, null)).toBe(false);
  });
});
