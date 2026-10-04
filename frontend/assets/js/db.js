// IndexedDB access (brief → IndexedDB module; docs/architecture.md → IndexedDB).
// All IndexedDB access goes through this module.
import { openDB } from '../vendor/idb-8.0.3/index.js';
import { ENTITIES } from './entities.js';

const DB_NAME = 'cmms';
const DB_VERSION = 1;

/** Store names of an entity: `${prefix}_pages`, `${prefix}_records`. */
export function storesOf(entity) {
  const { prefix } = ENTITIES[entity];
  return { pages: `${prefix}_pages`, records: `${prefix}_records` };
}

/** Page key from the brief: `asset-page-3`. */
export function pageKey(entity, page) {
  return `${ENTITIES[entity].prefix}-page-${page}`;
}

const ALL_STORES = [
  ...Object.keys(ENTITIES).flatMap((e) => Object.values(storesOf(e))),
  'config',
  'drafts',
  'sync_queue',
];

let dbPromise = null;

/** Opens (and creates or upgrades) the database. Safe to call several times. */
export function init() {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const entity of Object.keys(ENTITIES)) {
        const { pages, records } = storesOf(entity);
        db.createObjectStore(pages, { keyPath: 'pageKey' });
        db.createObjectStore(records, { keyPath: 'id' });
      }
      db.createObjectStore('config');
      db.createObjectStore('drafts', { keyPath: 'key' });
      db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
    },
  });
  return dbPromise;
}

/** Closes the connection (tests, logout). The next call reopens it. */
export async function close() {
  if (!dbPromise) return;
  (await dbPromise).close();
  dbPromise = null;
}

/** Saves a page: `{ pageKey, page, pages, total, sort, order, scope, ids, fetched_at }`. */
export async function savePage(store, key, data) {
  await (await init()).put(store, { ...data, pageKey: key });
}

export async function getPage(store, key) {
  return (await init()).get(store, key);
}

/** All keys of a store. */
export async function getAllKeys(store) {
  return (await init()).getAllKeys(store);
}

export async function saveRecord(store, id, data) {
  await (await init()).put(store, { ...data, id });
}

/** Saves many records in one transaction. */
export async function saveRecords(store, records) {
  const tx = (await init()).transaction(store, 'readwrite');
  await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
}

export async function getRecord(store, id) {
  return (await init()).get(store, id);
}

/** Records by id, in the order of `ids`; undefined for missing ones. */
export async function getRecords(store, ids) {
  const tx = (await init()).transaction(store);
  const records = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return records;
}

/** Deletes every key of `store` that is not in `keepKeys` (brief → DB.evict). */
export async function evict(store, keepKeys) {
  const keep = new Set(keepKeys);
  const tx = (await init()).transaction(store, 'readwrite');
  const keys = await tx.store.getAllKeys();
  await Promise.all([...keys.filter((k) => !keep.has(k)).map((k) => tx.store.delete(k)), tx.done]);
}

export async function getConfig(key) {
  return (await init()).get('config', key);
}

export async function setConfig(key, value) {
  await (await init()).put('config', value, key);
}

/**
 * Stores a value in a store with an in-line key (drafts: `key`; sync_queue: auto `id`).
 * @returns {Promise<IDBValidKey>} the key
 */
export async function put(store, value) {
  return (await init()).put(store, value);
}

/** One value by key from any store. */
export async function get(store, key) {
  return (await init()).get(store, key);
}

/** Deletes one value by key. */
export async function remove(store, key) {
  await (await init()).delete(store, key);
}

/** All entries of a store (drafts, sync_queue). */
export async function getAll(store) {
  return (await init()).getAll(store);
}

/** Empties every store (logout, D22; another user logging in). */
export async function clearAll() {
  const tx = (await init()).transaction(ALL_STORES, 'readwrite');
  await Promise.all([...ALL_STORES.map((s) => tx.objectStore(s).clear()), tx.done]);
}

/** The brief's `DB.*` API in one object. */
export const DB = {
  init,
  savePage,
  getPage,
  saveRecord,
  saveRecords,
  getRecord,
  getRecords,
  evict,
  getConfig,
  setConfig,
  getAll,
  getAllKeys,
  put,
  get,
  remove,
  clearAll,
  close,
};
