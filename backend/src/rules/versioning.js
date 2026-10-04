// Optimistic concurrency (docs/data-model.md → BR-V1 to BR-V4).

/**
 * What to do with an update.
 * - 'locked': the record has an open conflict; regular updates are refused (BR-V4, D4).
 * - 'conflict': the client edited an older version (BR-V3).
 * - 'apply': versions match (BR-V2).
 * @param {{ storedVersion: number, sentVersion: number, hasConflict: boolean }} input
 * @returns {'locked' | 'conflict' | 'apply'}
 */
export function decideWrite({ storedVersion, sentVersion, hasConflict }) {
  if (hasConflict) return 'locked';
  if (storedVersion !== sentVersion) return 'conflict';
  return 'apply';
}
