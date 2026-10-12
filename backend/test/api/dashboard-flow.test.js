// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { NOW, TEST_CONFIG, TODAY } from '../helpers/app.js';
import { TEST_PASSWORD, createTestDb } from '../helpers/db.js';

/**
 * Flow and backlog widgets (Phase 22) on a hand-made dataset, values computed by hand.
 * Today is Sunday 2026-10-04 (Europe/Paris). The 30-day period starts on 2026-09-05; its
 * weeks: W36 (09-05 → 09-06, partial), W37 (09-07 → 13), W38 (14 → 20), W39 (21 → 27),
 * W40 (09-28 → 10-04).
 *
 *  id type         status       prio    site   trade       created     closed      est  act  notes
 *  1  CORRECTIVE   OPEN         URGENT  Paris  HVAC        2026-10-01              4         age 3
 *  2  CORRECTIVE   OPEN         HIGH    Paris  HVAC        2026-08-20              10        age 45; 3 h worked on 09-30, 2 h planned 10-05 → 7 h left
 *  3  PREVENTIVE   IN_PROGRESS  NORMAL  Lyon   ELECTRICAL  2026-09-04              —         age 30, no estimate
 *  4  REGULATORY   CLOSED       NORMAL  Paris  HVAC        2026-09-08  2026-09-15  2    3
 *  5  CORRECTIVE   CLOSED       LOW     Lyon   ELECTRICAL  2026-09-10  2026-10-02  1    1.5  staff request
 *  6  IMPROVEMENT  CLOSED       NORMAL  Paris  —           2026-09-05  2026-09-06       —
 *  7  CORRECTIVE   CANCELLED    NORMAL  Paris  PLUMBING    2026-09-21                        cancelled 2026-09-27T22:30Z = 09-28 in Paris
 *  8  CORRECTIVE   ON_HOLD      URGENT  Lyon   —           2026-06-01              5         age 125
 *  9  CORRECTIVE   CLOSED       HIGH    Paris  HVAC        2026-07-01  2026-09-01            closed before the period
 *  10 CORRECTIVE   CANCELLED    NORMAL  Lyon   HVAC        2026-09-30                        no audit entry: last update 2026-10-03
 *
 * Capacity (7 h × 5 days, no reserve): HVAC 70 h (sup, tech1 in Paris), ELECTRICAL 35 h
 * (tech2 in Lyon); tech3 has no trade, tech4 is inactive.
 */
let ctx;
let app;
let token;

