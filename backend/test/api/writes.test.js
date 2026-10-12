// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../../src/lib/dates.js';
import { NOW, TODAY, createSeededApp, expectNoSecrets } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const USERS = { admin: 1, supervisor1: 2, supervisor2: 3, technician1: 4, technician2: 5 };
const send = (method, username, url, body) =>
  request(ctx.app)
    [method](url)
    .set('Authorization', `Bearer ${ctx.tokenFor(username)}`)
    .send(body);
const put = (username, url, body) => send('put', username, url, body);
const post = (username, body) => send('post', username, '/api/work-orders', body);
const row = (table, id) => ctx.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
const one = (sql, ...params) =>
  ctx.db
    .prepare(sql)
    .pluck()
    .get(...params);

/** First work order matching a SQL condition (makes tests independent of seed details). */
const woWhere = (condition, ...params) =>
  ctx.db.prepare(`SELECT * FROM work_orders WHERE ${condition} ORDER BY id LIMIT 1`).get(...params);

describe('PUT /api/assets/:id', () => {
  it('applies the change, increments the version and records the author (BR-V2)', async () => {
    const res = await put('supervisor1', '/api/assets/10', {
      name: 'Renamed chiller',
      maintenance_contract: false,
      comment: '   ',
      version: 1,
    }).expect(200);
    expect(res.body).toMatchObject({ updated: true, version: 2 });
    expect(res.body.item).toMatchObject({
      id: 10,
      name: 'Renamed chiller',
      maintenance_contract: false,
      comment: null, // blank text is stored as "no value"
      version: 2,
      updated_by: { id: USERS.supervisor1, first_name: 'Julien', last_name: 'Bernard' },
    });
    expect(row('assets', 10).maintenance_contract).toBe(0);
    expectNoSecrets(res.body);
  });

  it('lets technicians change status, comment and last service date only', async () => {
    await put('technician1', '/api/assets/11', {
      status: 'BROKEN_DOWN',
      comment: 'Fan blocked',
      version: 1,
    }).expect(200);
    const res = await put('technician1', '/api/assets/11', { name: 'x', version: 2 }).expect(403);
    expect(res.body.details.fields).toEqual(['name']);
  });

  it.each([
    ['a read-only field', { code: 'AST-9999', version: 1 }, 403],
    ['an unknown field', { colour: 'red', version: 1 }, 400],
    ['no version (BR-V1)', { comment: 'x' }, 400],
    ['no field to change', { version: 1 }, 400],
    ['a bad enum', { criticality: 'HUGE', version: 1 }, 400],
    ['an empty required field', { name: '  ', version: 1 }, 400],
    ['an impossible date', { commissioned_on: '2026-02-30', version: 1 }, 400],
    ['a wrong type', { maintenance_contract: 'yes', version: 1 }, 400],
  ])('refuses %s', async (_case, body, status) => {
    await put('supervisor1', '/api/assets/12', body).expect(status);
    expect(row('assets', 12).version).toBe(1);
  });

  it('answers 404 for an unknown asset', async () => {
    await put('supervisor1', '/api/assets/9999', { comment: 'x', version: 1 }).expect(404);
  });

  it('stores a conflict when the client edited an older version (BR-V3)', async () => {
    await put('supervisor1', '/api/assets/20', { comment: 'Supervisor note', version: 1 }).expect(
      200,
    );
    const res = await put('technician1', '/api/assets/20', {
      status: 'UNDER_MAINTENANCE',
      version: 1,
      edited_at: '2026-10-04T09:00:00Z',
    }).expect(409);

    expect(res.body).toEqual({
      conflict: true,
      conflict_id: expect.any(Number),
      server_version: expect.objectContaining({
        id: 20,
        version: 2,
        comment: 'Supervisor note',
        has_conflict: true,
      }),
      client_version: { status: 'UNDER_MAINTENANCE', version: 1 },
    });
    const conflict = row('conflicts', res.body.conflict_id);
    expect(conflict).toMatchObject({
      entity_type: 'assets',
      entity_id: 20,
      base_version: 1,
      server_version: 2,
      server_updated_by: USERS.supervisor1,
      client_user_id: USERS.technician1,
      client_edited_at: '2026-10-04T09:00:00Z',
      status: 'OPEN',
    });
    expect(JSON.parse(conflict.client_changes)).toEqual({ status: 'UNDER_MAINTENANCE' });
    expect(JSON.parse(conflict.server_snapshot)).toMatchObject({
      id: 20,
      comment: 'Supervisor note',
    });
    // The record keeps the server version, flagged.
    expect(row('assets', 20)).toMatchObject({ version: 2, has_conflict: 1, status: 'IN_SERVICE' });
  });

  it('refuses any update while the conflict is open (BR-V4)', async () => {
    const open = one("SELECT id FROM conflicts WHERE entity_type = 'assets' AND entity_id = 20");
    const res = await put('supervisor1', '/api/assets/20', { comment: 'again', version: 2 }).expect(
      409,
    );
    expect(res.body).toEqual({ conflict: true, locked: true, conflict_id: open });
    expect(
      one("SELECT count(*) FROM conflicts WHERE entity_id = 20 AND entity_type = 'assets'"),
    ).toBe(1);
  });
});

