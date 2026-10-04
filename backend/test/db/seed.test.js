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

  it('creates 5 users, 500 assets, 200 work orders and no conflict', () => {
    expect(ctx.counts).toEqual({ users: 5, assets: 500, workOrders: 200, conflicts: 0 });
    expect(count('SELECT count(*) FROM conflicts')).toBe(0);
  });

  it('creates the documented users, with power_user for supervisors and the admin (D21)', async () => {
    const users = all('SELECT username, role, power_user, password_hash FROM users ORDER BY id');
    expect(users.map((u) => [u.username, u.role, u.power_user])).toEqual([
      ['admin', 'ADMIN', 1],
      ['supervisor1', 'SUPERVISOR', 1],
      ['supervisor2', 'SUPERVISOR', 1],
      ['technician1', 'TECHNICIAN', 0],
      ['technician2', 'TECHNICIAN', 0],
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
    // Last 30 days, today included: 2026-09-05 to 2026-10-04.
    expect(count('SELECT min(created_on) FROM work_orders') >= '2026-09-05').toBe(true);
    expect(count('SELECT max(created_on) FROM work_orders') <= TODAY).toBe(true);
  });

  it('links about 90 % of work orders to an asset, with the asset site (BR-W2)', () => {
    const linked = count('SELECT count(*) FROM work_orders WHERE asset_id IS NOT NULL');
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
    expect(rows.at(-1).number).toBe('WO-2026-00200');
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
