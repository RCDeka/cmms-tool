// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { NOW, TEST_CONFIG } from '../helpers/app.js';
import { TEST_PASSWORD, createTestDb } from '../helpers/db.js';

/**
 * Compliance widgets (Phase 23) on a hand-made dataset, values computed by hand. Today is
 * Sunday 2026-10-04 (week 40, Europe/Paris). A visit counts once the Sunday of its deadline
 * week is before today: in the 30-day period (from 2026-09-05), deadlines W36 to W39.
 *
 * Plans: P1 preventive HVAC Paris, tolerance 1 week, internal; P2 regulatory fire safety
 * Paris, tolerance 2 (not used: due week), contractor "Sécurité Incendie: Nord"; P3
 * preventive electrical Lyon, tolerance 0, contractor "Volt & Co".
 *
 *  visit plan due  week status    WO  WO status    closed      deadline (Sunday)   outcome
 *  V1    P1   W37  W37  released  1   CLOSED       2026-09-20  W38 (09-20)         on time (the Sunday)
 *  V2    P1   W38  W38  released  2   CLOSED       2026-09-28  W39 (09-27)         late (the Monday after)
 *  V3    P1   W39  W39  released  3   OPEN                     W40 (10-04 = today) not counted yet
 *  V4    P2   W37  W36  released  4   CLOSED       2026-09-12  W37 (09-13)         on time
 *  V5    P2   W38  W38  released  5   IN_PROGRESS              W38 (09-20)         late; regulatory late today
 *  V6    P2   W39  W39  skipped   —                            W39 (09-27)         skipped ("Building closed")
 *  V7    P3   W36  W36  released  6   CLOSED       2026-09-06  W36 (09-06)         on time
 *  V8    P3   W33  W33  released  7   OPEN                     W33 (08-16)         before the period; late over 90 days
 *  V9    P2   W40  W40  released  8   OPEN                     W40                 due this week: not late yet
 *  V10   P2   W35  W35  released  9   CLOSED       2026-09-30  W35 (08-30)         before the period; late over 90 days
 *
 * Week scheduler (work orders 10 to 15, Paris, HVAC):
 *  WO  planned  WORK blocks (day, hours, booked at)               status   closed      → per week
 *  10  W38      09-15, 3 h, 2026-09-10T08:00Z                      CLOSED   2026-09-18  W38 kept
 *  11  W38      09-16, 2 h, 2026-09-15T09:00Z (break-in)           OPEN                 W38 missed
 *  12  W38      09-22, 1.5 h, 2026-09-01T08:00Z (block in W39)      OPEN                 not scheduled in its week
 *  13  W39      09-21, 1 h, 2026-09-13T22:30Z                      CLOSED   2026-09-28  W39 missed
 *  15  W37      09-08, 2 h, 2026-09-06T22:30Z = Monday 00:30 Paris CLOSED   2026-09-13  W37 kept, break-in
 */
let ctx;
let app;
let token;

