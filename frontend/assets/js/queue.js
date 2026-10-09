// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Sync queue: every write goes through it, online or offline (D11; docs/architecture.md →
// Sync queue). Entries live in IndexedDB (`sync_queue`) so they survive reloads.
import { ApiError, apiFetch } from './api.js';
import * as DB from './db.js';
import { storesOf } from './db.js';
import { ENTITIES } from './entities.js';
import { isOnline, onNetworkChange } from './network.js';
import { deleteDraft, saveDraft } from './save-modes.js';

const STORE = 'sync_queue';
/** Retry delays after network or server errors: 5 s, 15 s, 60 s, then every 5 min. */
export const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];
const PERIODIC_FLUSH_MS = 30_000;

/** @type {Map<number, object>} entries by id, mirror of the IndexedDB store */
const entries = new Map();
const listeners = new Set();
let handlers = { onSuccess() {}, onConflict() {}, onRejected() {} };
let flushing = false;
let paused = false;
let inFlightId = null;
let retryTimer = null;

/**
 * @typedef {object} QueueEntry
 * @property {number} id
 * @property {'create' | 'update'} op
 * @property {string} entity
 * @property {number | string} record_id server id, or `tmp-<client_id>` for a creation
 * @property {string} [client_id] creations only (D26)
 * @property {number} [base_version] updates only: version the user edited from
 * @property {object} changes
 * @property {string} edited_at when the user last changed it
 * @property {number} attempts
 * @property {number} next_try_at epoch ms
 * @property {string} [last_error]
 */

/** Sets the UI reactions to queue results (app.js). */
export function setQueueHandlers(next) {
  handlers = { ...handlers, ...next };
}

/** Subscribes to queue changes (count, pending records). */
export function onQueueChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  for (const callback of listeners) callback();
}

/** Loads the queue from IndexedDB (startup). */
export async function loadQueue() {
  entries.clear();
  for (const entry of await DB.getAll(STORE)) entries.set(entry.id, entry);
  notify();
}

/** Number of writes waiting to be sent. */
export function pendingCount() {
  return entries.size;
}

/** Changes waiting for a record (merged, oldest first), or null. */
export function pendingChanges(entity, recordId) {
  const own = [...entries.values()]
    .filter((e) => e.entity === entity && e.record_id === recordId)
    .sort((a, b) => a.id - b.id);
  return own.length ? Object.assign({}, ...own.map((e) => e.changes)) : null;
}

/** Entries waiting to be sent (oldest first). */
export function listEntries() {
  return [...entries.values()].sort((a, b) => a.id - b.id);
}

/**
 * Merges changes into an existing entry. Pure, exported for tests.
 * The original base version and operation are kept (docs/architecture.md → Sync queue).
 */
export function mergeEntry(existing, changes, editedAt) {
  return { ...existing, changes: { ...existing.changes, ...changes }, edited_at: editedAt };
}

/**
 * Adds a write. New edits to a record already waiting are merged into its entry, unless
 * that entry is being sent right now (then a follow-up entry is created).
 * @param {{ op: 'create' | 'update', entity: string, record_id: number | string,
 *   client_id?: string, base_version?: number, changes: object, edited_at?: string }} write
 */
export async function enqueue(write) {
  const editedAt = write.edited_at ?? new Date().toISOString();
  const existing = [...entries.values()].find(
    (e) => e.entity === write.entity && e.record_id === write.record_id && e.id !== inFlightId,
  );
  let entry;
  if (existing) {
    entry = mergeEntry(existing, write.changes, editedAt);
  } else {
    entry = { ...write, edited_at: editedAt, attempts: 0, next_try_at: 0 };
    // A follow-up of a write being sent waits for it, then gets the new base version.
    const inFlight = entries.get(inFlightId);
    if (inFlight?.entity === write.entity && inFlight.record_id === write.record_id) {
      entry.waits_for = inFlightId;
      entry.base_version ??= inFlight.base_version;
    }
  }
  entry.id = await DB.put(STORE, entry);
  entries.set(entry.id, entry);
  notify();
  flush();
  return entry;
}

/** Removes a write without sending it (e.g. a discarded failed creation). */
export async function discard(entryId) {
  await DB.remove(STORE, entryId);
  entries.delete(entryId);
  notify();
}

async function drop(entry) {
  await DB.remove(STORE, entry.id);
  entries.delete(entry.id);
}

/** Other entries of the same record (follow-ups created while `entry` was being sent). */
function followersOf(entry) {
  return [...entries.values()].filter(
    (e) => e.id !== entry.id && e.entity === entry.entity && e.record_id === entry.record_id,
  );
}

/**
 * After a refused write: follow-ups of an update go ahead with the original base version;
 * follow-ups of a creation are folded into the kept draft (there is no record to update).
 */
