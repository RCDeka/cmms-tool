import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as DB from '../assets/js/db.js';
import { pageKey, storesOf } from '../assets/js/db.js';
import { reportOffline, reportOnline } from '../assets/js/network.js';
import { evictOutside, keepSet, prefetchAround } from '../assets/js/preload.js';
import {
  diffRecords,
  fetchAndStorePage,
  fetchAndStoreRecord,
  readCachedPage,
} from '../assets/js/sync.js';

/** Simulated API: 500 assets, 50 per page; `bump(id)` makes the server version newer. */
function fakeApi(total = 500) {
  const updatedAt = new Map();
  const asset = (id) => ({
    id,
    code: `AST-${String(id).padStart(4, '0')}`,
    name: `Asset ${id}`,
    updated_at: updatedAt.get(id) ?? '2026-10-01T08:00:00.000Z',
  });
  const fetchMock = vi.fn(async (url) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    const json = (body) =>
      new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    const one = pathname.match(/^\/api\/assets\/(\d+)$/);
    if (one) return json(asset(Number(one[1])));
    const page = Number(searchParams.get('page'));
    const size = Number(searchParams.get('size'));
    const first = (page - 1) * size + 1;
    const items = [];
    for (let id = first; id < first + size && id <= total; id++) items.push(asset(id));
    return json({ total, page, pages: Math.ceil(total / size), items });
  });
  return { fetchMock, bump: (id, at) => updatedAt.set(id, at) };
}

const cachedPageNumbers = async () =>
  (await DB.getAllKeys(storesOf('assets').pages))
    .map((k) => Number(k.split('-').at(-1)))
    .sort((a, b) => a - b);

let api;
beforeEach(async () => {
  await DB.close();
  globalThis.indexedDB = new IDBFactory(); // fresh database for every test
  api = fakeApi();
  vi.stubGlobal('fetch', api.fetchMock);
  reportOnline();
});
afterEach(() => {
  reportOnline(); // stops the offline health ping
  vi.unstubAllGlobals();
});

describe('keepSet', () => {
  it.each([
    [1, 10, [1, 2, 10]],
    [5, 10, [1, 4, 5, 6, 10]],
    [9, 10, [1, 8, 9, 10]],
    [10, 10, [1, 9, 10]],
    [1, 1, [1]],
    [2, 3, [1, 2, 3]],
  ])('page %i of %i → %j', (current, pages, expected) => {
    expect(keepSet(current, pages)).toEqual(expected);
  });

  it('never keeps more than 5 pages and always keeps the current one', () => {
    for (let pages = 1; pages <= 30; pages++) {
      for (let current = 1; current <= pages; current++) {
        const keep = keepSet(current, pages);
        expect(keep.length).toBeLessThanOrEqual(5);
        expect(keep).toContain(current);
      }
    }
  });
});

describe('diffRecords', () => {
  it('replaces only new records or records with a more recent updated_at', () => {
    const local = new Map([
      [1, { id: 1, name: 'old', updated_at: '2026-10-01T08:00:00.000Z' }],
      [2, { id: 2, name: 'local', updated_at: '2026-10-02T08:00:00.000Z' }],
    ]);
    const remote = [
      { id: 1, name: 'new', updated_at: '2026-10-03T08:00:00.000Z' },
      { id: 2, name: 'same time', updated_at: '2026-10-02T08:00:00.000Z' },
      { id: 3, name: 'unknown', updated_at: '2026-10-01T08:00:00.000Z' },
    ];
    const { changedIds, records } = diffRecords(local, remote);
    expect(changedIds).toEqual([1, 3]);
    expect(records.map((r) => r.name)).toEqual(['new', 'local', 'unknown']);
  });
});