beforeAll(async () => {
  ctx = createTestDb();
  const { db } = ctx;
  const hash = await argon2.hash(TEST_PASSWORD);
  db.prepare(
    "INSERT INTO users (id, username, password_hash, first_name, last_name, role) VALUES (2, 'sup', ?, 'S', 'U', 'SUPERVISOR')",
  ).run(hash);

  const plan = db.prepare(`INSERT INTO maintenance_plans
    (id, code, title, type, category, site, estimated_hours, frequency_weeks, anchor_week,
     tolerance_weeks, performed_by, supplier, created_by, created_at, updated_at)
    VALUES (?, ?, 'Visit', ?, ?, ?, 2, 1, '2026-W01', ?, ?, ?, 2, 'x', 'x')`);
  plan.run(1, 'PM-0001', 'PREVENTIVE', 'HVAC', 'Paris', 1, 'INTERNAL', null);
  plan.run(
    2,
    'PM-0002',
    'REGULATORY',
    'FIRE_SAFETY',
    'Paris',
    2,
    'CONTRACTOR',
    'Sécurité Incendie: Nord',
  );
  plan.run(3, 'PM-0003', 'PREVENTIVE', 'ELECTRICAL', 'Lyon', 0, 'CONTRACTOR', 'Volt & Co');

  const wo = db.prepare(`INSERT INTO work_orders
    (id, number, type, status, priority, title, site, category, created_on, started_on, closed_on,
     work_report, plan_id, planned_week, created_by, created_at, updated_at)
    VALUES (@id, @number, @type, @status, 'NORMAL', 'Job', @site, @category, '2026-08-01',
     @started, @closed, @report, @plan, @week, 2, 'x', 'x')`);
  const workOrders = [
    // id, plan, status, closed, planned week
    [1, 1, 'CLOSED', '2026-09-20', null],
    [2, 1, 'CLOSED', '2026-09-28', null],
    [3, 1, 'OPEN', null, null],
    [4, 2, 'CLOSED', '2026-09-12', null],
    [5, 2, 'IN_PROGRESS', null, null],
    [6, 3, 'CLOSED', '2026-09-06', null],
    [7, 3, 'OPEN', null, null],
    [8, 2, 'OPEN', null, null],
    [9, 2, 'CLOSED', '2026-09-30', null],
    [10, null, 'CLOSED', '2026-09-18', '2026-W38'],
    [11, null, 'OPEN', null, '2026-W38'],
    [12, null, 'OPEN', null, '2026-W38'],
    [13, null, 'CLOSED', '2026-09-28', '2026-W39'],
    [15, null, 'CLOSED', '2026-09-13', '2026-W37'],
  ];
  const planInfo = {
    1: ['PREVENTIVE', 'Paris', 'HVAC'],
    2: ['REGULATORY', 'Paris', 'FIRE_SAFETY'],
    3: ['PREVENTIVE', 'Lyon', 'ELECTRICAL'],
  };
  for (const [id, planId, status, closed, week] of workOrders) {
    const [type, site, category] = planId ? planInfo[planId] : ['CORRECTIVE', 'Paris', 'HVAC'];
    wo.run({
      id,
      number: `WO-2026-${String(id).padStart(5, '0')}`,
      type,
      status,
      site,
      category,
      started: status === 'OPEN' ? null : '2026-08-02',
      closed,
      report: closed ? 'Done' : null,
      plan: planId,
      week,
    });
  }

  const visit = db.prepare(`INSERT INTO plan_occurrences
    (plan_id, due_week, week, status, work_order_id, skip_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'x', 'x')`);
  visit.run(1, '2026-W37', '2026-W37', 'RELEASED', 1, null);
  visit.run(1, '2026-W38', '2026-W38', 'RELEASED', 2, null);
  visit.run(1, '2026-W39', '2026-W39', 'RELEASED', 3, null);
  visit.run(2, '2026-W37', '2026-W36', 'RELEASED', 4, null);
  visit.run(2, '2026-W38', '2026-W38', 'RELEASED', 5, null);
  visit.run(2, '2026-W39', '2026-W39', 'SKIPPED', null, 'Building closed');
  visit.run(3, '2026-W36', '2026-W36', 'RELEASED', 6, null);
  visit.run(3, '2026-W33', '2026-W33', 'RELEASED', 7, null);
  visit.run(2, '2026-W40', '2026-W40', 'RELEASED', 8, null);
  visit.run(2, '2026-W35', '2026-W35', 'RELEASED', 9, null);

  const block = db.prepare(`INSERT INTO allocations
    (kind, work_order_id, technician_id, day, hours, created_by, created_at, updated_at)
    VALUES ('WORK', ?, 2, ?, ?, 2, ?, 'x')`);
  block.run(10, '2026-09-15', 3, '2026-09-10T08:00:00.000Z');
  block.run(11, '2026-09-16', 2, '2026-09-15T09:00:00.000Z');
  block.run(12, '2026-09-22', 1.5, '2026-09-01T08:00:00.000Z');
  block.run(13, '2026-09-21', 1, '2026-09-13T22:30:00.000Z');
  block.run(15, '2026-09-08', 2, '2026-09-06T22:30:00.000Z');

  app = createApp({ db, config: TEST_CONFIG, now: () => NOW });
  token = (
    await request(app).post('/api/auth/login').send({ username: 'sup', password: TEST_PASSWORD })
  ).body.token;
});
afterAll(() => ctx.cleanup());

const get = (url) => request(app).get(url).set('Authorization', `Bearer ${token}`);
const widget = async (key, query = '') =>
  (await get(`/api/dashboard/widgets?keys=${key}${query}`).expect(200)).body.widgets[key];
const drill = async (value, query = '') =>
  (
    await get(`/api/work-orders?drill=${encodeURIComponent(value)}${query}&size=100`).expect(200)
  ).body.items
    .map((w) => w.id)
    .sort((a, b) => a - b);