async function releaseFollowers(entry, draftChanges) {
  const followers = followersOf(entry);
  if (entry.op === 'create') {
    const changes = Object.assign({ ...draftChanges }, ...followers.map((f) => f.changes));
    for (const f of followers) await drop(f);
    return changes;
  }
  for (const f of followers) {
    const released = { ...f };
    delete released.waits_for;
    await DB.put(STORE, released);
    entries.set(released.id, released);
  }
  return draftChanges;
}

/** After a successful write: store the server record, retarget follow-up entries. */
async function applySuccess(entry, item) {
  const records = storesOf(entry.entity).records;
  await DB.saveRecord(records, item.id, { ...item, _fetched_at: new Date().toISOString() });
  if (entry.op === 'create') {
    await DB.remove(records, entry.record_id); // the temporary record
    await deleteDraft(entry.entity, entry.record_id);
  }
  await deleteDraft(entry.entity, item.id);
  for (const other of followersOf(entry)) {
    const updated = { ...other, record_id: item.id, base_version: item.version, op: 'update' };
    delete updated.waits_for;
    await DB.put(STORE, updated);
    entries.set(updated.id, updated);
  }
}

/** Sends one entry and reacts to the answer (architecture → Sync queue, response table). */
async function send(entry) {
  const cfg = ENTITIES[entry.entity];
  inFlightId = entry.id;
  try {
    const result =
      entry.op === 'create'
        ? await apiFetch(cfg.api, {
            method: 'POST',
            body: { ...entry.changes, client_id: entry.client_id, edited_at: entry.edited_at },
          })
        : await apiFetch(`${cfg.api}/${entry.record_id}`, {
            method: 'PUT',
            body: { ...entry.changes, version: entry.base_version, edited_at: entry.edited_at },
          });
    await drop(entry);
    await applySuccess(entry, result.item);
    handlers.onSuccess(entry, result.item);
    return 'sent';
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (err.status === 0 || err.status >= 500) {
      const attempts = entry.attempts + 1;
      const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
      const retry = {
        ...entry,
        attempts,
        next_try_at: Date.now() + delay,
        last_error: err.message,
      };
      await DB.put(STORE, retry);
      entries.set(retry.id, retry);
      return 'retry';
    }
    if (err.status === 401) {
      paused = true; // resumes after the next login
      return 'paused';
    }
    await drop(entry);
    if (err.status === 409) {
      await releaseFollowers(entry, entry.changes);
      await handleConflict(entry, err.body);
    } else {
      // 400, 403, 404, 422: the server will never accept it as is. Keep the edits as a draft.
      const changes = await releaseFollowers(entry, entry.changes);
      await saveDraft({
        entity: entry.entity,
        id: entry.record_id,
        base_version: entry.base_version,
        changes,
        error: {
          message: err.message,
          fields: err.body?.details?.fields ?? null,
          rule: err.body?.details?.rule ?? null,
        },
      });
      handlers.onRejected(entry, err);
    }
    return 'dropped';
  } finally {
    inFlightId = null;
    notify();
  }
}

/** 409: version conflict (stored on the server) or record locked by an open conflict. */
async function handleConflict(entry, body) {
  if (body?.server_version) {
    const records = storesOf(entry.entity).records;
    await DB.saveRecord(records, body.server_version.id, {
      ...body.server_version,
      _fetched_at: new Date().toISOString(),
    });
  }
  if (body?.locked) {
    // Locked: the server did not keep these edits; keep them as a draft for later.
    await saveDraft({
      entity: entry.entity,
      id: entry.record_id,
      base_version: entry.base_version,
      changes: entry.changes,
      error: {
        message: 'This record is waiting for a supervisor to resolve a conflict.',
        locked: true,
      },
    });
  }
  handlers.onConflict(entry, body);
}

/** Sends due entries one at a time, oldest first. Safe to call often. */
export async function flush() {
  if (flushing || paused || !isOnline()) return;
  flushing = true;
  try {
    for (;;) {
      const now = Date.now();
      const next = listEntries().find((e) => e.next_try_at <= now && !e.waits_for);
      if (!next) break;
      const outcome = await send(next);
      if (outcome === 'retry' || outcome === 'paused') break;
    }
  } finally {
    flushing = false;
    scheduleRetry();
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  const waiting = listEntries().filter((e) => !e.waits_for);
  if (!waiting.length || paused) return;
  const soonest = Math.min(...waiting.map((e) => e.next_try_at));
  retryTimer = setTimeout(flush, Math.max(0, soonest - Date.now()) + 50);
}

/** Resumes after a 401 (the user logged in again). */
export function resume() {
  paused = false;
  flush();
}

/** Starts the triggers: network back, and a periodic flush while entries wait. */
export function startQueue() {
  onNetworkChange((online) => {
    if (online) flush();
  });
  setInterval(() => {
    if (entries.size) flush();
  }, PERIODIC_FLUSH_MS);
  flush();
}

/** Test helper: clears the in-memory state. */
export function resetQueueForTests() {
  entries.clear();
  listeners.clear();
  flushing = false;
  paused = false;
  inFlightId = null;
  clearTimeout(retryTimer);
}
