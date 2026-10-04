import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as DB from '../assets/js/db.js';
import { storesOf } from '../assets/js/db.js';
import { reportOffline, reportOnline } from '../assets/js/network.js';
import {
  enqueue,
  flush,
  listEntries,
  loadQueue,
  mergeEntry,
  pendingChanges,
  pendingCount,
  resetQueueForTests,
  resume,
  setQueueHandlers,
} from '../assets/js/queue.js';
import { decideOnLeave, debounce, getDraft } from '../assets/js/save-modes.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let replies;
let handlers;
beforeEach(async () => {
  await DB.close();
  globalThis.indexedDB = new IDBFactory();
  resetQueueForTests();
  reportOnline();
  replies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const next = replies.shift();
      if (!next) throw new Error('no reply prepared');
      if (next === 'network') throw new TypeError('Failed to fetch');
      return next;
    }),
  );
  handlers = { onSuccess: vi.fn(), onConflict: vi.fn(), onRejected: vi.fn() };
  setQueueHandlers(handlers);
  await loadQueue();
});
afterEach(() => {
  resetQueueForTests();
  reportOnline();
  vi.unstubAllGlobals();
});

/** Enqueue without sending (offline), then go back online. */
async function queued(...writes) {
  reportOffline();
  for (const w of writes) await enqueue(w);
  reportOnline();
}
const update = (changes, extra = {}) => ({
  op: 'update',
  entity: 'assets',
  record_id: 10,
  base_version: 3,
  changes,
  ...extra,
});
const body = (call) => JSON.parse(fetch.mock.calls[call][1].body);

describe('merging', () => {
  it('keeps the original base version and operation (pure)', () => {
    const merged = mergeEntry(
      { op: 'create', base_version: 1, changes: { a: 1, b: 2 } },
      { b: 3 },
      'T',
    );
    expect(merged).toEqual({
      op: 'create',
      base_version: 1,
      changes: { a: 1, b: 3 },
      edited_at: 'T',
    });
  });

  it('keeps one entry per record while offline', async () => {
    await queued(
      update({ comment: 'one' }),
      update({ status: 'BROKEN_DOWN' }, { base_version: 4 }),
    );
    expect(pendingCount()).toBe(1);
    expect(listEntries()[0]).toMatchObject({
      base_version: 3,
      changes: { comment: 'one', status: 'BROKEN_DOWN' },
    });
    expect(pendingChanges('assets', 10)).toEqual({ comment: 'one', status: 'BROKEN_DOWN' });
    expect(pendingChanges('assets', 11)).toBeNull();
  });

  it('merges edits of a pending creation into the creation (D26)', async () => {
    await queued(
      {
        op: 'create',
        entity: 'work_orders',
        record_id: 'tmp-1',
        client_id: 'c-1',
        changes: { title: 'Leak', type: 'CORRECTIVE' },
      },
      {
        op: 'create',
        entity: 'work_orders',
        record_id: 'tmp-1',
        client_id: 'c-1',
        changes: { title: 'Big leak' },
      },
    );
    expect(listEntries()).toHaveLength(1);
    expect(listEntries()[0]).toMatchObject({
      op: 'create',
      changes: { title: 'Big leak', type: 'CORRECTIVE' },
    });
  });
});

