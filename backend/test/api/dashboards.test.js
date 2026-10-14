// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { MAX_DASHBOARDS, TEMPLATES } from '../../src/rules/dashboards.js';
import { NOW, TEST_CONFIG, expectNoSecrets } from '../helpers/app.js';
import { SITE_ID, TEST_PASSWORD, addSites, createTestDb } from '../helpers/db.js';

/**
 * Hand-made dataset, values computed by hand. Today is 2026-10-04 (Europe/Paris); the
 * 30-day period starts on 2026-09-05, the 90-day one on 2026-07-07.
 *
 *  id status       site   category    created_on  due_on      closed_on   assignee priority
 *  1  OPEN         Paris  HVAC        2026-10-01  2026-10-03              sup      NORMAL   overdue
 *  2  OPEN         Lyon   ELECTRICAL  2026-09-20                                   NORMAL   staff request to review
 *  3  IN_PROGRESS  Paris  HVAC        2026-08-01  2026-09-01              sup      URGENT   overdue, outside 30 days
 *  4  CLOSED       Paris  —           2026-09-10              2026-10-02  tech1    NORMAL   closed this month
 *  5  CLOSED       Lyon   HVAC        2026-09-05              2026-09-30  tech1    LOW      first day of the period
 *  6  CANCELLED    Paris  PLUMBING    2026-10-02                                   NORMAL
 *  7  ON_HOLD      Paris  HVAC        2026-10-03  2026-10-08              sup      HIGH     due within 7 days
 *
 * Assets: AST-0001 Paris HVAC and AST-0002 Lyon ELECTRICAL broken down, AST-0003 Paris HVAC
 * in service. Conflicts: one open, one resolved.
 */
let ctx;
let app;
const tokens = {};

