// Save modes and drafts (docs/architecture.md → Save modes; D29).
// Standard mode: explicit Save, unsaved-changes dialog, draft restore offer.
// Power-user mode: changes are queued automatically when the user leaves the record.
// Both modes keep a draft in IndexedDB, written 1 s after the last edit.
import * as DB from './db.js';

export const DRAFT_DELAY_MS = 1000;

export const draftKey = (entity, id) => `${entity}:${id}`;

export async function getDraft(entity, id) {
  return DB.get('drafts', draftKey(entity, id));
}

/**
 * @param {{ entity: string, id: number | string, base_version?: number, changes: object,
 *   error?: { message: string, fields?: object } }} draft
 */
export async function saveDraft(draft) {
  await DB.put('drafts', {
    ...draft,
    key: draftKey(draft.entity, draft.id),
    updated_at: new Date().toISOString(),
  });
}

export async function deleteDraft(entity, id) {
  await DB.remove('drafts', draftKey(entity, id));
}

/**
 * What to do when the user leaves a record (close, other record, other page).
 * @returns {'leave' | 'save' | 'ask'} save = queue the changes without asking
 */
export function decideOnLeave({ dirty, powerUser }) {
  if (!dirty) return 'leave';
  return powerUser ? 'save' : 'ask';
}

/** Debounces a function: runs once, `delay` ms after the last call. `flush()` runs it now. */
export function debounce(fn, delay) {
  let timer = null;
  let lastArgs = null;
  const debounced = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, delay);
  };
  debounced.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    fn(...lastArgs);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}
