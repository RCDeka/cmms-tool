// Prefetch of adjacent pages and eviction (brief → Preloading; docs/architecture.md →
// Preload and eviction).
import * as DB from './db.js';
import { pageKey, storesOf } from './db.js';
import { isOnline } from './network.js';
import { fetchAndStorePage } from './sync.js';

/**
 * Pages to keep around page N of P: {1, N−1, N, N+1, P} within [1, P] (at most 5).
 * The current page is included (the brief's sample code would have evicted it).
 * @returns {number[]} ascending page numbers
 */
export function keepSet(current, pages) {
  const set = new Set([1, current - 1, current, current + 1, pages]);
  return [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
}

/** Record ids that must never be evicted: drafts and queued writes of the entity, plus extras. */
export async function protectedIds(entity, extraIds = []) {
  const [drafts, queue] = await Promise.all([DB.getAll('drafts'), DB.getAll('sync_queue')]);
  return new Set([
    ...extraIds,
    ...drafts.filter((d) => d.entity === entity).map((d) => d.id),
    ...queue.filter((q) => q.entity === entity).map((q) => q.record_id),
  ]);
}

/**
 * Removes pages outside the keep set, then records that belong to no kept page and are not
 * protected.
 * @param {string} entity
 * @param {number[]} keep page numbers to keep
 * @param {Iterable<number|string>} [extraProtected] e.g. the record open in the detail panel
 */
export async function evictOutside(entity, keep, extraProtected = []) {
  const stores = storesOf(entity);
  const keepKeys = keep.map((p) => pageKey(entity, p));
  await DB.evict(stores.pages, keepKeys);

  const keptPages = (await Promise.all(keepKeys.map((k) => DB.getPage(stores.pages, k)))).filter(
    Boolean,
  );
  const keepIds = await protectedIds(entity, extraProtected);
  for (const page of keptPages) for (const id of page.ids) keepIds.add(id);
  await DB.evict(stores.records, [...keepIds]);
}

/**
 * Prefetches the keep set around the current page (one request at a time, skipped offline),
 * then evicts the rest. Runs in the background after the visible content is rendered.
 * @param {string} entity
 * @param {number} current
 * @param {number} pages
 * @param {{ openId?: number | null }} [options]
 */
export async function prefetchAround(entity, current, pages, { openId = null } = {}) {
  const keep = keepSet(current, pages);
  const stores = storesOf(entity);
  for (const page of keep) {
    if (page === current || !isOnline()) continue;
    if (await DB.getPage(stores.pages, pageKey(entity, page))) continue;
    try {
      await fetchAndStorePage(entity, page);
    } catch {
      break; // network trouble: keep what we have, try again next time
    }
  }
  await evictOutside(entity, keep, openId === null ? [] : [openId]);
}
