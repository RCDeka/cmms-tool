// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededApp, expectNoSecrets } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const HQ = 'Paris La Défense Headquarters';
const LYON = 'Lyon Part-Dieu Branch';

const send = (method, username, url, body) =>
  request(ctx.app)
    [method](url)
    .set('Authorization', `Bearer ${ctx.tokenFor(username)}`)
    .send(body);
const get = (username, url) => ctx.getAs(username, url);
const row = (sql, ...params) => ctx.db.prepare(sql).get(...params);
const all = (sql, ...params) => ctx.db.prepare(sql).all(...params);

/** Id of the place at this path from the site ("HQ", "Tower A", "L12"). */
function placeId(site, ...names) {
  let id = row('SELECT id FROM locations WHERE parent_id IS NULL AND name = ?', site).id;
  for (const name of names) {
    id = row('SELECT id FROM locations WHERE parent_id = ? AND name = ?', id, name).id;
  }
  return id;
}
const place = (id) => row('SELECT * FROM locations WHERE id = ?', id);
const newPlace = (username, body) => send('post', username, '/api/admin/locations', body);
const change = (username, id, body) =>
  send('put', username, `/api/admin/locations/${id}`, { version: place(id).version, ...body });

describe('GET /api/locations', () => {
  it('gives every role the level types and the tree, each place after its parent', async () => {
    const res = await get('technician1', '/api/locations').expect(200);
    expect(res.body.level_types.map((t) => t.token)).toEqual(['SITE', 'BUILDING', 'FLOOR', 'ROOM']);
    expect(res.body.level_types[3]).toMatchObject({ name: 'Room', offered_to_staff: true });
    expect(res.body.items).toHaveLength(414);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      [
        'code',
        'created_at',
        'id',
        'is_active',
        'level_type_id',
        'name',
        'parent_id',
        'site_id',
        'updated_at',
        'version',
      ].sort(),
    );
    const seen = new Set();
    for (const p of res.body.items) {
      if (p.parent_id !== null) expect(seen.has(p.parent_id)).toBe(true);
      seen.add(p.id);
    }
    // Sites by name; floors from the deepest basement up, in natural order.
    expect(res.body.items.filter((p) => p.parent_id === null).map((p) => p.name)).toEqual([
      'Lille Grand Place Branch',
      'Lyon Part-Dieu Branch',
      'Marseille Prado Branch',
      HQ,
      'Saclay Data Center',
    ]);
    const towerA = placeId(HQ, 'Tower A');
    const floors = res.body.items.filter((p) => p.parent_id === towerA).map((p) => p.name);
    expect(floors.slice(0, 5)).toEqual(['B2', 'B1', 'L0', 'L1', 'L2']);
    expect(floors.at(-1)).toBe('L30');
  });

  it('gives staff the places in use, without codes or versions (BR-LOC9)', async () => {
    const res = await get('user1', '/api/locations').expect(200);
    expect(res.body.items[0]).not.toHaveProperty('code');
    expect(res.body.items[0]).not.toHaveProperty('version');
    expect(res.body.items.every((p) => p.is_active)).toBe(true);
    expect(res.body.level_types[0]).toEqual({ id: 1, name: 'Site', offered_to_staff: false });
  });

  it('requires a token', async () => {
    await request(ctx.app).get('/api/locations').expect(401);
  });
});