describe('fetchAndStorePage / readCachedPage', () => {
  it('stores a page and its records, then reads them back without bookkeeping fields', async () => {
    const first = await fetchAndStorePage('assets', 2);
    expect(first.structureChanged).toBe(true);
    expect(first.changedIds).toHaveLength(50);

    const cached = await readCachedPage('assets', 2);
    expect(cached).toMatchObject({ total: 500, page: 2, pages: 10 });
    expect(cached.items.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => 51 + i));
    expect(cached.items[0]).not.toHaveProperty('_fetched_at');
    expect(await DB.getPage(storesOf('assets').pages, pageKey('assets', 2))).toMatchObject({
      pageKey: 'asset-page-2',
      ids: expect.any(Array),
    });
  });

  it('revalidation updates only the rows with a newer updated_at', async () => {
    await fetchAndStorePage('assets', 1);
    api.bump(7, '2026-10-04T09:00:00.000Z');
    const again = await fetchAndStorePage('assets', 1);
    expect(again.changedIds).toEqual([7]);
    expect(again.structureChanged).toBe(false);
    expect((await readCachedPage('assets', 1)).items[6].updated_at).toBe(
      '2026-10-04T09:00:00.000Z',
    );
  });

  it('treats a page with a missing record as not cached', async () => {
    await fetchAndStorePage('assets', 1);
    await DB.evict(storesOf('assets').records, [1, 2, 3]);
    expect(await readCachedPage('assets', 1)).toBeNull();
  });

  it('fetchAndStoreRecord reports whether the record changed', async () => {
    expect((await fetchAndStoreRecord('assets', 120)).changed).toBe(true);
    expect((await fetchAndStoreRecord('assets', 120)).changed).toBe(false);
    api.bump(120, '2026-10-05T00:00:00.000Z');
    expect((await fetchAndStoreRecord('assets', 120)).changed).toBe(true);
  });
});

describe('prefetchAround and eviction', () => {
  it('keeps at most 5 pages: 1, N−1, N, N+1 and the last', async () => {
    await fetchAndStorePage('assets', 5);
    await prefetchAround('assets', 5, 10);
    expect(await cachedPageNumbers()).toEqual([1, 4, 5, 6, 10]);
    expect(await DB.getAllKeys(storesOf('assets').records)).toHaveLength(250);

    await fetchAndStorePage('assets', 8);
    await prefetchAround('assets', 8, 10);
    expect(await cachedPageNumbers()).toEqual([1, 7, 8, 9, 10]);
    expect(await DB.getAllKeys(storesOf('assets').records)).toHaveLength(250);
  });

  it('does not refetch pages that are already cached', async () => {
    await fetchAndStorePage('assets', 5);
    await prefetchAround('assets', 5, 10);
    const calls = api.fetchMock.mock.calls.length;
    await prefetchAround('assets', 5, 10);
    expect(api.fetchMock.mock.calls.length).toBe(calls);
  });

  it('keeps the current page and protected records when evicting', async () => {
    for (const p of [3, 4, 5]) await fetchAndStorePage('assets', p);
    await DB.put('drafts', { key: 'assets:120', entity: 'assets', id: 120 });
    await DB.put('sync_queue', { entity: 'assets', record_id: 130, changes: {} });
    await fetchAndStoreRecord('assets', 499); // opened from a deep link, on no kept page

    await evictOutside('assets', [5], [499]);
    expect(await cachedPageNumbers()).toEqual([5]);
    const ids = new Set(await DB.getAllKeys(storesOf('assets').records));
    expect(ids.has(201)).toBe(true); // current page
    expect(ids.has(120)).toBe(true); // draft
    expect(ids.has(130)).toBe(true); // queued write
    expect(ids.has(499)).toBe(true); // open in the detail panel
    expect(ids.has(101)).toBe(false); // page 3, evicted
    expect(ids.size).toBe(50 + 3);
  });

  it('does not use the network while offline', async () => {
    await fetchAndStorePage('assets', 5);
    const calls = api.fetchMock.mock.calls.length;
    reportOffline();
    await prefetchAround('assets', 5, 10);
    expect(api.fetchMock.mock.calls.length).toBe(calls);
    expect(await cachedPageNumbers()).toEqual([5]);
  });
});

describe('DB.clearAll', () => {
  it('empties every store (logout, D22)', async () => {
    await fetchAndStorePage('assets', 1);
    await DB.setConfig('user_id', 4);
    await DB.clearAll();
    expect(await DB.getAllKeys(storesOf('assets').records)).toHaveLength(0);
    expect(await DB.getConfig('user_id')).toBeUndefined();
  });
});
