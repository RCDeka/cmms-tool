// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Reference lists for forms (sites, assignable users) and asset lookups, cached in IndexedDB
// so forms also work offline.
import { apiFetch } from './api.js';
import * as DB from './db.js';
import { storesOf } from './db.js';
import { isOnline } from './network.js';

const toAssetRef = (a) => ({
  id: a.id,
  code: a.code,
  name: a.name,
  site: a.site,
  location_id: a.location_id,
  place: a.place,
  category: a.category,
  status: a.status,
});

/**
 * Sites, places and users for the forms: from the server when online (and cached), else from
 * the cache. Technicians and staff cannot list users (403): they only get themselves. The
 * location tree (D82) is cached whole, so the place pickers work offline.
 * @param {{ id: number, first_name: string, last_name: string, role: string }} user
 * @returns {Promise<{ sites: string[], users: object[], places: object | null }>}
 */
export async function loadRefs(user) {
  let reference = await DB.getConfig('reference_data');
  let users = await DB.getConfig('assignable_users');
  let places = await DB.getConfig('locations');
  const canListUsers = ['SUPERVISOR', 'ADMIN'].includes(user.role);
  if (isOnline()) {
    try {
      reference = await apiFetch('/reference-data');
      await DB.setConfig('reference_data', reference);
      places = await apiFetch('/locations');
      await DB.setConfig('locations', places);
      if (canListUsers) {
        users = await apiFetch('/users');
        await DB.setConfig('assignable_users', users);
      }
    } catch {
      /* keep the cached lists */
    }
  }
  return {
    sites: reference?.sites ?? [],
    places: places ?? null,
    users: canListUsers
      ? (users ?? [])
      : [{ id: user.id, first_name: user.first_name, last_name: user.last_name, role: user.role }],
  };
}

/**
 * Finds an asset by its code (case-insensitive): local records first, then the server.
 * @returns {Promise<object | null>} { id, code, name, site, category, status }
 */
export async function findAssetByCode(code) {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return null;
  const local = (await DB.getAll(storesOf('assets').records)).find((a) => a.code === wanted);
  if (local) return toAssetRef(local);
  if (!isOnline()) return null;
  try {
    const { items } = await apiFetch(`/assets/search?q=${encodeURIComponent(wanted)}&limit=20`);
    const match = items.find((a) => a.code === wanted);
    return match ? toAssetRef(match) : null;
  } catch {
    return null;
  }
}

/** Finds an asset by id: local record first, then the server. */
export async function findAssetById(id) {
  const local = await DB.getRecord(storesOf('assets').records, id);
  if (local) return toAssetRef(local);
  if (!isOnline()) return null;
  try {
    return toAssetRef(await apiFetch(`/assets/${id}`));
  } catch {
    return null;
  }
}