beforeAll(async () => {
  ctx = createTestDb();
  addSites(ctx.db, ['Site', 'Paris', 'Lyon', 'Lille', 'Marseille']);
  const { db } = ctx;
  const hash = await argon2.hash(TEST_PASSWORD);
  const user = db.prepare(
    'INSERT INTO users (id, username, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)',
  );
  user.run(1, 'admin', hash, 'Ada', 'Admin', 'ADMIN');
  user.run(2, 'sup', hash, 'Sam', 'Sup', 'SUPERVISOR');
  user.run(3, 'sup2', hash, 'Sue', 'Sup', 'SUPERVISOR');
  user.run(4, 'tech1', hash, 'Tia', 'Tech', 'TECHNICIAN');
  user.run(6, 'staff', hash, 'Stan', 'Staff', 'STAFF');

  // The site and its place (D82) from one parameter.
  const asset = db.prepare(
    `INSERT INTO assets (id, code, name, site, location_id, category, criticality, status)
     SELECT v.column1, v.column2, 'A', v.column3, ${SITE_ID('v.column3')}, v.column4, 'LOW', v.column5
     FROM (VALUES (?, ?, ?, ?, ?)) v`,
  );
  asset.run(1, 'AST-0001', 'Paris', 'HVAC', 'BROKEN_DOWN');
  asset.run(2, 'AST-0002', 'Lyon', 'ELECTRICAL', 'BROKEN_DOWN');
  asset.run(3, 'AST-0003', 'Paris', 'HVAC', 'IN_SERVICE');

  const wo = db.prepare(`INSERT INTO work_orders
    (id, number, type, status, priority, title, site, location_id, category, assignee_id,
     created_on, due_on, started_on, closed_on, work_report, review_status, created_by, created_at,
     updated_at)
    VALUES (@id, @number, 'CORRECTIVE', @status, @priority, @title, @site, ${SITE_ID('@site')},
     @category, @assignee,
     @created_on, @due_on, @started_on, @closed_on, @report, @review, 2, @at, @at)`);
  const rows = [
    [1, 'OPEN', 'Paris', 'HVAC', 2, '2026-10-01', '2026-10-03', null, null, 'NORMAL', null],
    [2, 'OPEN', 'Lyon', 'ELECTRICAL', null, '2026-09-20', null, null, null, 'NORMAL', 'PENDING'],
    [
      3,
      'IN_PROGRESS',
      'Paris',
      'HVAC',
      2,
      '2026-08-01',
      '2026-09-01',
      '2026-08-02',
      null,
      'URGENT',
      null,
    ],
    [4, 'CLOSED', 'Paris', null, 4, '2026-09-10', null, '2026-09-11', '2026-10-02', 'NORMAL', null],
    [5, 'CLOSED', 'Lyon', 'HVAC', 4, '2026-09-05', null, '2026-09-06', '2026-09-30', 'LOW', null],
    [6, 'CANCELLED', 'Paris', 'PLUMBING', null, '2026-10-02', null, null, null, 'NORMAL', null],
    [
      7,
      'ON_HOLD',
      'Paris',
      'HVAC',
      2,
      '2026-10-03',
      '2026-10-08',
      '2026-10-03',
      null,
      'HIGH',
      null,
    ],
  ];
  for (const [
    id,
    status,
    site,
    category,
    assignee,
    created,
    due,
    started,
    closed,
    priority,
    review,
  ] of rows) {
    wo.run({
      id,
      number: `WO-2026-0000${id}`,
      status,
      priority,
      title: `Work ${id}`,
      site,
      category,
      assignee,
      created_on: created,
      due_on: due,
      started_on: started,
      closed_on: closed,
      report: closed ? 'Done' : null,
      review,
      at: `2026-10-0${id <= 4 ? 1 : 2}T0${id}:00:00.000Z`, // updated_at grows with the id
    });
  }

  const conflict = db.prepare(`INSERT INTO conflicts
    (entity_type, entity_id, base_version, server_version, server_snapshot, client_changes,
     server_updated_at, client_user_id, client_edited_at, status, resolution, resolved_by, resolved_at)
    VALUES ('assets', ?, 1, 2, '{}', '{}', 'x', 4, 'x', ?, ?, ?, ?)`);
  conflict.run(1, 'OPEN', null, null, null);
  conflict.run(2, 'RESOLVED', 'A', 2, '2026-10-02T10:00:00.000Z');

  app = createApp({
    db,
    config: TEST_CONFIG,
    now: () => NOW,
    loginRateLimit: { windowMs: 60_000, limit: 100 },
  });
  for (const username of ['admin', 'sup', 'sup2', 'tech1', 'staff']) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username, password: TEST_PASSWORD })
      .expect(200);
    tokens[username] = res.body.token;
  }
});
afterAll(() => ctx.cleanup());

