// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { NOW, TEST_CONFIG } from '../helpers/app.js';
import { TEST_PASSWORD, createTestDb } from '../helpers/db.js';

/**
 * Responsiveness, asset and people widgets (Phase 24) on a hand-made dataset, values computed
 * by hand. Today is Sunday 2026-10-04 (week 40, Europe/Paris); the 30-day period starts on
 * 2026-09-05.
 *
 * Assets: A1 Paris HVAC critical, A2 Paris HVAC low, A3 Lyon electrical high, A4 Lyon
 * plumbing critical, A5 Paris HVAC low.
 *
 *  id  name  type        prio    status       asset  created     closed      est  act  notes
 *  1   W1    PREVENTIVE  URGENT  CLOSED       —      09-10 08:00 09-11       2    3    started +2 h, closed +24 h
 *  2   W2    PREVENTIVE  URGENT  CLOSED       —      09-12 08:00 09-14       4    2    started +4 h, closed +48 h
 *  3   W3    PREVENTIVE  URGENT  IN_PROGRESS  —      09-15 08:00             4         started +1 h; tech1
 *  4   W4    PREVENTIVE  NORMAL  CLOSED       —      08-01 08:00 09-20                 started before the period; closed +1200 h
 *  5   R1    request     NORMAL  CLOSED       —      09-20 08:00 09-22                 reviewed +4 h, approved; closed +48 h
 *  6   R2    request     NORMAL  CANCELLED    —      09-25 08:00                       reviewed +24 h, rejected
 *  7   R3    request     NORMAL  OPEN         —      10-01 08:00                       waiting for review, unassigned
 *  8   C1    CORRECTIVE  NORMAL  CLOSED       A1     08-01       09-01
 *  9   C2    CORRECTIVE  NORMAL  CLOSED       A1     09-30       10-02       1    1    29 days after C1: repeat
 *  10  C3    CORRECTIVE  URGENT  OPEN         A1     10-02                   6         C2 closed the same day: repeat; tech1
 *  11  C4    CORRECTIVE  NORMAL  CLOSED       A2     08-10       08-20
 *  12  C5    CORRECTIVE  NORMAL  OPEN         A2     09-20                             31 days after C4: not a repeat; tech2
 *  13  C6    CORRECTIVE  HIGH    OPEN         A3     09-15                   3         2 h worked on 09-30; sup
 *  14  C7    CORRECTIVE  NORMAL  CANCELLED    A3     09-16                             cancelled: never counted
 *  15  C8    CORRECTIVE  NORMAL  CLOSED       A4     09-05       09-06       2    5    first day of the period
 *  16  C10   CORRECTIVE  NORMAL  CLOSED       A5     08-01       08-25
 *  17  C11   CORRECTIVE  NORMAL  OPEN         A5     09-24                             30 days after C10: not a repeat
 *
 * Asset history: A1 broke down 2026-09-28T22:30Z (09-29 in Paris), repaired 10-01; A3 created
 * broken down on 08-01, still down; A4 has no history.
 */
let ctx;
let app;
let token;