describe('POST /api/admin/locations', () => {
  it('creates a place under another, with its site; the parent decides the site', async () => {
    const parent = placeId(LYON, 'Main building', 'B1');
    const res = await newPlace('supervisor1', {
      parent_id: parent,
      level_type_id: 4,
      name: 'Boiler room',
      code: ' br ',
    }).expect(201);
    expect(res.body.item).toMatchObject({
      parent_id: parent,
      site_id: placeId(LYON),
      level_type_id: 4,
      name: 'Boiler room',
      code: 'BR',
      is_active: true,
      version: 1,
      site: LYON,
      place: 'Main building › B1 › Boiler room',
    });
    expectNoSecrets(res.body);
    await get('supervisor1', `/api/admin/locations/${res.body.item.id}`).expect(200);
    await get('supervisor1', '/api/admin/locations/99999').expect(404);
  });

  it('refuses a name or a code a sibling has, whatever the case (409 BR-LOC2)', async () => {
    const parent = placeId(LYON, 'Main building', 'L0');
    let res = await newPlace('supervisor1', {
      parent_id: parent,
      level_type_id: 4,
      name: 'BANKING HALL',
    }).expect(409);
    expect(res.body.details).toMatchObject({
      rule: 'BR-LOC2',
      fields: { name: 'Already used here' },
    });
    await newPlace('supervisor1', {
      parent_id: parent,
      level_type_id: 4,
      name: 'Safe',
      code: 'S1',
    });
    res = await newPlace('supervisor1', {
      parent_id: parent,
      level_type_id: 4,
      name: 'Vault',
      code: 's1',
    }).expect(409);
    expect(res.body.details.fields).toEqual({ code: 'Already used here' });
  });

  it('keeps branches to 8 levels, the site included (422 BR-LOC3)', async () => {
    let parent = placeId(LYON, 'Main building', 'L2');
    for (let level = 4; level <= 8; level++) {
      parent = (
        await newPlace('supervisor1', {
          parent_id: parent,
          level_type_id: 4,
          name: `Level ${level}`,
        })
      ).body.item.id;
    }
    const res = await newPlace('supervisor1', {
      parent_id: parent,
      level_type_id: 4,
      name: 'Level 9',
    }).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC3');
  });

  it('lets only admins create sites, always of the site type (BR-LOC1, BR-LOC6)', async () => {
    await newPlace('supervisor1', { parent_id: null, name: 'Nantes Branch' }).expect(403);
    await newPlace('supervisor1', { parent_id: null }).expect(403); // before the body checks
    await newPlace('admin', { parent_id: null, level_type_id: 2, name: 'Nantes Branch' }).expect(
      422,
    );
    const res = await newPlace('admin', {
      parent_id: null,
      name: 'Nantes Branch',
      code: 'NTE',
    }).expect(201);
    expect(res.body.item).toMatchObject({
      parent_id: null,
      level_type_id: 1,
      site: 'Nantes Branch',
      place: '',
    });
    expect(res.body.item.site_id).toBe(res.body.item.id);
    await newPlace('admin', { parent_id: null, name: 'nantes branch' }).expect(409);
    // A place under it may not be a site.
    await newPlace('supervisor1', {
      parent_id: res.body.item.id,
      level_type_id: 1,
      name: 'X',
    }).expect(422);
    expect((await get('technician1', '/api/reference-data')).body.sites).toContain('Nantes Branch');
  });

  it('validates the body and the roles', async () => {
    const parent = placeId(LYON);
    for (const body of [
      {},
      { parent_id: parent, level_type_id: 2, name: '' },
      { parent_id: parent, level_type_id: 2, name: 'A › B' },
      { parent_id: parent, level_type_id: 2, name: 'Annex', code: 'A-1' },
      { parent_id: parent, name: 'Annex' },
      { parent_id: parent, level_type_id: 2, name: 'Annex', colour: 'red' },
    ]) {
      await newPlace('supervisor1', body).expect(400);
    }
    await newPlace('supervisor1', { parent_id: 99999, level_type_id: 2, name: 'Annex' }).expect(
      422,
    );
    await newPlace('supervisor1', { parent_id: parent, level_type_id: 99, name: 'Annex' }).expect(
      422,
    );
    await newPlace('technician1', { parent_id: parent, level_type_id: 2, name: 'Annex' }).expect(
      403,
    );
    await newPlace('user1', { parent_id: parent, level_type_id: 2, name: 'Annex' }).expect(403);
  });
});

