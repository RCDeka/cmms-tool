// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ASSET_STATUSES,
  CATEGORIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from '../../src/rules/enums.js';
import { seedDatabase } from '../../src/db/seed/index.js';
import { TEST_PASSWORD, createTestDb } from '../helpers/db.js';

const TODAY = '2026-10-04';
const NOW = new Date('2026-10-04T12:00:00Z');

const seeded = async (options = {}) => {
  const ctx = createTestDb();
  const counts = await seedDatabase(ctx.db, {
    password: TEST_PASSWORD,
    today: TODAY,
    now: NOW,
    ...options,
  });
  return { ...ctx, counts };
};

describe('seedDatabase', () => {
  let ctx;
  let db;
  const all = (sql) => db.prepare(sql).all();
  const count = (sql) => db.prepare(sql).pluck().get();

  beforeAll(async () => {
    ctx = await seeded();
    db = ctx.db;
  });
  afterAll(() => ctx.cleanup());

  it('creates 6 users, 500 assets, 207 work orders (7 staff requests) and 113 of past visits, 62 plans and no conflict', () => {
    expect(ctx.counts).toEqual({
      users: 6,
      assets: 500,
      workOrders: 320,
      pastVisits: 122,
      pastWorkOrders: 113,
      pastBlocks: 59,
      requests: 7,
      places: 414,
      rooms: 333,
      plans: 62,
      allocations: 68,
      conflicts: 0,
    });
    expect(count('SELECT count(*) FROM conflicts')).toBe(0);
  });

  it('gives a room to the staff requests sent from a listed room (D81, D82)', () => {
    expect(
      count(`SELECT count(*) FROM work_orders w JOIN locations l ON l.id = w.location_id
             JOIN locations s ON s.id = l.site_id
             WHERE l.level_type_id = 4 AND s.name = w.site AND w.review_status IS NOT NULL`),
    ).toBe(6);
    expect(
      count(
        'SELECT count(*) FROM work_orders w JOIN locations l ON l.id = w.location_id WHERE l.level_type_id = 4',
      ),
    ).toBe(6);
  });

  it('builds the location tree: 5 sites, their buildings, floors and rooms, with codes (D82)', () => {
    expect(all('SELECT level_type_id, count(*) AS n FROM locations GROUP BY 1')).toEqual([
      { level_type_id: 1, n: 5 },
      { level_type_id: 2, n: 8 },
      { level_type_id: 3, n: 68 },
      { level_type_id: 4, n: 333 },
    ]);
    expect(
      all(`SELECT b.code AS building, f.code AS floor FROM locations f JOIN locations b ON b.id = f.parent_id
           WHERE b.name = 'Tower B' AND f.name IN ('B1', 'L0', 'L12') ORDER BY f.id`),
    ).toEqual([
      { building: '2', floor: '01' },
      { building: '2', floor: '10' },
      { building: '2', floor: '22' },
    ]);
    expect(count('SELECT count(*) FROM locations WHERE parent_id IS NULL AND code IS NULL')).toBe(
      0,
    );
    // Every record stores its site and the path below it, as the services do.
    for (const table of ['assets', 'work_orders', 'maintenance_plans']) {
      expect(
        count(`WITH RECURSIVE p (id, site, place) AS (
                 SELECT id, name, '' FROM locations WHERE parent_id IS NULL
                 UNION ALL
                 SELECT l.id, p.site, CASE WHEN p.place = '' THEN l.name ELSE p.place || ' › ' || l.name END
                 FROM locations l JOIN p ON l.parent_id = p.id)
               SELECT count(*) FROM ${table} r JOIN p ON p.id = r.location_id
               WHERE r.site <> p.site OR r.place <> p.place`),
      ).toBe(0);
    }
    // Assets are on floors; work orders on an asset are at its place (BR-LOC8).
    expect(
      count(
        'SELECT count(*) FROM assets a JOIN locations l ON l.id = a.location_id WHERE l.level_type_id <> 3',
      ),
    ).toBe(0);
    expect(
      count(
        'SELECT count(*) FROM work_orders w JOIN assets a ON a.id = w.asset_id WHERE w.location_id <> a.location_id',
      ),
    ).toBe(0);
  });

  it('creates the documented users, with power_user for supervisors and the admin (D21)', async () => {
    const users = all('SELECT username, role, power_user, password_hash FROM users ORDER BY id');
    expect(users.map((u) => [u.username, u.role, u.power_user])).toEqual([
      ['admin', 'ADMIN', 1],
      ['supervisor1', 'SUPERVISOR', 1],
      ['supervisor2', 'SUPERVISOR', 1],
      ['technician1', 'TECHNICIAN', 0],
      ['technician2', 'TECHNICIAN', 0],
      ['user1', 'STAFF', 0],
    ]);
    for (const u of users) {
      expect(u.password_hash).toMatch(/^\$argon2id\$/);
      expect(await argon2.verify(u.password_hash, TEST_PASSWORD)).toBe(true);
    }
  });

  it('spreads assets over 5 sites and every category, with 4 % broken down', () => {
    expect(count('SELECT count(DISTINCT site) FROM assets')).toBe(5);
    expect(
      all('SELECT DISTINCT category FROM assets')
        .map((r) => r.category)
        .sort(),
    ).toEqual([...CATEGORIES].sort());
    const byStatus = Object.fromEntries(
      all('SELECT status, count(*) n FROM assets GROUP BY status').map((r) => [r.status, r.n]),
    );
    expect(Object.keys(byStatus).sort()).toEqual([...ASSET_STATUSES].sort());
    expect(byStatus.BROKEN_DOWN).toBe(20);
  });

  it('keeps data-center-only equipment in the data center', () => {
    expect(
      count(
        "SELECT count(*) FROM assets WHERE subcategory = 'Precision air conditioner' AND site <> 'Saclay Data Center'",
      ),
    ).toBe(0);
  });

  it('covers every work order status, type and priority over the last 30 days', () => {
    const distinct = (col) =>
      all(`SELECT DISTINCT ${col} v FROM work_orders`)
        .map((r) => r.v)
        .sort();
    expect(distinct('status')).toEqual([...WORK_ORDER_STATUSES].sort());
    expect(distinct('type')).toEqual([...WORK_ORDER_TYPES].sort());
    expect(distinct('priority')).toEqual([...WORK_ORDER_PRIORITIES].sort());
    // Last 30 days, today included: 2026-09-05 to 2026-10-04 (the past visits are older, D64).
    expect(
      count('SELECT min(created_on) FROM work_orders WHERE plan_id IS NULL') >= '2026-09-05',
    ).toBe(true);
    expect(count('SELECT max(created_on) FROM work_orders') <= TODAY).toBe(true);
  });

  it('links about 90 % of work orders to an asset, with the asset site (BR-W2)', () => {
    // Generated work orders; every plan visit has its asset.
    const linked = count(
      'SELECT count(*) FROM work_orders WHERE asset_id IS NOT NULL AND plan_id IS NULL',
    );
    expect(linked).toBeGreaterThanOrEqual(170);
    expect(linked).toBeLessThanOrEqual(195);
    expect(
      count(
        'SELECT count(*) FROM work_orders w JOIN assets a ON a.id = w.asset_id WHERE w.site <> a.site',
      ),
    ).toBe(0);
  });

  it('assigns work orders only to technicians and supervisors (BR-W3)', () => {
    expect(
      count(
        "SELECT count(*) FROM work_orders w JOIN users u ON u.id = w.assignee_id WHERE u.role NOT IN ('TECHNICIAN', 'SUPERVISOR')",
      ),
    ).toBe(0);
    expect(
      count(
        "SELECT count(*) FROM work_orders w JOIN users u ON u.id = w.created_by WHERE u.role = 'TECHNICIAN'",
      ),
    ).toBe(0);
  });

  it('follows the workflow rules BR-W4 to BR-W8', () => {
    // Started work orders have started_on; OPEN ones have neither date.
    expect(
      count(
        "SELECT count(*) FROM work_orders WHERE status IN ('IN_PROGRESS','ON_HOLD','CLOSED') AND started_on IS NULL",
      ),
    ).toBe(0);
    expect(
      count(
        "SELECT count(*) FROM work_orders WHERE status = 'OPEN' AND (started_on IS NOT NULL OR closed_on IS NOT NULL)",
      ),
    ).toBe(0);
    // Only CLOSED work orders have closed_on, and all of them have a report (BR-W6).
    expect(
      count("SELECT count(*) FROM work_orders WHERE status <> 'CLOSED' AND closed_on IS NOT NULL"),
    ).toBe(0);
    expect(
      count(
        "SELECT count(*) FROM work_orders WHERE status = 'CLOSED' AND (closed_on IS NULL OR work_report IS NULL)",
      ),
    ).toBe(0);
    // No date in the future; dates in order (BR-W8; also enforced by CHECK constraints).
    expect(
      count(
        `SELECT count(*) FROM work_orders WHERE started_on > '${TODAY}' OR closed_on > '${TODAY}' OR created_on > '${TODAY}'`,
      ),
    ).toBe(0);
    expect(count('SELECT count(*) FROM work_orders WHERE started_on < created_on')).toBe(0);
  });

  it('includes overdue work orders', () => {
    expect(
      count(
        `SELECT count(*) FROM work_orders WHERE status NOT IN ('CLOSED','CANCELLED') AND due_on < '${TODAY}'`,
      ),
    ).toBeGreaterThan(0);
  });

  it('numbers work orders in creation order (BR-W10)', () => {
    const rows = all('SELECT number, created_at FROM work_orders ORDER BY number');
    expect(rows[0].number).toBe('WO-2026-00001');
    // The past visits are numbered among them, by creation (D64).
    expect(rows.at(-1).number).toBe('WO-2026-00320');
    const createdAt = rows.map((r) => r.created_at);
    expect(createdAt).toEqual([...createdAt].sort());
  });

  it('never sets timestamps after now', () => {
    for (const table of ['users', 'assets', 'work_orders']) {
      expect(
        count(`SELECT max(max(created_at), max(updated_at)) FROM ${table}`) <= NOW.toISOString(),
      ).toBe(true);
    }
  });

  it('creates maintenance plans of every trade, mode and kind (D48)', () => {
    const distinct = (col) =>
      all(`SELECT DISTINCT ${col} v FROM maintenance_plans`)
        .map((r) => r.v)
        .sort();
    expect(distinct('category')).toEqual([...CATEGORIES].sort());
    expect(distinct('schedule_mode')).toEqual(['FIXED', 'FLOATING']);
    expect(distinct('type')).toEqual(['PREVENTIVE', 'REGULATORY']);
    expect(count("SELECT count(*) FROM maintenance_plans WHERE performed_by = 'CONTRACTOR'")).toBe(
      8,
    );
    expect(
      count('SELECT count(*) FROM maintenance_plans WHERE estimated_hours > 3.5'),
    ).toBeGreaterThan(0);
    expect(count('SELECT count(*) FROM maintenance_plans WHERE season_from_week IS NOT NULL')).toBe(
      2,
    );
    // Plans follow their asset (BR-P9, BR-LOC8) and are logged at creation.
    expect(
      count(
        `SELECT count(*) FROM maintenance_plans p JOIN assets a ON a.id = p.asset_id
         WHERE p.site <> a.site OR p.location_id <> a.location_id OR p.category <> a.category`,
      ),
    ).toBe(0);
    expect(count("SELECT count(*) FROM audit_log WHERE entity_type = 'maintenance_plans'")).toBe(
      62,
    );
  });

  it('stores two years of occurrences and releases nothing ahead (the daily job does)', () => {
    expect(count("SELECT min(week) FROM plan_occurrences WHERE status = 'PLANNED'")).toBe(
      '2026-W40',
    );
    // Horizon: 104 weeks after the current week.
    expect(count('SELECT max(week) FROM plan_occurrences') <= '2028-W39').toBe(true);
    // From the current week on, nothing is released or skipped; before, only history (D64).
    expect(
      count(
        "SELECT count(*) FROM plan_occurrences WHERE status <> 'PLANNED' AND week >= '2026-W40'",
      ),
    ).toBe(0);
    expect(
      count("SELECT count(*) FROM plan_occurrences WHERE status = 'PLANNED' AND week < '2026-W40'"),
    ).toBe(0);
    expect(
      count(
        "SELECT count(*) FROM work_orders WHERE plan_id IS NOT NULL AND planned_week >= '2026-W40'",
      ),
    ).toBe(0);
  });

  it('adds a history of past visits and scheduled weeks (D64)', () => {
    const visits = all(
      `SELECT o.*, p.anchor_week, p.frequency_weeks, p.schedule_mode, p.season_from_week,
         w.plan_id AS wo_plan, w.planned_week AS wo_week, w.status AS wo_status
       FROM plan_occurrences o JOIN maintenance_plans p ON p.id = o.plan_id
       LEFT JOIN work_orders w ON w.id = o.work_order_id WHERE o.week < '2026-W40'`,
    );
    expect(visits).toHaveLength(122);
    // Only fixed, non-seasonal plans, on their series (the anchor is the first visit, BR-P1).
    for (const v of visits) {
      expect(v.schedule_mode).toBe('FIXED');
      expect(v.season_from_week).toBeNull();
      expect(v.week >= v.anchor_week).toBe(true);
      expect(v.week).toBe(v.due_week);
    }
    // Released visits have their work order, in their week; skipped ones a reason.
    for (const v of visits.filter((x) => x.status === 'RELEASED')) {
      expect([v.wo_plan, v.wo_week]).toEqual([v.plan_id, v.week]);
    }
    for (const v of visits.filter((x) => x.status === 'SKIPPED')) {
      expect(v.work_order_id).toBeNull();
      expect(v.skip_reason).toBeTruthy();
    }
    // Most are closed; a few late ones are still going on (one regulatory, for the dashboards).
    const open = visits.filter((v) => v.status === 'RELEASED' && v.wo_status !== 'CLOSED');
    expect(open.length).toBeGreaterThan(0);
    expect(open.length).toBeLessThan(5);
    // Past weeks of the week scheduler: blocks on weekdays of the visit's planned week.
    const blocks = all(
      `SELECT a.day, a.created_at, w.planned_week FROM allocations a
       JOIN work_orders w ON w.id = a.work_order_id WHERE a.day < '2026-09-28'`,
    );
    expect(blocks).toHaveLength(59);
    for (const b of blocks) {
      const day = new Date(`${b.day}T00:00:00Z`).getUTCDay();
      expect(day >= 1 && day <= 5).toBe(true);
    }
    expect(new Set(blocks.map((b) => b.planned_week)).size).toBeGreaterThanOrEqual(5);
    // Each history work order and visit change has its audit entry (BR-LOC4).
    expect(
      count(
        `SELECT count(*) FROM work_orders w WHERE w.plan_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM audit_log l WHERE l.entity_type = 'work_orders' AND l.entity_id = w.id
             AND l.action = 'CREATE')`,
      ),
    ).toBe(0);
    expect(count("SELECT count(*) FROM audit_log WHERE entity_type = 'plan_occurrences'")).toBe(
      122,
    );
    // Past breakdowns of critical assets, repaired since.
    expect(
      count(
        `SELECT count(*) FROM audit_log WHERE entity_type = 'assets' AND action = 'UPDATE'
           AND json_extract(changes, '$.status.to') = 'BROKEN_DOWN'`,
      ),
    ).toBe(10);
  });

  it('piles visits up in some weeks, so the planner has peaks to balance', () => {
    const hours = all(
      `SELECT o.week, sum(p.estimated_hours) h FROM plan_occurrences o
       JOIN maintenance_plans p ON p.id = o.plan_id
       WHERE p.performed_by = 'INTERNAL' AND o.week BETWEEN '2026-W40' AND '2027-W38'
       GROUP BY o.week`,
    ).map((r) => r.h);
    // Weekly capacity of the 4 technicians and supervisors: 4 × 35 h − 30 % = 98 h.
    expect(Math.max(...hours)).toBeGreaterThan(98);
    expect(Math.min(...hours)).toBeLessThan(40);
  });

  it('schedules the current week: a split job, an appointment, travel time, an absence (Phase 19)', () => {
    const blocks = all("SELECT * FROM allocations WHERE day >= '2026-09-28' ORDER BY id");
    expect(blocks).toHaveLength(9);
    // Week 2026-W40: Monday 28 September to Friday 2 October.
    expect(blocks.every((b) => b.day >= '2026-09-28' && b.day <= '2026-10-02')).toBe(true);
    const split = blocks.filter((b) => b.work_order_id === blocks[0].work_order_id);
    expect(split.map((b) => b.hours)).toEqual([3.5, 2.5]);
    expect(blocks.filter((b) => b.locked_start).map((b) => b.locked_start)).toEqual(['10:00']);
    expect(blocks.filter((b) => b.kind === 'TRAVEL')).toHaveLength(1);
    // Work orders of the blocks are assigned to the person and planned in the week.
    const work = all(
      `SELECT w.assignee_id, w.planned_week, a.technician_id FROM allocations a
       JOIN work_orders w ON w.id = a.work_order_id WHERE a.day >= '2026-09-28'`,
    );
    expect(work.every((w) => w.assignee_id === w.technician_id)).toBe(true);
    expect(new Set(work.map((w) => w.planned_week))).toEqual(new Set(['2026-W40']));
    expect(all('SELECT hours, reason FROM capacity_overrides')).toEqual([
      { hours: 0, reason: 'LEAVE' },
    ]);
    // 9 this week, 59 in the past weeks (D64).
    expect(count("SELECT count(*) FROM audit_log WHERE entity_type = 'allocations'")).toBe(68);
  });

  it('refuses to seed a database that already has data', async () => {
    await expect(
      seedDatabase(db, { password: TEST_PASSWORD, today: TODAY, now: NOW }),
    ).rejects.toThrow(/already contains data/);
  });
});

