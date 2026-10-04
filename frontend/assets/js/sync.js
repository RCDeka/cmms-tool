// Server → IndexedDB synchronization: read local data first, then revalidate quietly
// (stale-while-revalidate; docs/architecture.md → Revalidation).
import { apiFetch } from './api.js';
import { PAGE_SIZE } from './config.js';
import * as DB from './db.js';
import { pageKey, storesOf } from './db.js';
import { ENTITIES } from './entities.js';
import { filtersQuery } from './filters.js';

/** Sort used by the tables; a cached page is only valid for the sort it was fetched with. */
const DEFAULT_SORT = 'default';

/**
 * Compares server records with local ones. A record changes when it is new locally or its
 * `updated_at` is more recent (brief → Silent revalidation).
 * @param {Map<number, object>} localById
 * @param {object[]} remote
 * @returns {{ changedIds: number[], records: object[] }} records = what to keep, in server order
 */
export function diffRecords(localById, remote) {
  const changedIds = [];
  const records = remote.map((r) => {
    const local = localById.get(r.id);
    if (!local || r.updated_at > local.updated_at) {
      changedIds.push(r.id);
      return r;
    }
    return local;
  });
  return { changedIds, records };
}

/** Strips local bookkeeping fields before display or comparison. */
function clean(record) {
  if (!record) return record;
  const { _fetched_at, ...rest } = record;
  return rest;
}

/**
 * Cached page with its records, or null if absent, stale for the sort, or incomplete.
 * @returns {Promise<{ total: number, page: number, pages: number, items: object[] } | null>}
 */
export async function readCachedPage(entity, page) {
  const stores = storesOf(entity);
  const cached = await DB.getPage(stores.pages, pageKey(entity, page));
  if (!cached || cached.sort !== DEFAULT_SORT) return null;
  const records = await DB.getRecords(stores.records, cached.ids);
  if (records.some((r) => !r)) return null;
  return { total: cached.total, page: cached.page, pages: cached.pages, items: records.map(clean) };
}

/**
 * Fetches a page from the server and stores it. Only records with a newer `updated_at` are
 * replaced.
 * @returns {Promise<{ data: object, changedIds: number[], structureChanged: boolean }>}
 *   structureChanged: total, page count or row order differ from the cached page
 */
export async function fetchAndStorePage(entity, page) {
  const cfg = ENTITIES[entity];
  const stores = storesOf(entity);
  const remote = await apiFetch(`${cfg.api}?page=${page}&size=${PAGE_SIZE}`);

  const key = pageKey(entity, page);
  const cachedPage = await DB.getPage(stores.pages, key);
  const ids = remote.items.map((r) => r.id);
  const localRecords = (await DB.getRecords(stores.records, ids)).filter(Boolean);
  const { changedIds, records } = diffRecords(
    new Map(localRecords.map((r) => [r.id, r])),
    remote.items,
  );

  const now = new Date().toISOString();
  await DB.saveRecords(
    stores.records,
    records.filter((r) => changedIds.includes(r.id)).map((r) => ({ ...r, _fetched_at: now })),
  );
  await DB.savePage(stores.pages, key, {
    page: remote.page,
    pages: remote.pages,
    total: remote.total,
    sort: DEFAULT_SORT,
    order: DEFAULT_SORT,
    ids,
    fetched_at: now,
  });

  const structureChanged =
    !cachedPage ||
    cachedPage.total !== remote.total ||
    cachedPage.pages !== remote.pages ||
    cachedPage.ids.join() !== ids.join();
  return {
    data: {
      total: remote.total,
      page: remote.page,
      pages: remote.pages,
      items: records.map(clean),
    },
    changedIds,
    structureChanged,
  };
}

/**
 * A filtered page, always from the server (only unfiltered pages are cached, docs/
 * architecture.md → Search and filters). Its records are stored so they open instantly.
 */
export async function fetchFilteredPage(entity, page, filters) {
  const cfg = ENTITIES[entity];
  const query = new URLSearchParams(filtersQuery(entity, filters));
  query.set('page', String(page));
  query.set('size', String(PAGE_SIZE));
  const data = await apiFetch(`${cfg.api}?${query}`);
  const now = new Date().toISOString();
  await DB.saveRecords(
    storesOf(entity).records,
    data.items.map((r) => ({ ...r, _fetched_at: now })),
  );
  return data;
}

/** Cached record or undefined. */
export async function readCachedRecord(entity, id) {
  return clean(await DB.getRecord(storesOf(entity).records, id));
}

/**
 * Fetches one record and stores it if it is newer than the cached copy.
 * @returns {Promise<{ record: object, changed: boolean }>}
 */
export async function fetchAndStoreRecord(entity, id) {
  const remote = await apiFetch(`${ENTITIES[entity].api}/${id}`);
  const store = storesOf(entity).records;
  const local = await DB.getRecord(store, id);
  const changed = !local || remote.updated_at > local.updated_at;
  if (changed) await DB.saveRecord(store, id, { ...remote, _fetched_at: new Date().toISOString() });
  return { record: changed ? remote : clean(local), changed };
}