const as = (username) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[username]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    put: (url, body) => auth(request(app).put(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
};
const ids = (items) => items.map((w) => w.id);
const counts = (items, key) => Object.fromEntries(items.map((i) => [i[key], i.count]));
const widgets = async (username, query) =>
  (await as(username).get(`/api/dashboard/widgets?${query}`).expect(200)).body.widgets;

describe('GET /api/dashboards', () => {
  it('creates "Overview" with the widgets of the former dashboard for a user without dashboards, once', async () => {
    const first = await as('sup').get('/api/dashboards').expect(200);
    expect(first.body.items).toHaveLength(1);
    const [overview] = first.body.items;
    expect(overview).toMatchObject({
      name: 'Overview',
      position: 0,
      version: 1,
      filters: { period: 30, sites: [], categories: [] },
    });
    expect(overview.widgets.map((w) => w.key)).toEqual(TEMPLATES.OVERVIEW);
    expect(TEMPLATES.OVERVIEW).toHaveLength(12);
    const again = await as('sup').get('/api/dashboards').expect(200);
    expect(ids(again.body.items)).toEqual([overview.id]);
    expectNoSecrets(again.body);
  });

  it('keeps dashboards personal (BR-K1)', async () => {
    const mine = (await as('sup').get('/api/dashboards').expect(200)).body.items[0];
    const theirs = (await as('admin').get('/api/dashboards').expect(200)).body.items;
    expect(ids(theirs)).not.toContain(mine.id);
    await as('admin').get(`/api/dashboards/${mine.id}`).expect(404);
    await as('admin').put(`/api/dashboards/${mine.id}`, { version: 1, name: 'Mine' }).expect(404);
    await as('admin').delete(`/api/dashboards/${mine.id}?version=1`).expect(404);
    await as('admin').post('/api/dashboards', { name: 'Copy', copy_of: mine.id }).expect(404);
  });

  it('is for supervisors and admins only', async () => {
    await request(app).get('/api/dashboards').expect(401);
    await as('tech1').get('/api/dashboards').expect(403);
    await as('staff').get('/api/dashboards').expect(403);
    await as('tech1').post('/api/dashboards', { name: 'Mine' }).expect(403);
    await as('tech1').get('/api/dashboard/widgets?keys=my_work').expect(403);
    await as('staff').get('/api/dashboard/widgets?keys=my_work').expect(403);
  });
});

describe('POST /api/dashboards', () => {
  it('creates an empty dashboard (no Overview is added by a creation)', async () => {
    const res = await as('sup2').post('/api/dashboards', { name: '  Saclay  ' }).expect(201);
    expect(res.body).toMatchObject({ name: 'Saclay', position: 0, widgets: [], version: 1 });
  });

  it('creates from a template or as a copy of one of mine', async () => {
    const overview = await as('sup2').post('/api/dashboards', {
      name: 'Second overview',
      template: 'OVERVIEW',
    });
    expect(overview.status).toBe(201);
    expect(overview.body.widgets).toHaveLength(TEMPLATES.OVERVIEW.length);

    const source = (await as('sup2').get('/api/dashboards')).body.items.find(
      (d) => d.name === 'Saclay',
    );
    await as('sup2')
      .put(`/api/dashboards/${source.id}`, {
        version: source.version,
        widgets: [{ key: 'by_status' }],
        filters: { period: 90, sites: ['Paris'] },
      })
      .expect(200);
    const copy = await as('sup2')
      .post('/api/dashboards', { name: 'Saclay copy', copy_of: source.id })
      .expect(201);
    expect(copy.body.widgets).toEqual([{ key: 'by_status', options: {} }]);
    expect(copy.body.filters).toEqual({ period: 90, sites: ['Paris'], categories: [] });
  });

  it('refuses a name already used, ignoring case (BR-K2)', async () => {
    const res = await as('sup2').post('/api/dashboards', { name: 'SACLAY' }).expect(409);
    expect(res.body.details).toMatchObject({ rule: 'BR-K2', fields: { name: 'Already used' } });
  });

  it('refuses invalid bodies', async () => {
    await as('sup2').post('/api/dashboards', {}).expect(400);
    await as('sup2').post('/api/dashboards', { name: '   ' }).expect(400);
    await as('sup2')
      .post('/api/dashboards', { name: 'x'.repeat(61) })
      .expect(400);
    await as('sup2').post('/api/dashboards', { name: 'X', template: 'NOPE' }).expect(400);
    await as('sup2').post('/api/dashboards', { name: 'X', extra: 1 }).expect(400);
  });

  it(`stops at ${MAX_DASHBOARDS} dashboards`, async () => {
    const have = (await as('admin').get('/api/dashboards')).body.items.length;
    for (let i = have; i < MAX_DASHBOARDS; i++) {
      await as('admin')
        .post('/api/dashboards', { name: `Board ${i}` })
        .expect(201);
    }
    const res = await as('admin').post('/api/dashboards', { name: 'One more' }).expect(409);
    expect(res.body.details.rule).toBe('BR-K2');
  });
});

describe('PUT /api/dashboards/:id', () => {
  const create = async (name) =>
    (await as('sup').post('/api/dashboards', { name }).expect(201)).body;

  it('saves widgets, filters and name at the version seen', async () => {
    const board = await create('Edit me');
    const res = await as('sup')
      .put(`/api/dashboards/${board.id}`, {
        version: 1,
        name: 'Edited',
        widgets: [{ key: 'my_work' }, { key: 'by_status', options: {} }],
        filters: { period: 365, sites: ['Lyon', 'Lyon'], categories: ['HVAC'] },
      })
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'Edited',
      version: 2,
      widgets: [
        { key: 'my_work', options: {} },
        { key: 'by_status', options: {} },
      ],
      filters: { period: 365, sites: ['Lyon'], categories: ['HVAC'] },
    });
    const stale = await as('sup')
      .put(`/api/dashboards/${board.id}`, { version: 1, name: 'Again' })
      .expect(409);
    expect(stale.body.details.rule).toBe('BR-V1');
  });

  it('refuses unknown or repeated widgets and invalid filters (BR-K3)', async () => {
    const board = await create('Strict');
    const put = (body) => as('sup').put(`/api/dashboards/${board.id}`, { version: 1, ...body });
    expect(
      (await put({ widgets: [{ key: 'nope' }] }).expect(400)).body.details.fields,
    ).toHaveProperty('widgets');
    await put({ widgets: [{ key: 'my_work' }, { key: 'my_work' }] }).expect(400);
    await put({ widgets: [{ key: 'my_work', options: { x: 1 } }] }).expect(400);
    await put({ filters: { period: 31 } }).expect(400);
    await put({ filters: { categories: ['NOPE'] } }).expect(400);
    await put({}).expect(400);
    await as('sup').put(`/api/dashboards/${board.id}`, { name: 'No version' }).expect(400);
    await as('sup').put('/api/dashboards/999999', { version: 1, name: 'Ghost' }).expect(404);
  });

  it('refuses a name used by another of my dashboards, not by someone else', async () => {
    const board = await create('Rename');
    await as('sup')
      .put(`/api/dashboards/${board.id}`, { version: 1, name: 'overview' })
      .expect(409);
    await as('sup').put(`/api/dashboards/${board.id}`, { version: 1, name: 'Saclay' }).expect(200);
  });
});

