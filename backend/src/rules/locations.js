// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// The location tree (D82, docs/spec-locations.md, BR-LOC1 to BR-LOC10): pure rules on places given
// as `{ id, parent_id, name, is_active }` rows.

/** The level type of sites, created by migration 015. */
export const SITE_LEVEL_TYPE = 1;

/** A branch has at most this many levels, the site included (BR-LOC3). */
export const MAX_DEPTH = 8;

/** Joins the names of a path below the site: "Tower A › B1 › Plant room 2". */
export const PATH_SEPARATOR = ' › ';

/** Place codes for asset codes: capitals and digits (`2`, `01`, `PAR`). */
export const PLACE_CODE = /^[A-Z0-9]{1,10}$/;

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Floor rank: basements from the deepest up, then L0, L1 …, then other names (D81). */
function floorRank(name) {
  const basement = /^B(\d+)$/.exec(name);
  if (basement) return -Number(basement[1]);
  const level = /^L(\d+)$/.exec(name);
  if (level) return Number(level[1]);
  return Number.POSITIVE_INFINITY;
}

/**
 * Order of sibling places: the floor rule, then by name in natural order (`Room 2` before
 * `Room 10`), whatever the case.
 * @param {{ name: string, id?: number }} a
 * @param {{ name: string, id?: number }} b
 */
export function comparePlaces(a, b) {
  const ra = floorRank(a.name);
  const rb = floorRank(b.name);
  if (ra !== rb) return ra < rb ? -1 : 1;
  return collator.compare(a.name, b.name) || (a.id ?? 0) - (b.id ?? 0);
}

/**
 * Indexes a flat list of places: children by parent (in sibling order) and rows by id.
 * @param {{ id: number, parent_id: number | null, name: string }[]} rows
 */
export function indexTree(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map();
  for (const r of rows) {
    const key = r.parent_id ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(r);
  }
  for (const list of children.values()) list.sort(comparePlaces);
  return { byId, children };
}

/**
 * The places of `rows` in tree order (each place after its parent, siblings in order).
 * @template {{ id: number, parent_id: number | null, name: string }} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function treeOrder(rows) {
  const { children } = indexTree(rows);
  const out = [];
  const visit = (parentId) => {
    for (const r of children.get(parentId) ?? []) {
      out.push(r);
      visit(r.id);
    }
  };
  visit(null);
  return out;
}

/**
 * The places from the site down to `id` (both included), or [] for an unknown place.
 * @param {Map<number, { id: number, parent_id: number | null }>} byId
 */
export function ancestry(byId, id) {
  const chain = [];
  let current = byId.get(id);
  while (current) {
    chain.unshift(current);
    current = current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return chain;
}

/**
 * Where a place is, as records store it (BR-LOC7): the site's name and the path below it
 * (empty for the site itself).
 * @returns {{ site: string, place: string }}
 */
export function placeOf(byId, id) {
  const [site, ...below] = ancestry(byId, id);
  return { site: site?.name, place: below.map((p) => p.name).join(PATH_SEPARATOR) };
}

/** `id` and every place below it. */
export function subtreeIds(children, id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    for (const child of children.get(ids[i]) ?? []) ids.push(child.id);
  }
  return ids;
}

/** Levels below `id` in its subtree: 0 for a place without children. */
function heightBelow(children, id) {
  let height = 0;
  for (const child of children.get(id) ?? []) {
    height = Math.max(height, 1 + heightBelow(children, child.id));
  }
  return height;
}

/**
 * Why `id` (or a new place when `id` is undefined) cannot go under `parentId`, or null
 * (BR-LOC3, BR-LOC4, BR-LOC5). The caller has checked that both places exist.
 * @param {ReturnType<typeof indexTree>} tree
 * @param {{ id?: number, parentId: number }} move
 * @returns {{ rule: string, message: string } | null}
 */
export function placementProblem(tree, { id, parentId }) {
  const parentChain = ancestry(tree.byId, parentId);
  if (id !== undefined) {
    if (parentChain.some((p) => p.id === id)) {
      return { rule: 'BR-LOC4', message: 'A place cannot move into itself or a place below it.' };
    }
    const place = tree.byId.get(id);
    if (ancestry(tree.byId, id)[0]?.id !== parentChain[0]?.id) {
      return { rule: 'BR-LOC4', message: 'A place can only move within its site.' };
    }
    if (place.parent_id === parentId) return null; // not moving
  }
  if (parentChain.at(-1)?.is_active === 0) {
    return { rule: 'BR-LOC5', message: 'This place is not in use: choose a place in use.' };
  }
  const height = id === undefined ? 0 : heightBelow(tree.children, id);
  if (parentChain.length + 1 + height > MAX_DEPTH) {
    return {
      rule: 'BR-LOC3',
      message: `A branch has at most ${MAX_DEPTH} levels, the site included.`,
    };
  }
  return null;
}

/**
 * Why a record cannot name this place, or null: it must be in use (BR-LOC5); a staff request
 * also needs a place of its site whose level type is offered to staff, or the site itself
 * (BR-LOC9).
 * @param {{ is_active: number, site_id: number, parent_id: number | null } | undefined} place
 * @param {{ staff?: boolean, offered?: boolean, siteId?: number }} [options]
 */
export function recordPlaceProblem(place, { staff = false, offered = false, siteId } = {}) {
  if (!place) return { rule: 'BR-LOC5', message: 'This place does not exist.' };
  if (place.is_active !== 1) {
    return { rule: 'BR-LOC5', message: 'This place is not in use any more.' };
  }
  if (siteId !== undefined && place.site_id !== siteId) {
    return { rule: 'BR-LOC9', message: 'This place is not on the site chosen.' };
  }
  if (staff && place.parent_id !== null && !offered) {
    return { rule: 'BR-LOC9', message: 'This place cannot be chosen for a request.' };
  }
  return null;
}
