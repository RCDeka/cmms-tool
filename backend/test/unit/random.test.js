import { describe, expect, it } from 'vitest';
import { createRandom } from '../../src/db/seed/random.js';

describe('createRandom', () => {
  it('is deterministic for a given seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(createRandom(43).next()).not.toBe(seqA[0]);
  });

  it('keeps int() within bounds and covers them', () => {
    const rng = createRandom(1);
    const seen = new Set(Array.from({ length: 500 }, () => rng.int(1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('never picks a zero-weight value and shuffles without losing items', () => {
    const rng = createRandom(7);
    for (let i = 0; i < 200; i++) {
      expect(
        rng.weighted([
          ['never', 0],
          ['always', 1],
        ]),
      ).toBe('always');
    }
    const items = [1, 2, 3, 4, 5, 6];
    expect(rng.shuffle(items).sort()).toEqual(items);
  });
});