describe('PUT /api/dashboards/order and DELETE /api/dashboards/:id', () => {
  it('reorders all my dashboards', async () => {
    const before = ids((await as('sup').get('/api/dashboards')).body.items);
    const wanted = [...before].reverse();
    await as('sup').put('/api/dashboards/order', { ids: wanted }).expect(204);
    expect(ids((await as('sup').get('/api/dashboards')).body.items)).toEqual(wanted);
    await as('sup')
      .put('/api/dashboards/order', { ids: wanted.slice(1) })
      .expect(400);
    await as('sup')
      .put('/api/dashboards/order', { ids: [...wanted, wanted[0]] })
      .expect(400);
    await as('sup').put('/api/dashboards/order', { ids: [] }).expect(400);
  });

  it('deletes at the version seen, never the last one (BR-K2)', async () => {
    const board = (await as('sup').post('/api/dashboards', { name: 'Temporary' }).expect(201)).body;
    await as('sup').delete(`/api/dashboards/${board.id}?version=2`).expect(409);
    await as('sup').delete(`/api/dashboards/${board.id}`).expect(400);
    await as('sup').delete(`/api/dashboards/${board.id}?version=1`).expect(204);
    await as('sup').get(`/api/dashboards/${board.id}`).expect(404);

    // A user with a single dashboard keeps it.
    const single = await supervisorWithOneDashboard();
    const res = await as(single.user).delete(`/api/dashboards/${single.id}?version=1`).expect(409);
    expect(res.body.details.rule).toBe('BR-K2');
  });
});

