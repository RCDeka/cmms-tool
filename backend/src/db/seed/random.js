// Deterministic pseudo-random generator for the seed: the same seed gives the same data.

/**
 * @param {number} seed
 */
export function createRandom(seed) {
  // mulberry32: small, fast, good enough for mock data.
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Integer in [min, max]. */
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));

  /** @template T @param {T[]} items @returns {T} */
  const pick = (items) => items[Math.floor(next() * items.length)];

  /** @param {number} probability between 0 and 1 */
  const chance = (probability) => next() < probability;

  /**
   * Picks a value according to weights.
   * @template T @param {Array<[T, number]>} entries [value, weight] pairs
   * @returns {T}
   */
  const weighted = (entries) => {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = next() * total;
    for (const [value, w] of entries) {
      r -= w;
      if (r < 0) return value;
    }
    return entries[entries.length - 1][0];
  };

  /** Fisher-Yates shuffle, returns a new array. @template T @param {T[]} items */
  const shuffle = (items) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  return { next, int, pick, chance, weighted, shuffle };
}
