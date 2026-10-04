// Conflict comparison (docs/data-model.md → BR-V6).
import { BOOLEAN_FIELDS } from './fields.js';

/** Stored row (booleans as 0/1) → API values. */
export function snapshotToApi(entity, row) {
  const out = { ...row };
  for (const f of BOOLEAN_FIELDS[entity]) if (f in out) out[f] = out[f] === 1;
  if ('has_conflict' in out) out.has_conflict = out.has_conflict === 1;
  return out;
}

/** Empty strings, null and undefined all mean "no value". */
const normalize = (value) => (value === undefined || value === '' ? null : value);

/** True when two API values are the same. */
export const sameValue = (a, b) => normalize(a) === normalize(b);

/**
 * Fields of version B (the client's changes) whose value differs from version A (the server
 * record when the conflict happened). Only these need a decision (BR-V6).
 * @param {object} versionA API values (see snapshotToApi)
 * @param {object} versionB changed fields sent by the client
 * @returns {string[]}
 */
export function divergentFields(versionA, versionB) {
  return Object.keys(versionB).filter((field) => !sameValue(versionA[field], versionB[field]));
}