describe('pm_compliance', () => {
  it('counts the visits whose deadline week ended in the period', async () => {
    const data = await widget('pm_compliance');
    expect(data).toMatchObject({ period: 30, on_time: 3, late: 2, skipped: 1, rate: 0.6 });
    expect(data.items).toEqual([
      { category: 'HVAC', on_time: 1, late: 1, skipped: 0, rate: 0.5 },
      { category: 'ELECTRICAL', on_time: 1, late: 0, skipped: 0, rate: 1 },
      { category: 'FIRE_SAFETY', on_time: 1, late: 1, skipped: 1, rate: 0.5 },
    ]);
    expect(data.regulatory).toEqual({ on_time: 1, late: 1, skipped: 1, rate: 0.5 });
  });

  it('follows the sites and the period', async () => {
    expect(await widget('pm_compliance', '&site=Paris')).toMatchObject({
      on_time: 2,
      late: 2,
      skipped: 1,
    });
    expect(await widget('pm_compliance', '&period=90')).toMatchObject({
      on_time: 3,
      late: 4,
      skipped: 1,
    });
  });

  it('lists the work orders of late visits, and every visit in the CSV rows', async () => {
    expect(await drill('pm_compliance:late')).toEqual([2, 5]);
    expect(await drill('pm_compliance:late:FIRE_SAFETY')).toEqual([5]);
    expect(await drill('pm_compliance:on_time:HVAC')).toEqual([1]);
    const rows = (
      await get('/api/dashboard/widgets/pm_compliance/rows?segment=skipped').expect(200)
    ).body;
    expect(rows).toMatchObject({ kind: 'visits', total: 1 });
    expect(rows.items[0]).toMatchObject({
      plan_code: 'PM-0002',
      due_week: '2026-W39',
      deadline_week: '2026-W39',
      deadline_on: '2026-09-27',
      outcome: 'skipped',
      skip_reason: 'Building closed',
      work_order_number: null,
    });
    const all = (await get('/api/dashboard/widgets/pm_compliance/rows').expect(200)).body;
    expect(all.items.map((v) => [v.plan_code, v.outcome])).toEqual([
      ['PM-0003', 'on_time'],
      ['PM-0002', 'on_time'],
      ['PM-0001', 'on_time'],
      ['PM-0002', 'late'],
      ['PM-0001', 'late'],
      ['PM-0002', 'skipped'],
    ]);
  });
});

describe('regulatory_late', () => {
  it('counts unfinished regulatory visits past their due week, today', async () => {
    expect(await widget('regulatory_late')).toEqual({ value: 1 });
    expect(await widget('regulatory_late', '&site=Lyon')).toEqual({ value: 0 });
    expect(await drill('regulatory_late')).toEqual([5]);
  });
});

describe('schedule_compliance', () => {
  it('counts the work orders finished in the week they were scheduled', async () => {
    const data = await widget('schedule_compliance');
    expect(data).toMatchObject({ period: 30, unit: 'week', scheduled: 4, kept: 2, rate: 0.5 });
    expect(
      data.buckets.map((b) => [
        b.key,
        b.weeks,
        b.scheduled,
        b.kept,
        b.rate,
        b.hours,
        b.break_in_hours,
      ]),
    ).toEqual([
      ['2026-W36', 1, 0, 0, null, 0, 0],
      ['2026-W37', 1, 1, 1, 1, 2, 2],
      ['2026-W38', 1, 2, 1, 0.5, 5, 2],
      ['2026-W39', 1, 1, 0, 0, 2.5, 0],
      ['2026-W40', 0, 0, 0, null, 0, 0],
    ]);
    expect(data.buckets[2].break_in).toBe(0.4);
  });

  it('lists the work orders scheduled, kept or missed', async () => {
    expect(await drill('schedule_compliance:missed')).toEqual([11, 13]);
    expect(await drill('schedule_compliance:missed:2026-W38')).toEqual([11]);
    expect(await drill('schedule_compliance:kept')).toEqual([10, 15]);
    expect(await drill('schedule_compliance:scheduled:2026-W39')).toEqual([13]);
  });
});

describe('contractor_scorecard', () => {
  it('scores each contractor, the worst first', async () => {
    const data = await widget('contractor_scorecard');
    expect(data.items).toEqual([
      {
        supplier: 'Sécurité Incendie: Nord',
        visits: 3,
        on_time: 1,
        late: 1,
        skipped: 1,
        rate: 0.5,
      },
      { supplier: 'Volt & Co', visits: 1, on_time: 1, late: 0, skipped: 0, rate: 1 },
    ]);
    expect(data.rate).toBe(2 / 3);
  });

  it('lists the late visits of a contractor whose name holds a colon', async () => {
    expect(await drill('contractor_scorecard:late:Sécurité Incendie: Nord')).toEqual([5]);
    expect(await drill('contractor_scorecard::Volt & Co')).toEqual([6]);
  });

  it('refuses unknown contractors and segments', async () => {
    await get(
      `/api/work-orders?drill=${encodeURIComponent('contractor_scorecard:late:Nobody')}`,
    ).expect(400);
    await get('/api/work-orders?drill=pm_compliance:soon').expect(400);
    await get('/api/work-orders?drill=schedule_compliance:missed:2026-W01').expect(400);
    await get('/api/work-orders?drill=regulatory_late:x').expect(400);
  });
});