describe('sending', () => {
  it('sends the version and edit time, stores the server record and clears the queue (200)', async () => {
    await queued(update({ comment: 'hi' }));
    const item = { id: 10, version: 4, comment: 'hi', updated_at: 'x' };
    replies.push(json(200, { updated: true, version: 4, item }));
    await flush();
    expect(body(0)).toMatchObject({ comment: 'hi', version: 3, edited_at: expect.any(String) });
    expect(fetch.mock.calls[0][1].method).toBe('PUT');
    expect(pendingCount()).toBe(0);
    expect(await DB.getRecord(storesOf('assets').records, 10)).toMatchObject({
      version: 4,
      comment: 'hi',
    });
    expect(handlers.onSuccess).toHaveBeenCalledOnce();
  });

  it('replaces the temporary record when a creation succeeds (201)', async () => {
    await DB.saveRecord(storesOf('work_orders').records, 'tmp-1', { id: 'tmp-1', title: 'Leak' });
    await queued({
      op: 'create',
      entity: 'work_orders',
      record_id: 'tmp-1',
      client_id: 'c-1',
      changes: { title: 'Leak', type: 'CORRECTIVE' },
    });
    replies.push(
      json(201, { created: true, item: { id: 201, number: 'WO-2026-00201', version: 1 } }),
    );
    await flush();
    expect(body(0)).toMatchObject({ client_id: 'c-1', title: 'Leak' });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(await DB.getRecord(storesOf('work_orders').records, 'tmp-1')).toBeUndefined();
    expect(await DB.getRecord(storesOf('work_orders').records, 201)).toMatchObject({
      number: 'WO-2026-00201',
    });
  });

  it('stores the server version on a conflict (409)', async () => {
    await queued(update({ comment: 'mine' }));
    replies.push(
      json(409, {
        conflict: true,
        conflict_id: 7,
        server_version: { id: 10, version: 5, has_conflict: true },
        client_version: {},
      }),
    );
    await flush();
    expect(pendingCount()).toBe(0);
    expect(await DB.getRecord(storesOf('assets').records, 10)).toMatchObject({
      version: 5,
      has_conflict: true,
    });
    expect(handlers.onConflict).toHaveBeenCalledOnce();
    expect(await getDraft('assets', 10)).toBeUndefined(); // the server keeps version B
  });

  it('keeps the edits as a draft when the record is locked (409 locked)', async () => {
    await queued(update({ comment: 'mine' }));
    replies.push(json(409, { conflict: true, locked: true, conflict_id: 7 }));
    await flush();
    expect(await getDraft('assets', 10)).toMatchObject({
      changes: { comment: 'mine' },
      error: { locked: true },
    });
  });

  it('keeps refused edits as a draft with the error (422)', async () => {
    await queued(update({ status: 'CLOSED' }, { entity: 'work_orders' }));
    replies.push(
      json(422, {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'A work report is required.',
        details: { rule: 'BR-W6' },
      }),
    );
    await flush();
    expect(pendingCount()).toBe(0);
    expect(await getDraft('work_orders', 10)).toMatchObject({
      changes: { status: 'CLOSED' },
      error: { message: 'A work report is required.', rule: 'BR-W6' },
    });
    expect(handlers.onRejected).toHaveBeenCalledOnce();
  });

  it('retries later after a network error, with backoff', async () => {
    await queued(update({ comment: 'x' }));
    replies.push('network');
    const before = Date.now();
    await flush();
    expect(pendingCount()).toBe(1);
    expect(listEntries()[0].attempts).toBe(1);
    expect(listEntries()[0].next_try_at).toBeGreaterThanOrEqual(before + 5000);
    reportOnline(); // the failed call reported offline
    await flush(); // not due yet: nothing sent
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('pauses on 401 until resumed after login', async () => {
    await queued(update({ comment: 'x' }));
    replies.push(json(401, { statusCode: 401, message: 'Token expired' }));
    await flush();
    expect(pendingCount()).toBe(1);
    replies.push(json(200, { item: { id: 10, version: 4 } }));
    resume();
    await vi.waitFor(() => expect(pendingCount()).toBe(0));
  });

  it('sends nothing while offline and survives a reload', async () => {
    await queued(update({ comment: 'x' }));
    reportOffline();
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    resetQueueForTests();
    await loadQueue();
    expect(pendingCount()).toBe(1);
  });

  it('sends a follow-up made during the send with the new version', async () => {
    await queued(update({ comment: 'first' }));
    let release;
    replies.push(new Promise((r) => (release = r)));
    const sending = flush();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await enqueue(update({ comment: 'second' })); // while the first is in flight
    expect(listEntries()).toHaveLength(2);
    replies.push(json(200, { item: { id: 10, version: 5 } }));
    release(json(200, { item: { id: 10, version: 4 } }));
    await sending;
    await vi.waitFor(() => expect(pendingCount()).toBe(0));
    expect(body(1)).toMatchObject({ comment: 'second', version: 4 });
  });
});

describe('save modes', () => {
  it.each([
    [{ dirty: false, powerUser: false }, 'leave'],
    [{ dirty: false, powerUser: true }, 'leave'],
    [{ dirty: true, powerUser: true }, 'save'],
    [{ dirty: true, powerUser: false }, 'ask'],
  ])('%o → %s', (input, expected) => {
    expect(decideOnLeave(input)).toBe(expected);
  });

  it('debounces and can flush or cancel', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const later = debounce(fn, 1000);
    later(1);
    later(2);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith(2);
    later(3);
    later.flush();
    expect(fn).toHaveBeenLastCalledWith(3);
    later(4);
    later.cancel();
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