beforeAll(async () => {
  ctx = createTestDb();
  const { db } = ctx;
  const hash = await argon2.hash(TEST_PASSWORD);
  const user = db.prepare(
    `INSERT INTO users (id, username, password_hash, first_name, last_name, role, site)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  user.run(2, 'sup', hash, 'Sam', 'Sup', 'SUPERVISOR', 'Paris');
  user.run(4, 'tech1', hash, 'Tia', 'One', 'TECHNICIAN', 'Paris');
  user.run(5, 'tech2', hash, 'Tom', 'Two', 'TECHNICIAN', 'Lyon');
  user.run(6, 'staff', hash, 'Stan', 'Staff', 'STAFF', 'Paris');

  const asset = db.prepare(
    "INSERT INTO assets (id, code, name, site, category, criticality, status) VALUES (?, ?, 'A', ?, ?, ?, ?)",
  );
  asset.run(1, 'AST-0001', 'Paris', 'HVAC', 'CRITICAL', 'IN_SERVICE');
  asset.run(2, 'AST-0002', 'Paris', 'HVAC', 'LOW', 'IN_SERVICE');
  asset.run(3, 'AST-0003', 'Lyon', 'ELECTRICAL', 'HIGH', 'BROKEN_DOWN');
  asset.run(4, 'AST-0004', 'Lyon', 'PLUMBING', 'CRITICAL', 'IN_SERVICE');
  asset.run(5, 'AST-0005', 'Paris', 'HVAC', 'LOW', 'IN_SERVICE');

  const wo = db.prepare(`INSERT INTO work_orders
    (id, number, type, status, priority, title, asset_id, site, category, assignee_id,
     created_on, closed_on, estimated_hours, actual_hours, work_report, review_status,
     reviewed_at, created_by, created_at, updated_at)
    VALUES (@id, @number, @type, @status, @priority, 'Job', @asset, @site, @category, @assignee,
     @created_on, @closed, @est, @act, @report, @review, @reviewed_at, @created_by, @created_at,
     @created_at)`);
  const sites = { 1: 'Paris', 2: 'Paris', 3: 'Lyon', 4: 'Lyon', 5: 'Paris' };
  const trades = { 1: 'HVAC', 2: 'HVAC', 3: 'ELECTRICAL', 4: 'PLUMBING', 5: 'HVAC' };
  const rows = [
    // id, type, priority, status, asset, created_at, closed, est, act, assignee, review, reviewed_at
    [1, 'PREVENTIVE', 'URGENT', 'CLOSED', null, '2026-09-10T08:00:00.000Z', '2026-09-11', 2, 3],
    [2, 'PREVENTIVE', 'URGENT', 'CLOSED', null, '2026-09-12T08:00:00.000Z', '2026-09-14', 4, 2],
    [3, 'PREVENTIVE', 'URGENT', 'IN_PROGRESS', null, '2026-09-15T08:00:00.000Z', null, 4, null, 4],
    [
      4,
      'PREVENTIVE',
      'NORMAL',
      'CLOSED',
      null,
      '2026-08-01T08:00:00.000Z',
      '2026-09-20',
      null,
      null,
    ],
    [
      5,
      'CORRECTIVE',
      'NORMAL',
      'CLOSED',
      null,
      '2026-09-20T08:00:00.000Z',
      '2026-09-22',
      null,
      null,
      4,
      'APPROVED',
      '2026-09-20T12:00:00.000Z',
    ],
    [
      6,
      'CORRECTIVE',
      'NORMAL',
      'CANCELLED',
      null,
      '2026-09-25T08:00:00.000Z',
      null,
      null,
      null,
      null,
      'REJECTED',
      '2026-09-26T08:00:00.000Z',
    ],
    [
      7,
      'CORRECTIVE',
      'NORMAL',
      'OPEN',
      null,
      '2026-10-01T08:00:00.000Z',
      null,
      null,
      null,
      null,
      'PENDING',
      null,
    ],
    [8, 'CORRECTIVE', 'NORMAL', 'CLOSED', 1, '2026-08-01T08:00:00.000Z', '2026-09-01', null, null],
    [9, 'CORRECTIVE', 'NORMAL', 'CLOSED', 1, '2026-09-30T08:00:00.000Z', '2026-10-02', 1, 1],
    [10, 'CORRECTIVE', 'URGENT', 'OPEN', 1, '2026-10-02T08:00:00.000Z', null, 6, null, 4],
    [11, 'CORRECTIVE', 'NORMAL', 'CLOSED', 2, '2026-08-10T08:00:00.000Z', '2026-08-20', null, null],
    [12, 'CORRECTIVE', 'NORMAL', 'OPEN', 2, '2026-09-20T08:00:00.000Z', null, null, null, 5],
    [13, 'CORRECTIVE', 'HIGH', 'OPEN', 3, '2026-09-15T08:00:00.000Z', null, 3, null, 2],
    [14, 'CORRECTIVE', 'NORMAL', 'CANCELLED', 3, '2026-09-16T08:00:00.000Z', null, null, null],
    [15, 'CORRECTIVE', 'NORMAL', 'CLOSED', 4, '2026-09-05T08:00:00.000Z', '2026-09-06', 2, 5],
    [16, 'CORRECTIVE', 'NORMAL', 'CLOSED', 5, '2026-08-01T08:00:00.000Z', '2026-08-25', null, null],
    [17, 'CORRECTIVE', 'NORMAL', 'OPEN', 5, '2026-09-24T08:00:00.000Z', null, null, null],
  ];
  for (const [
    id,
    type,
    priority,
    status,
    assetId,
    createdAt,
    closed,
    est,
    act,
    assignee,
    review,
    reviewedAt,
  ] of rows) {
    wo.run({
      id,
      number: `WO-2026-${String(id).padStart(5, '0')}`,
      type,
      status,
      priority,
      asset: assetId,
      site: assetId ? sites[assetId] : 'Paris',
      category: assetId ? trades[assetId] : id <= 4 ? 'HVAC' : null,
      assignee: assignee ?? null,
      created_on: createdAt.slice(0, 10),
      closed,
      est,
      act,
      report: closed ? 'Done' : null,
      review: review ?? null,
      reviewed_at: reviewedAt ?? null,
      created_by: review ? 6 : 2,
      created_at: createdAt,
    });
  }

  const log = db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action, changes, label, user_id, version, at)
     VALUES (?, ?, ?, ?, 'x', 2, 1, ?)`,
  );
  const status = (entity, id, to, at, action = 'UPDATE') =>
    log.run(entity, id, action, JSON.stringify({ status: { from: null, to } }), at);
  status('work_orders', 1, 'IN_PROGRESS', '2026-09-10T10:00:00.000Z');
  status('work_orders', 1, 'CLOSED', '2026-09-11T08:00:00.000Z');
  status('work_orders', 2, 'IN_PROGRESS', '2026-09-12T12:00:00.000Z');
  status('work_orders', 2, 'CLOSED', '2026-09-14T08:00:00.000Z');
  status('work_orders', 3, 'IN_PROGRESS', '2026-09-15T09:00:00.000Z');
  status('work_orders', 4, 'IN_PROGRESS', '2026-08-02T08:00:00.000Z');
  status('work_orders', 4, 'CLOSED', '2026-09-20T08:00:00.000Z');
  status('work_orders', 5, 'CLOSED', '2026-09-22T08:00:00.000Z');
  status('assets', 1, 'IN_SERVICE', '2026-01-01T08:00:00.000Z', 'CREATE');
  status('assets', 1, 'BROKEN_DOWN', '2026-09-28T22:30:00.000Z');
  status('assets', 1, 'IN_SERVICE', '2026-10-01T10:00:00.000Z');
  status('assets', 3, 'BROKEN_DOWN', '2026-08-01T08:00:00.000Z', 'CREATE');

  db.prepare(
    `INSERT INTO allocations (kind, work_order_id, technician_id, day, hours, created_by, created_at, updated_at)
     VALUES ('WORK', 13, 2, '2026-09-30', 2, 2, 'x', 'x')`,
  ).run();
  db.prepare(
    `INSERT INTO capacity_overrides (technician_id, day, hours, reason, updated_by, updated_at)
     VALUES (5, '2026-09-29', 0, 'LEAVE', 2, 'x')`,
  ).run();

  app = createApp({ db, config: TEST_CONFIG, now: () => NOW });
  token = (
    await request(app).post('/api/auth/login').send({ username: 'sup', password: TEST_PASSWORD })
  ).body.token;
});
afterAll(() => ctx.cleanup());