/** A fresh supervisor whose only dashboard is the "Overview" created on first read. */
async function supervisorWithOneDashboard() {
  const hash = await argon2.hash(TEST_PASSWORD);
  ctx.db
    .prepare(
      "INSERT INTO users (id, username, password_hash, first_name, last_name, role) VALUES (9, 'solo', ?, 'So', 'Lo', 'SUPERVISOR')",
    )
    .run(hash);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'solo', password: TEST_PASSWORD })
    .expect(200);
  tokens.solo = login.body.token;
  const [only] = (await as('solo').get('/api/dashboards').expect(200)).body.items;
  return { user: 'solo', id: only.id };
}

describe('GET /api/dashboard/widgets on the hand-made dataset', () => {
  const TILES = [
    'open_work_orders',
    'in_progress_work_orders',
    'closed_this_month',
    'overdue_work_orders',
    'assets_broken_down',
    'requests_to_review',
    'pending_conflicts',
  ].join(',');
  const values = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.value]));

  it('computes the tiles, with every site and trade', async () => {
    const res = await as('sup').get(`/api/dashboard/widgets?keys=${TILES}`).expect(200);
    expect(res.body).toMatchObject({ today: '2026-10-04', generated_at: NOW.toISOString() });
    expect(values(res.body.widgets)).toEqual({
      open_work_orders: 2,
      in_progress_work_orders: 1,
      closed_this_month: 1,
      overdue_work_orders: 2,
      assets_broken_down: 2,
      requests_to_review: 1,
      pending_conflicts: 1,
    });
  });

  it('applies the site and trade filters to the tiles (conflicts excepted)', async () => {
    expect(values(await widgets('sup', `keys=${TILES}&site=Lyon`))).toEqual({
      open_work_orders: 1,
      in_progress_work_orders: 0,
      closed_this_month: 0,
      overdue_work_orders: 0,
      assets_broken_down: 1,
      requests_to_review: 1,
      pending_conflicts: 1,
    });
    expect(values(await widgets('sup', `keys=${TILES}&category=HVAC`))).toEqual({
      open_work_orders: 1,
      in_progress_work_orders: 1,
      closed_this_month: 0,
      overdue_work_orders: 2,
      assets_broken_down: 1,
      requests_to_review: 0,
      pending_conflicts: 1,
    });
  });

  it('counts work orders by category over the period, sites applied, trades not', async () => {
    const all = (await widgets('sup', 'keys=by_category')).by_category;
    expect(all.period).toBe(30);
    expect(all.items.map((i) => i.category)).toEqual([
      'HVAC',
      'ELECTRICAL',
      'FIRE_SAFETY',
      'PLUMBING',
      'NETWORK_CABLING',
      'SECURITY',
      'UNSPECIFIED',
    ]);
    expect(counts(all.items, 'category')).toMatchObject({
      HVAC: 3,
      ELECTRICAL: 1,
      FIRE_SAFETY: 0,
      PLUMBING: 1,
      UNSPECIFIED: 1,
    });
    const paris = (await widgets('sup', 'keys=by_category&site=Paris&category=ELECTRICAL'))
      .by_category;
    expect(counts(paris.items, 'category')).toMatchObject({
      HVAC: 2,
      ELECTRICAL: 0,
      PLUMBING: 1,
      UNSPECIFIED: 1,
    });
    const quarter = (await widgets('sup', 'keys=by_category&period=90')).by_category;
    expect(counts(quarter.items, 'category').HVAC).toBe(4);
  });

  it('counts work orders by status over the period with every filter', async () => {
    const month = (await widgets('sup', 'keys=by_status')).by_status;
    expect(counts(month.items, 'status')).toEqual({
      OPEN: 2,
      IN_PROGRESS: 0,
      ON_HOLD: 1,
      CLOSED: 2,
      CANCELLED: 1,
    });
    const hvac = (await widgets('sup', 'keys=by_status&period=90&category=HVAC')).by_status;
    expect(counts(hvac.items, 'status')).toEqual({
      OPEN: 1,
      IN_PROGRESS: 1,
      ON_HOLD: 1,
      CLOSED: 1,
      CANCELLED: 0,
    });
  });

  it("gives the user's own work, today and for the next 7 days", async () => {
    const mine = (await widgets('sup', 'keys=my_work&site=Lyon')).my_work;
    expect(mine).toMatchObject({ today: '2026-10-04', week_end: '2026-10-10' });
    expect(ids(mine.today_items)).toEqual([3, 1]);
    expect(ids(mine.week_items)).toEqual([3, 7, 1]);
    expect((await widgets('admin', 'keys=my_work')).my_work.week_items).toEqual([]);
  });

  it('lists the recent activity with the filters', async () => {
    expect(ids((await widgets('sup', 'keys=recent_activity')).recent_activity.items)).toEqual([
      7, 6, 5, 4, 3,
    ]);
    expect(
      ids((await widgets('sup', 'keys=recent_activity&site=Paris')).recent_activity.items),
    ).toEqual([7, 6, 4, 3, 1]);
  });

  it('computes only the widgets asked for', async () => {
    expect(Object.keys(await widgets('sup', 'keys=by_status,pending_conflicts'))).toEqual([
      'by_status',
      'pending_conflicts',
    ]);
  });

  it('refuses missing or unknown widgets and invalid filters', async () => {
    await as('sup').get('/api/dashboard/widgets').expect(400);
    await as('sup').get('/api/dashboard/widgets?keys=nope').expect(400);
    await as('sup').get('/api/dashboard/widgets?keys=my_work&period=7').expect(400);
    await as('sup').get('/api/dashboard/widgets?keys=my_work&category=NOPE').expect(400);
  });
});