describe('seedDatabase options', () => {
  it('produces identical data on every run (except password salts)', async () => {
    const a = await seeded();
    const b = await seeded();
    try {
      for (const sql of [
        'SELECT * FROM assets ORDER BY id',
        'SELECT * FROM work_orders ORDER BY id',
        'SELECT id, username, role, site FROM users ORDER BY id',
        'SELECT * FROM maintenance_plans ORDER BY id',
        'SELECT * FROM plan_occurrences ORDER BY id',
      ]) {
        expect(a.db.prepare(sql).all()).toEqual(b.db.prepare(sql).all());
      }
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });

  it('restarts the number sequence each year', async () => {
    const ctx = await seeded({ today: '2027-01-10', now: new Date('2027-01-10T12:00:00Z') });
    try {
      const firsts = ctx.db
        .prepare('SELECT min(number) FROM work_orders GROUP BY substr(number, 4, 4) ORDER BY 1')
        .pluck()
        .all();
      expect(firsts).toEqual(['WO-2026-00001', 'WO-2027-00001']);
    } finally {
      ctx.cleanup();
    }
  });

  it('creates 3 open conflicts with --with-conflicts', async () => {
    const ctx = await seeded({ withConflicts: true });
    try {
      const { db } = ctx;
      expect(ctx.counts.conflicts).toBe(3);
      const conflicts = db.prepare('SELECT * FROM conflicts').all();
      expect(conflicts.map((c) => c.entity_type).sort()).toEqual([
        'assets',
        'assets',
        'work_orders',
      ]);
      for (const c of conflicts) {
        const record = db.prepare(`SELECT * FROM ${c.entity_type} WHERE id = ?`).get(c.entity_id);
        expect(c.status).toBe('OPEN');
        expect(record.has_conflict).toBe(1);
        // BR-V3: the record keeps the server version.
        expect(record.version).toBe(c.server_version);
        expect(JSON.parse(c.server_snapshot).version).toBe(2);
        expect(Object.keys(JSON.parse(c.client_changes)).length).toBeGreaterThan(0);
      }
    } finally {
      ctx.cleanup();
    }
  });

  it('rejects a missing or short password (BR-U2)', async () => {
    const ctx = createTestDb();
    try {
      await expect(seedDatabase(ctx.db, { password: 'short', today: TODAY })).rejects.toThrow(
        /SEED_PASSWORD/,
      );
    } finally {
      ctx.cleanup();
    }
  });
});
