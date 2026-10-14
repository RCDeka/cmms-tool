// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededApp } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const HQ = 'Paris La Défense Headquarters';
const send = (method, username, url, body) =>
  request(ctx.app)
    [method](url)
    .set('Authorization', `Bearer ${ctx.tokenFor(username)}`)
    .send(body);
const get = (username, url) => ctx.getAs(username, url);
const roomsOf = async (site, username = 'user1') =>
  (await get(username, `/api/rooms?site=${encodeURIComponent(site)}`).expect(200)).body.items;
const roomId = (building, floor, name) =>
  ctx.db
    .prepare('SELECT id FROM rooms WHERE site = ? AND building = ? AND floor = ? AND name = ?')
    .pluck()
    .get(HQ, building, floor, name);

const ROOM_KEYS = [
  'id',
  'site',
  'building',
  'floor',
  'name',
  'is_active',
  'created_at',
  'updated_at',
].sort();

describe('GET /api/rooms', () => {
  it('lists the active rooms of a site to every role, by building, floor and name', async () => {
    const items = await roomsOf('Lyon Part-Dieu Branch');
    expect(items).toHaveLength(12);
    expect(Object.keys(items[0]).sort()).toEqual(['building', 'floor', 'id', 'name']);
    const sorted = [...items].sort(
      (a, b) =>
        a.building.localeCompare(b.building) ||
        a.floor.localeCompare(b.floor) ||
        a.name.localeCompare(b.name),
    );
    expect(items).toEqual(sorted);
    for (const username of ['technician1', 'supervisor1', 'admin']) {
      expect(await roomsOf('Lyon Part-Dieu Branch', username)).toEqual(items);
    }
    expect(await roomsOf('Nowhere')).toEqual([]);
  });

  it('orders floors from the basements up, L2 before L12', async () => {
    const floors = [
      ...new Set((await roomsOf(HQ)).filter((r) => r.building === 'Tower A').map((r) => r.floor)),
    ];
    expect(floors.slice(0, 4)).toEqual(['L0', 'L1', 'L2', 'L3']);
    expect(floors.indexOf('L12')).toBeGreaterThan(floors.indexOf('L9'));
  });

  it('needs a site (400) and a token (401)', async () => {
    await get('user1', '/api/rooms').expect(400);
    await request(ctx.app)
      .get(`/api/rooms?site=${encodeURIComponent(HQ)}`)
      .expect(401);
  });
});

describe('/api/admin/rooms (supervisors and admins)', () => {
  it('refuses technicians and staff (403)', async () => {
    for (const username of ['technician1', 'user1']) {
      await get(username, '/api/admin/rooms').expect(403);
      await send('post', username, '/api/admin/rooms', {}).expect(403);
    }
  });

  it('lists every room with search and filters', async () => {
    const all = await get('supervisor1', '/api/admin/rooms?size=1').expect(200);
    expect(all.body.total).toBe(333);
    expect(Object.keys(all.body.items[0]).sort()).toEqual(ROOM_KEYS);
    const found = await get(
      'admin',
      `/api/admin/rooms?q=12.0&site=${encodeURIComponent(HQ)}&is_active=true`,
    ).expect(200);
    expect(found.body.items.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Meeting room 12.01', 'Office 12.07']),
    );
    await get('admin', '/api/admin/rooms?is_active=maybe').expect(400);
  });

  it('creates a room (201) and refuses the same room in other letter case (409 BR-RM1)', async () => {
    const body = {
      site: 'Lille Grand Place Branch',
      building: 'Main building',
      floor: 'L1',
      name: 'Training room',
    };
    const res = await send('post', 'supervisor1', '/api/admin/rooms', body).expect(201);
    expect(res.body).toMatchObject({ created: true, item: { ...body, is_active: true } });
    expect(Object.keys(res.body.item).sort()).toEqual(ROOM_KEYS);
    const again = await send('post', 'admin', '/api/admin/rooms', {
      ...body,
      name: 'TRAINING ROOM',
    }).expect(409);
    expect(again.body.details).toMatchObject({
      rule: 'BR-RM1',
      fields: { name: expect.any(String) },
    });
    expect((await roomsOf('Lille Grand Place Branch')).map((r) => r.name)).toContain(
      'Training room',
    );
  });

  it('refuses missing or unknown fields (400)', async () => {
    const res = await send('post', 'admin', '/api/admin/rooms', { site: HQ, name: 'X' }).expect(
      400,
    );
    expect(Object.keys(res.body.details.fields)).toEqual(
      expect.arrayContaining(['building', 'floor']),
    );
    await send('post', 'admin', '/api/admin/rooms', {
      site: HQ,
      building: 'Tower A',
      floor: 'L1',
      name: 'X',
      is_active: false,
    }).expect(400);
  });

  it('renames and deactivates a room; its site never changes (BR-RM2, BR-RM3)', async () => {
    const id = roomId('Tower B', 'L3', 'Meeting room 3.02');
    const renamed = await send('put', 'supervisor1', `/api/admin/rooms/${id}`, {
      name: 'Board room 3.02',
    }).expect(200);
    expect(renamed.body).toMatchObject({ updated: true, item: { name: 'Board room 3.02' } });
    const same = await send('put', 'supervisor1', `/api/admin/rooms/${id}`, {
      name: 'Board room 3.02',
    }).expect(200);
    expect(same.body.updated).toBe(false);
    await send('put', 'admin', `/api/admin/rooms/${id}`, { site: 'Lyon Part-Dieu Branch' }).expect(
      400,
    );
    await send('put', 'admin', `/api/admin/rooms/${id}`, { name: 'Meeting room 3.01' }).expect(409);
    await send('put', 'admin', `/api/admin/rooms/${id}`, { is_active: false }).expect(200);
    expect((await roomsOf(HQ)).map((r) => r.id)).not.toContain(id);
    expect((await get('admin', `/api/admin/rooms/${id}`).expect(200)).body.is_active).toBe(false);
    await get('admin', '/api/admin/rooms/99999').expect(404);
    await send('put', 'admin', '/api/admin/rooms/99999', { name: 'X' }).expect(404);
  });
});