describe('PUT /api/admin/locations/:id', () => {
  it('moves a floor to another building: the paths below follow, the records are not written (BR-LOC4)', async () => {
    const floor = placeId(HQ, 'Tower A', 'L12');
    const towerB = placeId(HQ, 'Tower B');
    const roomIds = all('SELECT id FROM locations WHERE parent_id = ?', floor).map((r) => r.id);
    const before = all(
      `SELECT id, version, updated_at FROM work_orders WHERE location_id IN (${roomIds.join(',')})`,
    );
    expect(before.length).toBeGreaterThan(0);
    const res = await change('supervisor1', floor, {
      parent_id: towerB,
      name: 'L12 (A)',
      code: null,
    }).expect(200);
    expect(res.body).toMatchObject({
      updated: true,
      item: { parent_id: towerB, place: 'Tower B › L12 (A)', version: 2 },
    });
    const after = all(
      `SELECT id, version, updated_at, place FROM work_orders WHERE location_id IN (${roomIds.join(',')})`,
    );
    expect(after.map(({ place: _p, ...r }) => r)).toEqual(before);
    expect(after.every((w) => w.place.startsWith('Tower B › L12 (A) › '))).toBe(true);
    // The search finds them at their new place, with those on the floor itself.
    const found = await get(
      'supervisor1',
      `/api/work-orders?q=${encodeURIComponent('"L12 (A)"')}&size=100`,
    ).expect(200);
    expect(found.body.items.map((w) => w.id)).toEqual(
      expect.arrayContaining(after.map((w) => w.id)),
    );
    expect(found.body.total).toBe(
      row("SELECT count(*) AS n FROM work_orders WHERE place LIKE 'Tower B › L12 (A)%'").n,
    );
  });

  it('refuses a move to another site, into its own subtree, or under a place out of use', async () => {
    const floor = placeId(HQ, 'Tower B', 'L3');
    let res = await change('supervisor1', floor, {
      parent_id: placeId(LYON, 'Main building'),
    }).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC4');
    const room = all('SELECT id FROM locations WHERE parent_id = ?', floor)[0].id;
    res = await change('supervisor1', floor, { parent_id: room }).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC4');
    await change('admin', placeId(HQ), { parent_id: placeId(LYON) }).expect(422);
  });

  it('takes a floor out of use with its rooms; records keep them, new ones cannot name them (BR-LOC5)', async () => {
    const floor = placeId(HQ, 'Tower B', 'L8');
    const room = placeId(HQ, 'Tower B', 'L8', 'Meeting room 8.03');
    const named = row('SELECT id FROM work_orders WHERE location_id = ?', room);
    expect(named).toBeDefined();
    await change('supervisor1', floor, { is_active: false }).expect(200);
    expect(place(room).is_active).toBe(0);
    expect(row('SELECT location_id FROM work_orders WHERE id = ?', named.id).location_id).toBe(
      room,
    );
    const staff = await get('user1', '/api/locations');
    expect(staff.body.items.some((p) => p.id === room)).toBe(false);
    const res = await send('post', 'user1', '/api/requests', {
      client_id: randomUUID(),
      title: 'Light',
      site: HQ,
      location_id: room,
    }).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC5');
    // Back in use only under a place in use.
    await change('supervisor1', room, { is_active: true }).expect(422);
    await change('supervisor1', floor, { is_active: true }).expect(200);
    await change('supervisor1', room, { is_active: true }).expect(200);
  });

  it('renames a site only while no record names it (BR-LOC6)', async () => {
    let res = await change('admin', placeId(LYON), { name: 'Lyon Branch' }).expect(409);
    expect(res.body.details.rule).toBe('BR-LOC6');
    await change('supervisor1', placeId(LYON), { code: 'LYN' }).expect(403);
    // Refused for the role first, whatever the version sent.
    await send('put', 'supervisor1', `/api/admin/locations/${placeId(LYON)}`, {
      version: 99,
      name: 'x',
    }).expect(403);
    const site = (await newPlace('admin', { parent_id: null, name: 'Tolouse Branch' })).body.item;
    res = await change('admin', site.id, { name: 'Toulouse Branch' }).expect(200);
    expect(res.body.item.site).toBe('Toulouse Branch');
  });

  it('answers 409 for a stale version, 404, 400', async () => {
    const id = placeId(LYON, 'Main building');
    await send('put', 'supervisor1', `/api/admin/locations/${id}`, {
      version: 99,
      code: 'M',
    }).expect(409);
    await send('put', 'supervisor1', '/api/admin/locations/99999', {
      version: 1,
      code: 'M',
    }).expect(404);
    await send('put', 'supervisor1', `/api/admin/locations/${id}`, { version: 1 }).expect(400);
    await send('put', 'technician1', `/api/admin/locations/${id}`, {
      version: 1,
      code: 'M',
    }).expect(403);
    const same = await change('supervisor1', id, { name: 'Main building' }).expect(200);
    expect(same.body.updated).toBe(false);
  });
});