const get = (url) => request(app).get(url).set('Authorization', `Bearer ${token}`);
const widget = async (key, query = '') =>
  (await get(`/api/dashboard/widgets?keys=${key}${query}`).expect(200)).body.widgets[key];
const ids = (items) => items.map((w) => w.id).sort((a, b) => a - b);
const drill = async (value, query = '', entity = 'work-orders') =>
  ids(
    (await get(`/api/${entity}?drill=${encodeURIComponent(value)}${query}&size=100`).expect(200))
      .body.items,
  );
const rows = async (key, query = '') =>
  (await get(`/api/dashboard/widgets/${key}/rows?${query}`).expect(200)).body;

describe('response_times', () => {
  it('gives the median and 90th percentile per priority, from the status history', async () => {
    const data = await widget('response_times');
    const urgent = data.rows.find((r) => r.priority === 'URGENT');
    expect(urgent.start).toEqual({ count: 3, median: 2, p90: 4 });
    expect(urgent.close).toEqual({ count: 2, median: 36, p90: 48 });
    const normal = data.rows.find((r) => r.priority === 'NORMAL');
    expect(normal.start).toEqual({ count: 0, median: null, p90: null });
    expect(normal.close).toEqual({ count: 2, median: 624, p90: 1200 });
    expect(data.rows.map((r) => r.priority)).toEqual(['URGENT', 'HIGH', 'NORMAL', 'LOW']);
    expect(data.start).toEqual({ count: 3, median: 2, p90: 4 });
  });

  it('lists the work orders of a priority, the slowest first in the export', async () => {
    expect(await drill('response_times:start:URGENT')).toEqual([1, 2, 3]);
    const exported = await rows('response_times', 'segment=close');
    expect(exported.items.map((w) => [w.id, w.dashboard.hours])).toEqual([
      [4, 1200],
      [2, 48],
      [5, 48],
      [1, 24],
    ]);
  });
});