describe('requests from a room (BR-R1, BR-RM4)', () => {
  const newRequest = (overrides = {}) => ({
    client_id: randomUUID(),
    title: 'Projector does not start',
    site: HQ,
    ...overrides,
  });

  it('sends a request from a room, with or without more words about the place', async () => {
    const id = roomId('Tower A', 'L12', 'Meeting room 12.02');
    const res = await send('post', 'user1', '/api/requests', newRequest({ room_id: id })).expect(
      201,
    );
    expect(res.body.item).toMatchObject({
      location: null,
      room: { id, building: 'Tower A', floor: 'L12', name: 'Meeting room 12.02' },
    });
    const wo = await get('supervisor1', `/api/work-orders/${res.body.item.id}`).expect(200);
    expect(wo.body).toMatchObject({ room_id: id, room: { name: 'Meeting room 12.02' } });
    const detailed = await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ room_id: id, location: 'Ceiling projector' }),
    ).expect(201);
    expect(detailed.body.item.location).toBe('Ceiling projector');
    const listed = await get('user1', '/api/requests?size=100').expect(200);
    expect(listed.body.items.find((r) => r.id === res.body.item.id).room.name).toBe(
      'Meeting room 12.02',
    );
  });

  it('still accepts a place in words when the room is not in the list', async () => {
    const res = await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ location: 'Tower A, level -1, bike shed' }),
    ).expect(201);
    expect(res.body.item.room).toBeNull();
  });

  it('needs a room or a place in words (400)', async () => {
    const res = await send('post', 'user1', '/api/requests', newRequest()).expect(400);
    expect(res.body.details.fields).toHaveProperty('location');
    await send('post', 'user1', '/api/requests', newRequest({ location: '  ' })).expect(400);
  });

  it('refuses a room of another site, an inactive or an unknown one (422)', async () => {
    const lyon = (await roomsOf('Lyon Part-Dieu Branch'))[0].id;
    const inactive = roomId('Tower A', 'L5', 'Kitchen 5');
    await send('put', 'admin', `/api/admin/rooms/${inactive}`, { is_active: false }).expect(200);
    for (const id of [lyon, inactive, 99999]) {
      const res = await send('post', 'user1', '/api/requests', newRequest({ room_id: id })).expect(
        422,
      );
      expect(res.body.details.rule).toBe('BR-RM4');
    }
  });

  it('does not let the maintenance team change the room through a work order edit', async () => {
    const { id, version } = (await get('supervisor1', '/api/work-orders?size=1').expect(200)).body
      .items[0];
    const res = await send('put', 'supervisor1', `/api/work-orders/${id}`, {
      version,
      room_id: roomId('Tower A', 'L12', 'Kitchen 12'),
    });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body.details)).toContain('room_id');
  });
});