describe('records on places', () => {
  it('gives an asset the site and path of its place (BR-LOC7), and its open work orders follow it (BR-LOC8)', async () => {
    const asset = row(
      `SELECT a.* FROM assets a WHERE EXISTS (SELECT 1 FROM work_orders w WHERE w.asset_id = a.id AND w.status = 'OPEN')
         AND EXISTS (SELECT 1 FROM work_orders w WHERE w.asset_id = a.id AND w.status = 'CLOSED') ORDER BY a.id`,
    );
    const target = placeId(LYON, 'Main building', 'L1');
    const res = await send('put', 'supervisor1', `/api/assets/${asset.id}`, {
      location_id: target,
      version: asset.version,
    }).expect(200);
    expect(res.body.item).toMatchObject({
      location_id: target,
      site: LYON,
      place: 'Main building › L1',
    });
    const open = all("SELECT * FROM work_orders WHERE asset_id = ? AND status = 'OPEN'", asset.id);
    expect(open.every((w) => w.location_id === target && w.site === LYON)).toBe(true);
    const closed = all(
      "SELECT * FROM work_orders WHERE asset_id = ? AND status = 'CLOSED'",
      asset.id,
    );
    expect(closed.every((w) => w.location_id === asset.location_id)).toBe(true);
    // The history says where it went.
    const history = await get('supervisor1', `/api/assets/${asset.id}/history`).expect(200);
    expect(history.body.items[0].changes.place).toEqual({
      from: asset.place,
      to: 'Main building › L1',
    });
  });

  it('takes a site alone as the site itself, and refuses a site other than the place’s (BR-LOC7)', async () => {
    const asset = row('SELECT * FROM assets WHERE id = 7');
    let res = await send('put', 'supervisor1', '/api/assets/7', {
      site: LYON,
      version: asset.version,
    }).expect(200);
    expect(res.body.item).toMatchObject({ site: LYON, location_id: placeId(LYON), place: '' });
    res = await send('put', 'supervisor1', '/api/assets/7', {
      site: HQ,
      location_id: placeId(LYON, 'Main building'),
      version: res.body.item.version,
    }).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC7');
    res = await send('post', 'supervisor1', '/api/assets', {
      name: 'Pump',
      site: 'Atlantis',
      category: 'PLUMBING',
      criticality: 'LOW',
    }).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC7');
    res = await send('post', 'supervisor1', '/api/assets', {
      name: 'Pump',
      location_id: placeId(LYON, 'Main building', 'B1'),
      category: 'PLUMBING',
      criticality: 'LOW',
    }).expect(201);
    expect(res.body.item).toMatchObject({ site: LYON, place: 'Main building › B1' });
    await send('post', 'supervisor1', '/api/assets', {
      name: 'Pump',
      category: 'PLUMBING',
      criticality: 'LOW',
    }).expect(400);
    await send('put', 'supervisor1', '/api/assets/7', { place: 'Somewhere', version: 1 }).expect(
      403,
    );
  });

  it('keeps a work order with an asset at the asset’s place (422 BR-LOC8)', async () => {
    const wo = row(
      'SELECT * FROM work_orders WHERE asset_id IS NOT NULL AND status = ? ORDER BY id',
      'OPEN',
    );
    const res = await send('put', 'supervisor1', `/api/work-orders/${wo.id}`, {
      location_id: placeId(LYON),
      version: wo.version,
    }).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC8');
  });

  it('moves a work order without an asset, and two offline moves make a conflict', async () => {
    const wo = row(
      "SELECT * FROM work_orders WHERE asset_id IS NULL AND status = 'OPEN' AND review_status IS NOT 'PENDING' ORDER BY id",
    );
    const siteId = row('SELECT site_id FROM locations WHERE id = ?', wo.location_id).site_id;
    const [first, second] = all(
      'SELECT id FROM locations WHERE site_id = ? AND level_type_id = 3 AND is_active = 1 ORDER BY id LIMIT 2',
      siteId,
    ).map((r) => r.id);
    const res = await send('put', 'supervisor1', `/api/work-orders/${wo.id}`, {
      location_id: first,
      version: wo.version,
    }).expect(200);
    expect(res.body.item.place).toBe(
      row(
        'SELECT name FROM locations WHERE id = ?',
        row('SELECT parent_id FROM locations WHERE id = ?', first).parent_id,
      ).name +
        ' › ' +
        place(first).name,
    );
    const conflict = await send('put', 'supervisor2', `/api/work-orders/${wo.id}`, {
      location_id: second,
      version: wo.version,
      edited_at: '2026-10-04T09:00:00Z',
    }).expect(409);
    expect(conflict.body.client_version).toEqual({ location_id: second, version: wo.version });
    const detail = await get('supervisor1', `/api/conflicts/${conflict.body.conflict_id}`).expect(
      200,
    );
    expect(detail.body.divergent_fields).toEqual(['location_id']);
    // Choosing version B moves it, with its path.
    const resolved = await send(
      'put',
      'supervisor1',
      `/api/work-orders/${wo.id}/resolve-conflict`,
      {
        conflict_id: conflict.body.conflict_id,
        choice: 'B',
      },
    ).expect(200);
    expect(resolved.body.item).toMatchObject({ location_id: second, has_conflict: false });
    expect(resolved.body.item.place.endsWith(place(second).name)).toBe(true);
  });

  it('filters by a place and everything below it (BR-LOC10)', async () => {
    const towerA = placeId(HQ, 'Tower A');
    const res = await get('technician1', `/api/assets?location=${towerA}&size=100`).expect(200);
    expect(res.body.total).toBe(
      row("SELECT count(*) AS n FROM assets WHERE site = ? AND place LIKE 'Tower A › %'", HQ).n,
    );
    expect(res.body.items.every((a) => a.place.startsWith('Tower A › '))).toBe(true);
    const plans = await get('technician1', `/api/plans?location=${towerA}&size=100`).expect(200);
    expect(plans.body.items.every((p) => p.place.startsWith('Tower A › '))).toBe(true);
    const wos = await get('technician1', `/api/work-orders?location=${placeId(LYON)}`).expect(200);
    expect(wos.body.items.every((w) => w.site === LYON)).toBe(true);
    await get('technician1', '/api/assets?location=abc').expect(400);
  });

  it('finds assets by the names of their place', async () => {
    const res = await get(
      'technician1',
      `/api/assets?q=${encodeURIComponent('Hall DC2')}&size=100`,
    ).expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.items.every((a) => a.place.startsWith('Hall DC2'))).toBe(true);
  });
});