describe('request_service', () => {
  it('measures review and completion times and the share rejected', async () => {
    const data = await widget('request_service');
    expect(data).toMatchObject({
      count: 3,
      reviewed: 2,
      rejected: 1,
      rejected_share: 0.5,
      review_median: 14,
      done_median: 48,
    });
    // R1 on Sunday 09-20 (week 38), R2 in week 39.
    expect(data.buckets.find((b) => b.key === '2026-W38')).toMatchObject({ count: 1, rejected: 0 });
    expect(data.buckets.find((b) => b.key === '2026-W39')).toMatchObject({ count: 1, rejected: 1 });
  });

  it('counts a request withdrawn before its review, but not as reviewed (D79)', async () => {
    ctx.db
      .prepare(
        `INSERT INTO work_orders (id, number, type, status, priority, title, site, created_on,
           review_status, created_by, created_at, updated_at)
         VALUES (99, 'WO-2026-00099', 'CORRECTIVE', 'CANCELLED', 'NORMAL', 'Job', 'Paris',
           '2026-10-02', 'WITHDRAWN', 6, '2026-10-02T08:00:00.000Z', '2026-10-02T09:00:00.000Z')`,
      )
      .run();
    try {
      expect(await widget('request_service')).toMatchObject({
        count: 4,
        reviewed: 2,
        rejected: 1,
        rejected_share: 0.5,
        review_median: 14,
      });
    } finally {
      ctx.db.prepare('DELETE FROM work_orders WHERE id = 99').run();
    }
  });

  it('lists the rejected requests', async () => {
    expect(await drill('request_service:rejected')).toEqual([6]);
    expect(await drill('request_service:pending')).toEqual([7]);
  });
});

describe('bad_actors and repeat_failures', () => {
  it('ranks assets by corrective work in the period, with the cumulative share', async () => {
    const data = await widget('bad_actors');
    expect(data.all.total).toBe(6);
    expect(data.all.items.map((i) => [i.asset.code, i.count])).toEqual([
      ['AST-0001', 2],
      ['AST-0002', 1],
      ['AST-0003', 1],
      ['AST-0004', 1],
      ['AST-0005', 1],
    ]);
    expect(data.all.items.map((i) => i.cumulative)).toEqual([1 / 3, 1 / 2, 2 / 3, 5 / 6, 1]);
    expect(data.critical.total).toBe(4);
    expect(data.critical.items.map((i) => [i.asset.code, i.count, i.cumulative])).toEqual([
      ['AST-0001', 2, 0.5],
      ['AST-0003', 1, 0.75],
      ['AST-0004', 1, 1],
    ]);
    expect(await drill('bad_actors:asset:1')).toEqual([9, 10]);
    expect(await drill('bad_actors:critical')).toEqual([9, 10, 13, 15]);
  });

  it('counts repeat failures under 30 days (29 counts, 30 and 31 do not)', async () => {
    const data = await widget('repeat_failures');
    expect(data).toEqual({ value: 2, total: 6, share: 2 / 6 });
    expect(await drill('repeat_failures')).toEqual([9, 10]);
    const exported = await rows('repeat_failures');
    expect(exported.items.map((w) => [w.id, w.dashboard])).toEqual([
      [10, { previous: 'WO-2026-00009', days_since_previous: 0 }],
      [9, { previous: 'WO-2026-00008', days_since_previous: 29 }],
    ]);
  });
});

