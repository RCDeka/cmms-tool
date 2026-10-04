import { describe, expect, it } from 'vitest';
import {
  ASSET_CODE,
  deletionBlocker,
  nextAssetCode,
  normalizeAssetCode,
} from '../../src/rules/asset-creation.js';

describe('asset codes (BR-A1, BR-A4)', () => {
  it('numbers automatic codes after the highest one', () => {
    expect(nextAssetCode(500)).toBe('AST-0501');
    expect(nextAssetCode(null)).toBe('AST-0001');
    expect(nextAssetCode(9999)).toBe('AST-10000');
  });

  it('normalizes typed codes and accepts tags only', () => {
    expect(normalizeAssetCode('  cta-paris-03 ')).toBe('CTA-PARIS-03');
    for (const ok of ['AST-0042', 'CTA-PARIS-03', 'UPS2'])
      expect(ASSET_CODE.test(ok), ok).toBe(true);
    for (const bad of ['A', '-AST', 'AST 42', 'ast-1', 'AST_1', 'É-1'])
      expect(ASSET_CODE.test(bad), bad).toBe(false);
  });
});

describe('deletionBlocker (BR-A3)', () => {
  const asset = { version: 3, has_conflict: 0 };
  it('allows deleting an unused asset at the version the user saw', () => {
    expect(deletionBlocker(asset, { version: 3, workOrders: 0 })).toBeNull();
  });
  it('refuses a stale version, an open conflict, or any work order', () => {
    expect(deletionBlocker(asset, { version: 2, workOrders: 0 }).rule).toBe('BR-V1');
    expect(deletionBlocker({ ...asset, has_conflict: 1 }, { version: 3, workOrders: 0 }).rule).toBe(
      'BR-V4',
    );
    const withHistory = deletionBlocker(asset, { version: 3, workOrders: 2 });
    expect(withHistory.rule).toBe('BR-A3');
    expect(withHistory.message).toMatch(/2 work orders.*Out of service/);
  });
});
