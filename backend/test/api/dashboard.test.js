// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { isOverdue } from '../../src/rules/kpi.js';
import { NOW, TEST_CONFIG, TODAY, createSeededApp, expectNoSecrets } from '../helpers/app.js';
import { TEST_PASSWORD, createTestDb } from '../helpers/db.js';

/**
 * Hand-made dataset, values computed by hand. Today is 2026-10-04 (Europe/Paris).
 *
 *  id status       due_on      closed_on   assignee priority  → counted as
 *  1  OPEN         2026-10-03              tech1    NORMAL    open, overdue, my work (3rd)
 *  2  OPEN         2026-10-04              tech1    URGENT    open, my work (1st) — due today is not late
 *  3  IN_PROGRESS  —                       tech1    HIGH      in progress, my work (2nd)
 *  4  ON_HOLD      2026-10-10              tech1    NORMAL    not late, not today; this week (4th)
 *  5  IN_PROGRESS  2026-09-30              tech2    LOW       in progress, overdue
 *  6  CLOSED                   2026-10-01  tech1    NORMAL    closed this month
 *  7  CLOSED                   2026-09-30  tech2    NORMAL    closed last month: not counted
 *  8  CANCELLED    2026-09-01              tech1    HIGH      terminal: not overdue
 *
 * Expected: open 2, in progress 2, closed this month 1, overdue 2, assets broken down 2,
 * pending conflicts 1 (one open, one resolved).
 */
let ctx;
let app;
const tokens = {};

beforeAll(async () => {
  ctx = createTestDb();
  const { db } = ctx;
  const hash = await argon2.hash(TEST_PASSWORD);
  const user = db.prepare(
    'INSERT INTO users (id, username, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)',
  );
  user.run(1, 'admin', hash, 'Ada', 'Admin', 'ADMIN');
  user.run(2, 'sup', hash, 'Sam', 'Sup', 'SUPERVISOR');
  user.run(4, 'tech1', hash, 'Tia', 'Tech', 'TECHNICIAN');
  user.run(5, 'tech2', hash, 'Tom', 'Tech', 'TECHNICIAN');

  const asset = db.prepare(
    "INSERT INTO assets (id, code, name, site, category, criticality, status) VALUES (?, ?, 'A', 'Site', 'HVAC', 'LOW', ?)",
  );
  asset.run(1, 'AST-0001', 'BROKEN_DOWN');
  asset.run(2, 'AST-0002', 'BROKEN_DOWN');
  asset.run(3, 'AST-0003', 'IN_SERVICE');

  const wo = db.prepare(`INSERT INTO work_orders
    (id, number, type, status, priority, title, site, assignee_id, created_on, due_on, started_on,
     closed_on, work_report, created_by, created_at, updated_at)
    VALUES (@id, @number, 'CORRECTIVE', @status, @priority, @title, 'Site', @assignee, @created_on,
     @due_on, @started_on, @closed_on, @report, 2, @at, @at)`);
  const rows = [
    [1, 'OPEN', 'NORMAL', 4, '2026-09-20', '2026-10-03', null, null],
    [2, 'OPEN', 'URGENT', 4, '2026-09-20', '2026-10-04', null, null],
    [3, 'IN_PROGRESS', 'HIGH', 4, '2026-09-20', null, '2026-09-21', null],
    [4, 'ON_HOLD', 'NORMAL', 4, '2026-09-20', '2026-10-10', '2026-09-21', null],
    [5, 'IN_PROGRESS', 'LOW', 5, '2026-09-20', '2026-09-30', '2026-09-21', null],
    [6, 'CLOSED', 'NORMAL', 4, '2026-09-20', null, '2026-09-25', '2026-10-01'],
    [7, 'CLOSED', 'NORMAL', 5, '2026-09-20', null, '2026-09-25', '2026-09-30'],
    [8, 'CANCELLED', 'HIGH', 4, '2026-08-20', '2026-09-01', null, null],
  ];
  for (const [id, status, priority, assignee, created_on, due_on, started_on, closed_on] of rows) {
    wo.run({
      id,
      number: `WO-2026-0000${id}`,
      status,
      priority,
      title: `Work ${id}`,
      assignee,
      created_on,
      due_on,
      started_on,
      closed_on,
      report: closed_on ? 'Done' : null,
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
  for (const username of ['admin', 'sup', 'tech1']) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username, password: TEST_PASSWORD })
      .expect(200);
    tokens[username] = res.body.token;
  }
});
afterAll(() => ctx.cleanup());

const dashboardAs = (username) =>
  request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokens[username]}`).expect(200);

describe('GET /api/dashboard on a hand-made dataset', () => {
  it('computes the exact KPI values', async () => {
    const res = await dashboardAs('sup');
    expect(TODAY).toBe('2026-10-04');
    expect(res.body.today).toBe('2026-10-04');
    expect(res.body.kpis).toEqual({
      open_work_orders: 2,
      in_progress_work_orders: 2,
      closed_this_month: 1,
      assets_broken_down: 2,
      overdue_work_orders: 2,
      pending_conflicts: 1,
      requests_to_review: 0,
      requests_awaiting_reply: 0,
    });
    expectNoSecrets(res.body);
  });

  it('lists the 5 most recently updated work orders', async () => {
    const res = await dashboardAs('admin');
    expect(res.body.recent_activity.map((w) => w.id)).toEqual([8, 7, 6, 5, 4]);
    expect(res.body.recent_activity[0]).toHaveProperty('assignee');
  });

  it("orders the user's work for today: URGENT first, then by due date", async () => {
    const res = await dashboardAs('tech1');
    expect(res.body.my_work_today.map((w) => w.id)).toEqual([2, 3, 1]);
  });

  it("lists the user's work for the next 7 days, today's work included", async () => {
    const res = await dashboardAs('tech1');
    expect(res.body.week_end).toBe('2026-10-10');
    expect(res.body.my_work_week.map((w) => w.id)).toEqual([2, 3, 1, 4]);
    expect((await dashboardAs('sup')).body.my_work_week).toEqual([]);
  });

  it('does not give the conflict count to technicians', async () => {
    const res = await dashboardAs('tech1');
    expect(res.body.kpis).not.toHaveProperty('requests_to_review');
    expect(res.body.kpis).not.toHaveProperty('pending_conflicts');
    expect(res.body.kpis.open_work_orders).toBe(2);
  });

  it('requires a token', async () => {
    await request(app).get('/api/dashboard').expect(401);
  });
});

describe('GET /api/dashboard on the mock dataset', () => {
  it('counts overdue work orders exactly like the pure rule', async () => {
    const seeded = await createSeededApp();
    try {
      const res = await seeded.getAs('admin', '/api/dashboard').expect(200);
      const all = seeded.db.prepare('SELECT status, due_on FROM work_orders').all();
      expect(res.body.kpis.overdue_work_orders).toBe(all.filter((w) => isOverdue(w, TODAY)).length);
      expect(res.body.kpis.overdue_work_orders).toBeGreaterThan(0);
      expect(res.body.recent_activity).toHaveLength(5);
    } finally {
      seeded.cleanup();
    }
  });
});