describe('critical_downtime', () => {
  it('sums the days high and critical assets were broken down, per site', async () => {
    const data = await widget('critical_downtime');
    expect(data.items).toEqual([
      { site: 'Lyon', days: 30, assets: 1, down_today: 1 },
      { site: 'Paris', days: 3, assets: 1, down_today: 0 },
    ]);
    expect(data).toMatchObject({ days: 33, down_today: 1, watched: 3 });
  });

  it('lists the assets of a site in the asset list and the export', async () => {
    expect(await drill('critical_downtime:site:Lyon', '', 'assets')).toEqual([3]);
    expect(await drill('critical_downtime', '', 'assets')).toEqual([1, 3]);
    const exported = await rows('critical_downtime');
    expect(exported.kind).toBe('assets');
    expect(exported.items.map((a) => [a.code, a.dashboard.days_down])).toEqual([
      ['AST-0003', 30],
      ['AST-0001', 3],
    ]);
    await get('/api/assets?drill=critical_downtime:site:Nowhere').expect(400);
    await get('/api/assets?drill=by_status').expect(400);
    await get('/api/assets?period=30').expect(400);
  });
});

describe('workload', () => {
  it('counts unfinished work per person by priority, with hours left and this week', async () => {
    const data = await widget('workload');
    expect(data.week).toBe('2026-W40');
    expect(data.priorities).toEqual(['URGENT', 'HIGH', 'NORMAL', 'LOW']);
    expect(data.people).toEqual([
      {
        id: 4,
        first_name: 'Tia',
        last_name: 'One',
        role: 'TECHNICIAN',
        counts: [2, 0, 0, 0],
        total: 2,
        hours_left: 10,
        booked: 0,
        capacity: 35,
      },
      {
        id: 2,
        first_name: 'Sam',
        last_name: 'Sup',
        role: 'SUPERVISOR',
        counts: [0, 1, 0, 0],
        total: 1,
        hours_left: 1,
        booked: 2,
        capacity: 35,
      },
      {
        id: 5,
        first_name: 'Tom',
        last_name: 'Two',
        role: 'TECHNICIAN',
        counts: [0, 0, 1, 0],
        total: 1,
        hours_left: 0,
        booked: 0,
        capacity: 28,
      },
    ]);
    // R3 and C11 have nobody assigned.
    expect(data.unassigned).toEqual({ counts: [0, 0, 2, 0], total: 2, hours_left: 0 });
  });

  it('lists the unfinished work of a person or the unassigned work', async () => {
    expect(await drill('workload:person:4')).toEqual([3, 10]);
    expect(await drill('workload:person:4:URGENT')).toEqual([3, 10]);
    expect(await drill('workload:UNASSIGNED')).toEqual([7, 17]);
    await get('/api/work-orders?drill=workload:person:x').expect(400);
  });
});

describe('estimate_accuracy', () => {
  it('compares actual and estimated hours per trade', async () => {
    const data = await widget('estimate_accuracy');
    expect(data.items).toEqual([
      { category: 'PLUMBING', count: 1, estimated: 2, actual: 5, ratio: 2.5 },
      { category: 'HVAC', count: 3, estimated: 7, actual: 6, ratio: 6 / 7 },
    ]);
    expect(data).toMatchObject({ count: 4, ratio: 11 / 9 });
  });

  it('lists the work of a trade, the biggest overrun first in the export', async () => {
    expect(await drill('estimate_accuracy:HVAC')).toEqual([1, 2, 9]);
    const exported = await rows('estimate_accuracy', 'segment=HVAC');
    expect(exported.items.map((w) => [w.id, w.dashboard.ratio])).toEqual([
      [1, 1.5],
      [9, 1],
      [2, 0.5],
    ]);
  });
});

describe('templates', () => {
  it('builds the "Assets and people" dashboard, whose figures all load together', async () => {
    const created = await request(app)
      .post('/api/dashboards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Assets and people', template: 'ASSETS_PEOPLE' })
      .expect(201);
    const keys = created.body.widgets.map((w) => w.key);
    expect(keys).toEqual([
      'assets_broken_down',
      'repeat_failures',
      'bad_actors',
      'critical_downtime',
      'response_times',
      'estimate_accuracy',
      'request_service',
    ]);
    const res = await get(`/api/dashboard/widgets?keys=${keys.join(',')}`).expect(200);
    expect(Object.keys(res.body.widgets)).toEqual(keys);
  });
});
