// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import {
  MAX_DEPTH,
  ancestry,
  comparePlaces,
  indexTree,
  placeOf,
  placementProblem,
  recordPlaceProblem,
  subtreeIds,
  treeOrder,
} from '../../src/rules/locations.js';

const p = (id, parentId, name, isActive = 1) => ({
  id,
  parent_id: parentId,
  name,
  is_active: isActive,
});
// HQ › Tower A › {L10, L2, B1 › Plant room}, HQ › Tower B; Lyon.
const ROWS = [
  p(1, null, 'HQ'),
  p(2, 1, 'Tower A'),
  p(3, 2, 'L10'),
  p(4, 2, 'L2'),
  p(5, 2, 'B1'),
  p(6, 5, 'Plant room'),
  p(7, 1, 'Tower B'),
  p(8, null, 'Lyon'),
  p(9, 8, 'Annex', 0),
];

describe('comparePlaces', () => {
  it('orders floors from the deepest basement up, then other names in natural order', () => {
    const names = ['Room 10', 'L1', 'B1', 'room 2', 'L10', 'B2', 'L0', 'Annex', 'L2'];
    expect(
      names
        .map((name) => ({ name }))
        .sort(comparePlaces)
        .map((x) => x.name),
    ).toEqual(['B2', 'B1', 'L0', 'L1', 'L2', 'L10', 'Annex', 'room 2', 'Room 10']);
  });
});

describe('tree helpers', () => {
  const tree = indexTree(ROWS);

  it('lists each place after its parent, siblings in order', () => {
    expect(treeOrder(ROWS).map((r) => r.id)).toEqual([1, 2, 5, 6, 4, 3, 7, 8, 9]);
  });

  it('gives the site and the path below it (BR-LOC7)', () => {
    expect(placeOf(tree.byId, 6)).toEqual({ site: 'HQ', place: 'Tower A › B1 › Plant room' });
    expect(placeOf(tree.byId, 1)).toEqual({ site: 'HQ', place: '' });
    expect(ancestry(tree.byId, 99)).toEqual([]);
  });

  it('lists a place and everything below it', () => {
    expect(subtreeIds(tree.children, 2).sort()).toEqual([2, 3, 4, 5, 6]);
    expect(subtreeIds(tree.children, 7)).toEqual([7]);
  });
});

describe('placementProblem (BR-LOC3 to BR-LOC5)', () => {
  const tree = indexTree(ROWS);

  it('lets a place move within its site', () => {
    expect(placementProblem(tree, { id: 5, parentId: 7 })).toBeNull();
    expect(placementProblem(tree, { id: 5, parentId: 2 })).toBeNull(); // not moving
    expect(placementProblem(tree, { parentId: 6 })).toBeNull(); // a new place
  });

  it('refuses another site, its own subtree, or a parent out of use', () => {
    expect(placementProblem(tree, { id: 5, parentId: 8 })).toMatchObject({ rule: 'BR-LOC4' });
    expect(placementProblem(tree, { id: 2, parentId: 6 })).toMatchObject({ rule: 'BR-LOC4' });
    expect(placementProblem(tree, { id: 2, parentId: 2 })).toMatchObject({ rule: 'BR-LOC4' });
    expect(placementProblem(tree, { parentId: 9 })).toMatchObject({ rule: 'BR-LOC5' });
  });

  it('counts the levels of the branch, the moved subtree included', () => {
    const deep = [p(1, null, 'S')];
    for (let id = 2; id <= MAX_DEPTH; id++) deep.push(p(id, id - 1, `Level ${id}`));
    deep.push(p(20, 1, 'Side'), p(21, 20, 'Side child'));
    const index = indexTree(deep);
    expect(placementProblem(index, { parentId: MAX_DEPTH - 1 })).toBeNull();
    expect(placementProblem(index, { parentId: MAX_DEPTH })).toMatchObject({ rule: 'BR-LOC3' });
    // Side (2 levels) under level 6: 6 + 2 = 8 fits; under level 7 it does not.
    expect(placementProblem(index, { id: 20, parentId: 6 })).toBeNull();
    expect(placementProblem(index, { id: 20, parentId: 7 })).toMatchObject({ rule: 'BR-LOC3' });
  });
});

describe('recordPlaceProblem (BR-LOC5, BR-LOC9)', () => {
  const room = { is_active: 1, site_id: 1, parent_id: 5 };

  it('needs a place in use', () => {
    expect(recordPlaceProblem(room)).toBeNull();
    expect(recordPlaceProblem(undefined)).toMatchObject({ rule: 'BR-LOC5' });
    expect(recordPlaceProblem({ ...room, is_active: 0 })).toMatchObject({ rule: 'BR-LOC5' });
  });

  it('gives staff a place of the site, of a type offered to them, or the site itself', () => {
    expect(recordPlaceProblem(room, { staff: true, offered: true, siteId: 1 })).toBeNull();
    expect(recordPlaceProblem(room, { staff: true, offered: false, siteId: 1 })).toMatchObject({
      rule: 'BR-LOC9',
    });
    expect(recordPlaceProblem(room, { staff: true, offered: true, siteId: 8 })).toMatchObject({
      rule: 'BR-LOC9',
    });
    const site = { is_active: 1, site_id: 1, parent_id: null };
    expect(recordPlaceProblem(site, { staff: true, siteId: 1 })).toBeNull();
  });
});