beforeAll(async () => {
  ctx = createTestDb();
  const { db } = ctx;
  const hash = await argon2.hash(TEST_PASSWORD);
  const user = db.prepare(
    `INSERT INTO users (id, username, password_hash, first_name, last_name, role, specialty, site, is_active)
     VALUES (?, ?, ?, 'A', 'B', ?, ?, ?, ?)`,
  );
  user.run(2, 'sup', hash, 'SUPERVISOR', 'HVAC', 'Paris', 1);
  user.run(4, 'tech1', hash, 'TECHNICIAN', 'HVAC', 'Paris', 1);
  user.run(5, 'tech2', hash, 'TECHNICIAN', 'ELECTRICAL', 'Lyon', 1);
  user.run(6, 'tech3', hash, 'TECHNICIAN', null, 'Lyon', 1);
  user.run(7, 'tech4', hash, 'TECHNICIAN', 'HVAC', 'Paris', 0);

  const wo = db.prepare(`INSERT INTO work_orders
    (id, number, type, status, priority, title, site, category, created_on, started_on, closed_on,
     estimated_hours, actual_hours, work_report, review_status, created_by, created_at, updated_at)
    VALUES (@id, @number, @type, @status, @priority, 'Job', @site, @category, @created, @started,
     @closed, @est, @act, @report, @review, 2, '2026-10-01T08:00:00.000Z', @updated)`);
  const rows = [
    [1, 'CORRECTIVE', 'OPEN', 'URGENT', 'Paris', 'HVAC', '2026-10-01', null, 4, null],
    [2, 'CORRECTIVE', 'OPEN', 'HIGH', 'Paris', 'HVAC', '2026-08-20', null, 10, null],
    [
      3,
      'PREVENTIVE',
      'IN_PROGRESS',
      'NORMAL',
      'Lyon',
      'ELECTRICAL',
      '2026-09-04',
      null,
      null,
      null,
    ],
    [4, 'REGULATORY', 'CLOSED', 'NORMAL', 'Paris', 'HVAC', '2026-09-08', '2026-09-15', 2, 3],
    [5, 'CORRECTIVE', 'CLOSED', 'LOW', 'Lyon', 'ELECTRICAL', '2026-09-10', '2026-10-02', 1, 1.5],
    [6, 'IMPROVEMENT', 'CLOSED', 'NORMAL', 'Paris', null, '2026-09-05', '2026-09-06', null, null],
    [7, 'CORRECTIVE', 'CANCELLED', 'NORMAL', 'Paris', 'PLUMBING', '2026-09-21', null, null, null],
    [8, 'CORRECTIVE', 'ON_HOLD', 'URGENT', 'Lyon', null, '2026-06-01', null, 5, null],
    [9, 'CORRECTIVE', 'CLOSED', 'HIGH', 'Paris', 'HVAC', '2026-07-01', '2026-09-01', null, null],
    [10, 'CORRECTIVE', 'CANCELLED', 'NORMAL', 'Lyon', 'HVAC', '2026-09-30', null, null, null],
  ];
  for (const [id, type, status, priority, site, category, created, closed, est, act] of rows) {
    wo.run({
      id,
      number: `WO-2026-${String(id).padStart(5, '0')}`,
      type,
      status,
      priority,
      site,
      category,
      created,
      started: ['IN_PROGRESS', 'ON_HOLD', 'CLOSED'].includes(status) ? created : null,
      closed,
      est,
      act,
      report: closed ? 'Done' : null,
      review: id === 5 ? 'APPROVED' : null,
      updated: id === 10 ? '2026-10-03T10:00:00.000Z' : '2026-10-01T08:00:00.000Z',
    });
  }
  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action, changes, label, user_id, version, at)
     VALUES ('work_orders', 7, 'UPDATE', '{"status":{"from":"OPEN","to":"CANCELLED"}}', 'WO-2026-00007', 2, 2,
       '2026-09-27T22:30:00.000Z')`,
  ).run();
  const block = db.prepare(
    `INSERT INTO allocations (kind, work_order_id, technician_id, day, hours, created_by, created_at, updated_at)
     VALUES ('WORK', 2, 4, ?, ?, 2, 'x', 'x')`,
  );
  block.run('2026-09-30', 3);
  block.run('2026-10-05', 2);

  app = createApp({ db, config: TEST_CONFIG, now: () => NOW });
  token = (
    await request(app).post('/api/auth/login').send({ username: 'sup', password: TEST_PASSWORD })
  ).body.token;
});
afterAll(() => ctx.cleanup());

const get = (url) => request(app).get(url).set('Authorization', `Bearer ${token}`);
const widget = async (key, query = '') =>
  (await get(`/api/dashboard/widgets?keys=${key}${query}`).expect(200)).body.widgets[key];
const ids = (items) => items.map((w) => w.id);
const drill = async (value, query = '') =>
  ids(
    (await get(`/api/work-orders?drill=${encodeURIComponent(value)}${query}&size=100`).expect(200))
      .body.items,
  ).sort((a, b) => a - b);
const rows = async (key, segment, query = '') =>
  ids(
    (
      await get(
        `/api/dashboard/widgets/${key}/rows?segment=${encodeURIComponent(segment)}${query}`,
      ).expect(200)
    ).body.items,
  ).sort((a, b) => a - b);

describe('opened_vs_closed', () => {
  it('counts each week of the period, cancellations on their day in APP_TIMEZONE', async () => {
    expect(TODAY).toBe('2026-10-04');
    const data = await widget('opened_vs_closed');
    expect(data).toMatchObject({ period: 30, unit: 'week' });
    expect(data.buckets.map((b) => [b.key, b.opened, b.closed, b.cancelled, b.unfinished])).toEqual(
      [
        ['2026-W36', 1, 1, 0, 3],
        ['2026-W37', 2, 0, 0, 5],
        ['2026-W38', 0, 1, 0, 4],
        ['2026-W39', 1, 0, 0, 5],
        ['2026-W40', 2, 1, 2, 4],
      ],
    );
    expect(data.buckets[0]).toMatchObject({ from: '2026-09-05', to: '2026-09-06', partial: true });
  });

  it('applies the site filter', async () => {
    const data = await widget('opened_vs_closed', '&site=Paris');
    expect(data.buckets.at(-1)).toMatchObject({
      opened: 1,
      closed: 0,
      cancelled: 1,
      unfinished: 2,
    });
  });

  it('counts per month over a year', async () => {
    const data = await widget('opened_vs_closed', '&period=365');
    expect(data.unit).toBe('month');
    expect(data.buckets).toHaveLength(13);
    const september = data.buckets.find((b) => b.key === '2026-09');
    // Opened: 3, 4, 5, 6, 7, 10; closed: 9 (09-01), 6, 4; cancelled: 7 (09-28 in Paris).
    expect(september).toMatchObject({ opened: 6, closed: 3, cancelled: 1 });
  });

  it('lists exactly the work orders of a bar (BR-K4)', async () => {
    expect(await drill('opened_vs_closed:cancelled:2026-W40')).toEqual([7, 10]);
    expect(await drill('opened_vs_closed:cancelled:2026-W40', '&site=Paris')).toEqual([7]);
    expect(await drill('opened_vs_closed:opened:2026-W37')).toEqual([4, 5]);
    expect(await rows('opened_vs_closed', 'closed:2026-W40')).toEqual([5]);
    expect(await drill('opened_vs_closed:opened:2026-07', '&period=365')).toEqual([9]);
  });
});

describe('backlog_age', () => {
  it('crosses priority and age of the unfinished work', async () => {
    const data = await widget('backlog_age');
    expect(data.buckets).toEqual(['0-7', '8-30', '31-90', '91+']);
    expect(data.rows).toEqual([
      { priority: 'URGENT', counts: [1, 0, 0, 1] },
      { priority: 'HIGH', counts: [0, 0, 1, 0] },
      { priority: 'NORMAL', counts: [0, 1, 0, 0] },
      { priority: 'LOW', counts: [0, 0, 0, 0] },
    ]);
    expect(data).toMatchObject({ total: 4, urgent_old: 2 });
  });

  it('applies the trade filter and ignores the period', async () => {
    const data = await widget('backlog_age', '&category=HVAC&period=365');
    expect(data.rows.map((r) => r.counts)).toEqual([
      [1, 0, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });

  it('lists exactly the work orders of a cell, a row or a column', async () => {
    expect(await drill('backlog_age:URGENT:91+')).toEqual([8]);
    expect(await drill('backlog_age:URGENT')).toEqual([1, 8]);
    expect(await drill('backlog_age::8-30')).toEqual([3]);
    expect(await drill('backlog_age:HIGH:31-90', '&category=HVAC')).toEqual([2]);
  });
});

describe('backlog_weeks', () => {
  it('divides the hours left of each trade by its weekly capacity', async () => {
    const data = await widget('backlog_weeks');
    expect(data.items).toEqual([
      { category: 'HVAC', work_orders: 2, hours: 11, capacity: 70, weeks: 11 / 70 },
      { category: 'ELECTRICAL', work_orders: 0, hours: 0, capacity: 35, weeks: 0 },
    ]);
    expect(data.unspecified).toEqual({ work_orders: 1, hours: 5 });
    expect(data.without_estimate).toBe(1);
  });

  it('takes the capacity of the sites chosen', async () => {
    const data = await widget('backlog_weeks', '&site=Paris');
    expect(data.items).toEqual([
      { category: 'HVAC', work_orders: 2, hours: 11, capacity: 70, weeks: 11 / 70 },
    ]);
    expect(data).toMatchObject({ unspecified: null, without_estimate: 0 });
    const lyon = await widget('backlog_weeks', '&site=Lyon&category=HVAC');
    expect(lyon.items).toEqual([]);
  });

  it('lists the work orders of a trade, without trade, or without estimate', async () => {
    expect(await drill('backlog_weeks:HVAC')).toEqual([1, 2]);
    expect(await drill('backlog_weeks:UNSPECIFIED')).toEqual([8]);
    expect(await drill('backlog_weeks:NO_ESTIMATE')).toEqual([3]);
  });
});

describe('planned_vs_reactive', () => {
  it('stacks the work closed in each week by kind, in work orders and hours', async () => {
    const data = await widget('planned_vs_reactive');
    expect(data).toMatchObject({
      period: 30,
      unit: 'week',
      groups: ['PLANNED', 'REACTIVE', 'REQUESTS', 'IMPROVEMENT'],
      without_actual_hours: 1,
    });
    const byWeek = Object.fromEntries(data.buckets.map((b) => [b.key, b.values]));
    expect(byWeek['2026-W36'].IMPROVEMENT).toEqual({ count: 1, hours: 0 });
    expect(byWeek['2026-W38'].PLANNED).toEqual({ count: 1, hours: 3 });
    expect(byWeek['2026-W40'].REQUESTS).toEqual({ count: 1, hours: 1.5 });
    const total = data.buckets.reduce(
      (sum, b) => sum + Object.values(b.values).reduce((s, v) => s + v.count, 0),
      0,
    );
    expect(total).toBe(3);
  });

  it('lists the work orders of a kind, or of a kind in one week', async () => {
    expect(await drill('planned_vs_reactive:PLANNED')).toEqual([4]);
    expect(await drill('planned_vs_reactive:REQUESTS:2026-W40')).toEqual([5]);
    expect(await drill('planned_vs_reactive:REACTIVE', '&period=90')).toEqual([9]);
  });
});

describe('GET /api/work-orders?drill=', () => {
  it('drills into the charts of Phase 21 too', async () => {
    expect(await drill('by_status:CANCELLED')).toEqual([7, 10]);
    expect(await drill('by_category:UNSPECIFIED')).toEqual([6]);
    expect(await drill('closed_this_month')).toEqual([5]);
  });

  it('refuses unknown widgets, segments and a period without drill', async () => {
    await get('/api/work-orders?drill=nope').expect(400);
    await get('/api/work-orders?drill=recent_activity').expect(400);
    await get('/api/work-orders?drill=assets_broken_down').expect(400);
    await get('/api/work-orders?drill=backlog_age:SOON').expect(400);
    await get('/api/work-orders?drill=opened_vs_closed:opened:2025-W01').expect(400);
    await get('/api/work-orders?drill=open_work_orders:OPEN').expect(400);
    await get('/api/work-orders?period=30').expect(400);
    await get('/api/work-orders?drill=by_status&period=7').expect(400);
  });
});