describe('GET /api/dashboard/widgets/:key/rows (BR-K4)', () => {
  const rows = async (url) =>
    (await as('sup').get(`/api/dashboard/widgets/${url}`).expect(200)).body;

  it('lists the work orders counted by a widget or one of its segments', async () => {
    const closed = await rows('closed_this_month/rows');
    expect(closed).toMatchObject({ kind: 'work_orders', total: 1, truncated: false });
    expect(ids(closed.items)).toEqual([4]);
    expect(closed.items[0]).toHaveProperty('assignee');
    expectNoSecrets(closed);

    expect(ids((await rows('by_category/rows?segment=UNSPECIFIED')).items)).toEqual([4]);
    expect(ids((await rows('by_category/rows?segment=HVAC&site=Paris')).items)).toEqual([1, 7]);
    expect((await rows('by_status/rows')).total).toBe(6);
    expect(ids((await rows('by_status/rows?segment=CLOSED&period=90')).items)).toEqual([4, 5]);
    expect(ids((await rows('my_work/rows?segment=today')).items)).toEqual([3, 1]);
    expect(ids((await rows('recent_activity/rows?site=Lyon')).items)).toEqual([5, 2]);
  });

  it('lists assets for the asset widget', async () => {
    const broken = await rows('assets_broken_down/rows?site=Paris');
    expect(broken.kind).toBe('assets');
    expect(broken.items.map((a) => a.code)).toEqual(['AST-0001']);
  });

  it('matches the figures of the widget', async () => {
    const figures = await widgets('sup', 'keys=by_status&period=90&site=Paris');
    for (const { status, count } of figures.by_status.items) {
      expect((await rows(`by_status/rows?segment=${status}&period=90&site=Paris`)).total).toBe(
        count,
      );
    }
  });

  it('refuses unknown segments and widgets without records', async () => {
    await as('sup').get('/api/dashboard/widgets/by_status/rows?segment=NOPE').expect(400);
    await as('sup').get('/api/dashboard/widgets/open_work_orders/rows?segment=OPEN').expect(400);
    await as('sup').get('/api/dashboard/widgets/pending_conflicts/rows').expect(404);
    await as('sup').get('/api/dashboard/widgets/nope/rows').expect(400);
    await as('tech1').get('/api/dashboard/widgets/by_status/rows').expect(403);
  });
});