describe('PUT /api/work-orders/:id', () => {
  it('refuses technicians on work orders assigned to someone else', async () => {
    const other = woWhere("status = 'OPEN' AND assignee_id = ?", USERS.technician2);
    const res = await put('technician1', `/api/work-orders/${other.id}`, {
      status: 'IN_PROGRESS',
      version: other.version,
    }).expect(403);
    expect(res.body.message).toMatch(/assigned to them/);
  });

  it('runs the workflow for the assignee: start, then close with a report', async () => {
    const mine =
      woWhere("status = 'OPEN' AND assignee_id = ? AND due_on IS NULL", USERS.technician1) ??
      woWhere("status = 'OPEN' AND assignee_id = ?", USERS.technician1);
    const url = `/api/work-orders/${mine.id}`;

    const started = await put('technician1', url, {
      status: 'IN_PROGRESS',
      version: mine.version,
    }).expect(200);
    expect(started.body.item).toMatchObject({
      status: 'IN_PROGRESS',
      started_on: TODAY,
      version: mine.version + 1,
    });

    const noReport = await put('technician1', url, {
      status: 'CLOSED',
      version: mine.version + 1,
    }).expect(422);
    expect(noReport.body.details).toEqual({ rule: 'BR-W6' });

    const closed = await put('technician1', url, {
      status: 'CLOSED',
      work_report: 'Belt replaced.',
      actual_hours: 1.5,
      version: mine.version + 1,
    }).expect(200);
    expect(closed.body.item).toMatchObject({
      status: 'CLOSED',
      closed_on: TODAY,
      actual_hours: 1.5,
    });

    const readOnly = await put('technician1', url, {
      work_report: 'x',
      version: mine.version + 2,
    }).expect(422);
    expect(readOnly.body.details).toEqual({ rule: 'BR-W7' });
  });

  it('refuses a forbidden transition (BR-W4)', async () => {
    const open = woWhere("status = 'OPEN'");
    const res = await put('supervisor1', `/api/work-orders/${open.id}`, {
      status: 'CLOSED',
      work_report: 'x',
      version: open.version,
    }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-W4' });
  });

  it('refuses fields technicians may not change', async () => {
    const mine = woWhere("status IN ('OPEN','IN_PROGRESS') AND assignee_id = ?", USERS.technician1);
    const res = await put('technician1', `/api/work-orders/${mine.id}`, {
      priority: 'URGENT',
      assignee_id: USERS.technician2,
      version: mine.version,
    }).expect(403);
    expect(res.body.details.fields).toEqual(['priority', 'assignee_id']);
  });

  it('takes the site of a new asset and refuses a different site (BR-W2)', async () => {
    const wo = woWhere("status = 'OPEN' AND asset_id IS NOT NULL");
    const asset = ctx.db
      .prepare('SELECT id, site FROM assets WHERE site <> ? ORDER BY id LIMIT 1')
      .get(wo.site);
    const url = `/api/work-orders/${wo.id}`;

    const moved = await put('supervisor1', url, { asset_id: asset.id, version: wo.version }).expect(
      200,
    );
    expect(moved.body.item).toMatchObject({
      asset_id: asset.id,
      site: asset.site,
      asset: { id: asset.id },
    });

    const wrongSite = await put('supervisor1', url, {
      site: 'Somewhere else',
      version: wo.version + 1,
    }).expect(422);
    expect(wrongSite.body.details).toEqual({ rule: 'BR-W2' });
    await put('supervisor1', url, { asset_id: 9999, version: wo.version + 1 }).expect(422);
  });

  it('only assigns technicians and supervisors (BR-W3)', async () => {
    const wo = woWhere("status = 'OPEN'");
    const res = await put('admin', `/api/work-orders/${wo.id}`, {
      assignee_id: USERS.admin,
      version: wo.version,
    }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-W3' });
    await put('admin', `/api/work-orders/${wo.id}`, {
      assignee_id: 9999,
      version: wo.version,
    }).expect(422);
    const ok = await put('admin', `/api/work-orders/${wo.id}`, {
      assignee_id: USERS.technician2,
      version: wo.version,
    }).expect(200);
    expect(ok.body.item.assignee).toMatchObject({ id: USERS.technician2, first_name: 'Lucas' });
  });

  it('refuses a due date before the creation date (BR-W8)', async () => {
    const wo = woWhere("status = 'OPEN'");
    const res = await put('supervisor1', `/api/work-orders/${wo.id}`, {
      due_on: addDays(wo.created_on, -1),
      version: wo.version,
    }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-W8' });
  });
});

describe('POST /api/work-orders', () => {
  const create = (username, body) =>
    post(username, { client_id: randomUUID(), type: 'CORRECTIVE', ...body });

  it('creates an OPEN work order with the next number and the asset site and category', async () => {
    const asset = row('assets', 42);
    const before = one('SELECT count(*) FROM work_orders');
    const res = await create('supervisor1', { title: 'Water leak', asset_id: 42 }).expect(201);
    expect(res.body.created).toBe(true);
    expect(res.body.item).toMatchObject({
      // 320 seeded work orders (D64).
      number: 'WO-2026-00321',
      status: 'OPEN',
      priority: 'NORMAL',
      title: 'Water leak',
      asset_id: 42,
      site: asset.site,
      category: asset.category,
      assignee_id: null,
      created_on: TODAY,
      created_by: { id: USERS.supervisor1, first_name: 'Julien', last_name: 'Bernard' },
      version: 1,
    });
    expect(one('SELECT count(*) FROM work_orders')).toBe(before + 1);
  });

  it('returns the same work order when a client_id is replayed (BR-W11)', async () => {
    const client_id = randomUUID();
    const first = await post('technician1', {
      client_id,
      type: 'CORRECTIVE',
      title: 'Door stuck',
      asset_id: 7,
    }).expect(201);
    const count = one('SELECT count(*) FROM work_orders');
    const replay = await post('technician1', {
      client_id,
      type: 'CORRECTIVE',
      title: 'Door stuck',
      asset_id: 7,
    }).expect(200);
    expect(replay.body).toEqual({ created: false, item: first.body.item });
    expect(one('SELECT count(*) FROM work_orders')).toBe(count);
    expect(first.body.item.client_id).toBe(client_id);
  });

  it('assigns technicians to their own work orders and nothing else (BR-W12)', async () => {
    const own = await create('technician1', {
      title: 'Noise',
      site: 'Lyon Part-Dieu Branch',
    }).expect(201);
    expect(own.body.item).toMatchObject({
      assignee_id: USERS.technician1,
      asset: null,
      category: null,
    });
    await create('technician1', {
      title: 'x',
      site: 'Lyon Part-Dieu Branch',
      assignee_id: USERS.technician1,
    }).expect(201);
    const other = await create('technician1', {
      title: 'x',
      site: 'Lyon Part-Dieu Branch',
      assignee_id: USERS.technician2,
    }).expect(403);
    expect(other.body.details.fields).toEqual(['assignee_id']);
    await create('technician1', {
      title: 'x',
      site: 'Lyon Part-Dieu Branch',
      supervisor_id: USERS.supervisor1,
    }).expect(403);
  });

  it('lets supervisors assign anyone eligible (BR-W3)', async () => {
    const res = await create('supervisor2', {
      title: 'Inspection',
      type: 'REGULATORY',
      site: 'Saclay Data Center',
      assignee_id: USERS.technician2,
      supervisor_id: USERS.supervisor2,
      priority: 'HIGH',
      due_on: addDays(TODAY, 7),
      estimated_hours: 3,
    }).expect(201);
    expect(res.body.item).toMatchObject({
      type: 'REGULATORY',
      priority: 'HIGH',
      assignee_id: USERS.technician2,
    });
    await create('supervisor2', {
      title: 'x',
      site: 'Saclay Data Center',
      assignee_id: USERS.admin,
    }).expect(422);
  });

  it.each([
    ['no asset and no site', { title: 'x' }, 400],
    ['no title', { site: 'Lyon Part-Dieu Branch', title: '' }, 400],
    ['a server-set field', { site: 'Lyon Part-Dieu Branch', title: 'x', status: 'CLOSED' }, 400],
    ['an unknown asset', { asset_id: 9999, title: 'x' }, 422],
    ['a site different from the asset', { asset_id: 42, site: 'Elsewhere', title: 'x' }, 422],
    [
      'a due date before today',
      { site: 'Lyon Part-Dieu Branch', title: 'x', due_on: addDays(TODAY, -1) },
      422,
    ],
  ])('refuses %s', async (_case, body, status) => {
    await create('supervisor1', body).expect(status);
  });

  it('requires a valid client_id', async () => {
    await post('supervisor1', {
      type: 'CORRECTIVE',
      title: 'x',
      site: 'Lyon Part-Dieu Branch',
    }).expect(400);
    await post('supervisor1', {
      client_id: 'abc',
      type: 'CORRECTIVE',
      title: 'x',
      site: 'Lyon Part-Dieu Branch',
    }).expect(400);
  });

  it('dates offline creations from when the user made them (BR-W9)', async () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 86_400_000).toISOString();
    const res = await create('technician2', {
      title: 'Queued offline',
      site: 'Lyon Part-Dieu Branch',
      edited_at: twoDaysAgo,
    }).expect(201);
    expect(res.body.item.created_on).toBe(addDays(TODAY, -2));

    const future = new Date(NOW.getTime() + 3600_000).toISOString();
    expect(
      (
        await create('technician2', {
          title: 'x',
          site: 'Lyon Part-Dieu Branch',
          edited_at: future,
        }).expect(422)
      ).body.details,
    ).toEqual({ rule: 'BR-W9' });
    const old = new Date(NOW.getTime() - 40 * 86_400_000).toISOString();
    await create('technician2', {
      title: 'x',
      site: 'Lyon Part-Dieu Branch',
      edited_at: old,
    }).expect(422);
  });
});

describe('numbering across years (BR-W10)', () => {
  it('restarts the sequence on 1 January', async () => {
    const newYear = await createSeededApp({ now: () => new Date('2027-01-01T09:00:00Z') });
    try {
      const make = () =>
        request(newYear.app)
          .post('/api/work-orders')
          .set('Authorization', `Bearer ${newYear.tokenFor('supervisor1')}`)
          .send({
            client_id: randomUUID(),
            type: 'PREVENTIVE',
            title: 'New year check',
            site: 'Lille Grand Place Branch',
          })
          .expect(201);
      expect((await make()).body.item.number).toBe('WO-2027-00001');
      expect((await make()).body.item.number).toBe('WO-2027-00002');
    } finally {
      newYear.cleanup();
    }
  });
});
