// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { TEMPLATES, WIDGET_KEYS } from '../../src/rules/dashboards.js';
import { NOW, TEST_CONFIG, expectNoSecrets } from '../helpers/app.js';
import { SITE_ID, TEST_PASSWORD, addSites, createTestDb } from '../helpers/db.js';

// Widgets switched on or off by the administrators (D65). Its own database: switching a
// widget off changes what every other dashboard test would see.
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
  db.prepare(
    `INSERT INTO assets (id, code, name, site, location_id, category, criticality, status)
     VALUES (1, 'AST-0001', 'A', 'Paris', ${SITE_ID("'Paris'")}, 'HVAC', 'LOW', 'BROKEN_DOWN')`,
  ).run();

  app = createApp({
    db,
    config: TEST_CONFIG,
    now: () => NOW,
    loginRateLimit: { windowMs: 60_000, limit: 100 },
  });
  for (const username of ['admin', 'sup', 'sup2', 'tech1']) {
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
  };
};
const keysOf = (dashboard) => dashboard.widgets.map((w) => w.key);
const setEnabled = (key, enabled) =>
  as('admin').put(`/api/dashboards/widgets/${key}`, { enabled }).expect(200);

describe('GET and PUT /api/dashboards/widgets', () => {
  it('lists every widget of the catalogue, on until switched off', async () => {
    const res = await as('admin').get('/api/dashboards/widgets').expect(200);
    expect(res.body.items.map((i) => i.key)).toEqual(WIDGET_KEYS);
    expect(res.body.items[0]).toEqual({
      key: WIDGET_KEYS[0],
      enabled: true,
      updated_by: null,
      updated_at: null,
    });
  });

  it('switches a widget off and on again, keeping who did it', async () => {
    const off = await setEnabled('workload', false);
    expect(off.body).toEqual({
      key: 'workload',
      enabled: false,
      updated_by: { id: 1, last_name: 'Admin', first_name: 'Ada' },
      updated_at: NOW.toISOString(),
    });
    expectNoSecrets(off.body);
    const list = (await as('admin').get('/api/dashboards/widgets').expect(200)).body.items;
    expect(list.find((i) => i.key === 'workload').enabled).toBe(false);
    expect((await setEnabled('workload', true)).body.enabled).toBe(true);
  });

  it('is for administrators only, with a known key and a boolean', async () => {
    await request(app).get('/api/dashboards/widgets').expect(401);
    await as('sup').get('/api/dashboards/widgets').expect(403);
    await as('sup').put('/api/dashboards/widgets/by_status', { enabled: false }).expect(403);
    await as('tech1').put('/api/dashboards/widgets/by_status', { enabled: false }).expect(403);
    await as('admin').put('/api/dashboards/widgets/nope', { enabled: false }).expect(400);
    await as('admin').put('/api/dashboards/widgets/by_status', { enabled: 'no' }).expect(400);
    await as('admin').put('/api/dashboards/widgets/by_status', {}).expect(400);
  });
});

describe('a widget switched off', () => {
  beforeAll(async () => {
    await setEnabled('by_status', false);
    await setEnabled('assets_broken_down', false);
  });

  it('is named in the dashboard list and left out of new dashboards of supervisors', async () => {
    const res = await as('sup').get('/api/dashboards').expect(200);
    expect(res.body.disabled_widgets.sort()).toEqual(['assets_broken_down', 'by_status']);
    const [overview] = res.body.items;
    expect(keysOf(overview)).toEqual(
      TEMPLATES.OVERVIEW.filter((k) => !['by_status', 'assets_broken_down'].includes(k)),
    );
    const created = await as('sup')
      .post('/api/dashboards', { name: 'Backlog', template: 'OVERVIEW' })
      .expect(201);
    expect(keysOf(created.body)).not.toContain('by_status');
    // Administrators keep every widget, to test the ones switched off.
    const mine = (await as('admin').get('/api/dashboards').expect(200)).body.items[0];
    expect(keysOf(mine)).toEqual(TEMPLATES.OVERVIEW);
  });

  it('cannot be added by a supervisor, but stays on a dashboard that had it', async () => {
    const dashboard = (
      await as('sup2').post('/api/dashboards', { name: 'Mine', template: 'EMPTY' }).expect(201)
    ).body;
    const added = await as('sup2')
      .put(`/api/dashboards/${dashboard.id}`, {
        version: 1,
        widgets: [{ key: 'by_status' }],
      })
      .expect(400);
    expect(added.body.details.fields.widgets).toMatch(/by_status/);

    // A widget added before it was switched off: reordering keeps it, hidden.
    await setEnabled('by_status', true);
    const saved = (
      await as('sup2')
        .put(`/api/dashboards/${dashboard.id}`, {
          version: 1,
          widgets: [{ key: 'by_status' }, { key: 'my_work' }],
        })
        .expect(200)
    ).body;
    await setEnabled('by_status', false);
    const reordered = await as('sup2')
      .put(`/api/dashboards/${dashboard.id}`, {
        version: saved.version,
        widgets: [{ key: 'my_work' }, { key: 'by_status' }],
      })
      .expect(200);
    expect(keysOf(reordered.body)).toEqual(['my_work', 'by_status']);

    const admin = (await as('admin').get('/api/dashboards').expect(200)).body.items[0];
    await as('admin')
      .put(`/api/dashboards/${admin.id}`, {
        version: admin.version,
        widgets: [{ key: 'by_status' }],
      })
      .expect(200);
  });

  it('has no figures, records or drill-down for supervisors', async () => {
    const figures = await as('sup')
      .get('/api/dashboard/widgets?keys=by_status,by_category')
      .expect(200);
    expect(Object.keys(figures.body.widgets)).toEqual(['by_category']);
    const none = await as('sup').get('/api/dashboard/widgets?keys=by_status').expect(200);
    expect(none.body.widgets).toEqual({});

    const rows = await as('sup').get('/api/dashboard/widgets/by_status/rows').expect(403);
    expect(rows.body.details.rule).toBe('D65');
    await as('sup').get('/api/work-orders?drill=by_status:OPEN').expect(403);
    await as('tech1').get('/api/work-orders?drill=by_status:OPEN').expect(403);
    await as('sup').get('/api/assets?drill=assets_broken_down').expect(403);
    await as('sup').get('/api/work-orders?drill=by_category:HVAC').expect(200);
  });

  it('keeps working for administrators', async () => {
    const figures = await as('admin').get('/api/dashboard/widgets?keys=by_status').expect(200);
    expect(Object.keys(figures.body.widgets)).toEqual(['by_status']);
    await as('admin').get('/api/dashboard/widgets/by_status/rows').expect(200);
    await as('admin').get('/api/work-orders?drill=by_status:OPEN').expect(200);
    const assets = await as('admin').get('/api/assets?drill=assets_broken_down').expect(200);
    expect(assets.body.items.map((a) => a.code)).toEqual(['AST-0001']);
  });
});