describe('staff requests on places (BR-LOC9)', () => {
  const newRequest = (o) => ({ client_id: randomUUID(), title: 'Too cold', site: HQ, ...o });

  it('takes a room of the request’s site, with or without words', async () => {
    const room = placeId(HQ, 'Tower A', 'L5', 'Meeting room 5.01');
    const res = await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ location_id: room }),
    ).expect(201);
    expect(res.body.item).toMatchObject({
      site: HQ,
      location_id: room,
      place: 'Tower A › L5 › Meeting room 5.01',
      location: null,
    });
  });

  it('takes the site with the place in words, and needs the words then', async () => {
    const res = await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ location: 'Car park, level -2' }),
    ).expect(201);
    expect(res.body.item).toMatchObject({ location_id: placeId(HQ), place: '' });
    await send('post', 'user1', '/api/requests', newRequest()).expect(400);
  });

  it('refuses a place of another site, or of a type not offered to staff (422)', async () => {
    let res = await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ location_id: placeId(LYON, 'Main building', 'L0', 'Banking hall') }),
    ).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC9');
    res = await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ location_id: placeId(HQ, 'Tower A', 'L5') }),
    ).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC9');
    res = await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ site: 'Atlantis', location: 'Hall' }),
    ).expect(422);
    expect(res.body.details.rule).toBe('BR-LOC7');
  });
});

describe('level types (BR-LT1)', () => {
  const types = '/api/admin/level-types';

  it('lets admins add a type, offered to staff or not', async () => {
    const res = await send('post', 'admin', types, {
      name: 'Technical room',
      token: 'tech_room',
    }).expect(201);
    expect(res.body.item).toMatchObject({
      name: 'Technical room',
      token: 'TECH_ROOM',
      offered_to_staff: false,
      is_active: true,
      version: 1,
    });
    await send('post', 'admin', types, { name: 'TECHNICAL ROOM', token: 'TR' }).expect(409);
    await send('post', 'admin', types, { name: 'Plant', token: 'TECH_ROOM' }).expect(409);
    await send('post', 'admin', types, { name: 'Plant', token: '1PLANT' }).expect(400);
    await send('post', 'supervisor1', types, { name: 'Zone', token: 'ZONE' }).expect(403);
    expect((await get('supervisor1', types).expect(200)).body.items).toHaveLength(5);
    await get('technician1', types).expect(403);
  });

  it('keeps the site type: only its name changes', async () => {
    let res = await send('put', 'admin', `${types}/1`, { version: 1, token: 'CAMPUS' }).expect(422);
    expect(res.body.details.rule).toBe('BR-LT1');
    await send('put', 'admin', `${types}/1`, { version: 1, is_active: false }).expect(422);
    res = await send('put', 'admin', `${types}/1`, { version: 1, name: 'Campus' }).expect(200);
    expect(res.body.item).toMatchObject({ name: 'Campus', token: 'SITE', version: 2 });
    await send('put', 'admin', `${types}/1`, { version: 1, name: 'Site' }).expect(409);
  });

  it('takes a type out of use: its places keep it, new places cannot take it', async () => {
    const res = await send('put', 'admin', `${types}/3`, { version: 1, is_active: false }).expect(
      200,
    );
    expect(res.body.item.is_active).toBe(false);
    const created = await newPlace('supervisor1', {
      parent_id: placeId(LYON, 'Main building'),
      level_type_id: 3,
      name: 'L3',
    }).expect(422);
    expect(created.body.details.rule).toBe('BR-LT1');
    await send('put', 'admin', `${types}/3`, { version: 2, is_active: true }).expect(200);
  });
});
