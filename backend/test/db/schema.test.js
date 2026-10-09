import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/connection.js';
import { listMigrations, runMigrations } from '../../src/db/migrate.js';

const MIGRATIONS = path.join(import.meta.dirname, '../../src/db/migrations');
import * as enums from '../../src/rules/enums.js';
import { createTestDb } from '../helpers/db.js';

let ctx;
let db;
beforeEach(() => {
  ctx = createTestDb();
  db = ctx.db;
});
afterEach(() => ctx.cleanup());

const insert = (table, row) => {
  const cols = Object.keys(row);
  return Number(
    db
      .prepare(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`,
      )
      .run(row).lastInsertRowid,
  );
};

let userSeq = 0;
const user = (o = {}) => ({
  username: `user${++userSeq}`,
  password_hash: 'x',
  first_name: 'Ada',
  last_name: 'Lovelace',
  role: 'TECHNICIAN',
  ...o,
});
let assetSeq = 0;
const asset = (o = {}) => ({
  code: `AST-T${++assetSeq}`,
  name: 'Test asset',
  site: 'Test site',
  category: 'HVAC',
  criticality: 'LOW',
  status: 'IN_SERVICE',
  ...o,
});
let woSeq = 0;
const workOrder = (createdBy, o = {}) => ({
  number: `WO-2026-${String(++woSeq).padStart(5, '0')}`,
  type: 'CORRECTIVE',
  status: 'OPEN',
  priority: 'NORMAL',
  title: 'Test',
  site: 'Test site',
  created_on: '2026-10-01',
  created_by: createdBy,
  ...o,
});
let planSeq = 0;
const plan = (createdBy, o = {}) => ({
  code: `PM-${String(++planSeq).padStart(4, '0')}`,
  title: 'Test plan',
  type: 'PREVENTIVE',
  category: 'HVAC',
  site: 'Test site',
  estimated_hours: 2,
  frequency_weeks: 13,
  anchor_week: '2026-W42',
  tolerance_weeks: 3,
  created_by: createdBy,
  created_at: '2026-10-04T12:00:00.000Z',
  updated_at: '2026-10-04T12:00:00.000Z',
  ...o,
});
const occurrence = (planId, o = {}) => ({
  plan_id: planId,
  due_week: '2026-W42',
  week: '2026-W42',
  created_at: '2026-10-04T12:00:00.000Z',
  updated_at: '2026-10-04T12:00:00.000Z',
  ...o,
});
let daySeq = 0;
/** A block of hours; a new day each time, so capacity overrides never collide. */
const allocation = (personId, o = {}) => ({
  kind: 'TRAVEL',
  technician_id: personId,
  day: `2026-11-${String((++daySeq % 28) + 1).padStart(2, '0')}`,
  hours: 1,
  created_by: personId,
  created_at: '2026-10-04T12:00:00.000Z',
  updated_at: '2026-10-04T12:00:00.000Z',
  ...o,
});
const conflict = (userId, o = {}) => ({
  entity_type: 'assets',
  entity_id: 1,
  base_version: 1,
  server_version: 2,
  server_snapshot: '{}',
  client_changes: '{}',
  server_updated_at: '2026-10-04T10:00:00.000Z',
  client_user_id: userId,
  client_edited_at: '2026-10-04T10:05:00.000Z',
  ...o,
});

describe('migrations', () => {
  it('applies every migration once and records it', () => {
    expect(db.prepare('SELECT name FROM schema_migrations').pluck().all()).toEqual(
      listMigrations(),
    );
    expect(runMigrations(db)).toEqual([]);
  });

  it('keeps the foreign keys to rebuilt tables working (006 rebuilds users)', () => {
    expect(() => insert('work_orders', workOrder(9999))).toThrow(/FOREIGN KEY constraint failed/);
    const u = insert('users', user({ role: 'STAFF' }));
    expect(() =>
      insert('work_order_comments', {
        work_order_id: 9999,
        user_id: u,
        user_role: 'STAFF',
        body: 'Hello',
        created_at: '2026-10-04T12:00:00.000Z',
      }),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('reviews staff requests sent before 007 according to their state', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-006-'));
    try {
      // A database as it was after 006, then 007 applied to it.
      for (const name of listMigrations().filter((n) => n < '007')) {
        fs.copyFileSync(path.join(MIGRATIONS, name), path.join(dir, name));
      }
      const legacy = openDb(path.join(dir, 'legacy.sqlite'));
      runMigrations(legacy, dir);
      const ins = (table, row) => {
        const cols = Object.keys(row);
        return Number(
          legacy
            .prepare(
              `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`,
            )
            .run(row).lastInsertRowid,
        );
      };
      const staff = ins('users', user({ role: 'STAFF' }));
      const tech = ins('users', user());
      const waiting = ins('work_orders', workOrder(staff));
      const taken = ins('work_orders', workOrder(staff, { assignee_id: tech }));
      const cancelled = ins('work_orders', workOrder(staff, { status: 'CANCELLED' }));
      const regular = ins('work_orders', workOrder(tech));
      fs.copyFileSync(
        path.join(MIGRATIONS, '007_request_review.sql'),
        path.join(dir, '007_request_review.sql'),
      );
      runMigrations(legacy, dir);
      const status = (id) =>
        legacy.prepare('SELECT review_status FROM work_orders WHERE id = ?').pluck().get(id);
      expect([waiting, taken, cancelled, regular].map(status)).toEqual([
        'PENDING',
        'APPROVED',
        'REJECTED',
        null,
      ]);
      legacy.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a request waiting for review open and unassigned, a rejected one cancelled', () => {
    const u = insert('users', user());
    expect(() =>
      insert('work_orders', workOrder(u, { review_status: 'PENDING', assignee_id: u })),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      insert('work_orders', workOrder(u, { review_status: 'PENDING', status: 'IN_PROGRESS' })),
    ).toThrow(/CHECK constraint failed/);
    expect(() => insert('work_orders', workOrder(u, { review_status: 'REJECTED' }))).toThrow(
      /CHECK constraint failed/,
    );
    expect(() =>
      insert('work_orders', workOrder(u, { review_status: 'REJECTED', status: 'CANCELLED' })),
    ).not.toThrow();
    expect(() => insert('work_orders', workOrder(u, { review_status: 'MAYBE' }))).toThrow(
      /CHECK constraint failed/,
    );
  });

  it('rolls back a migration that breaks a foreign key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-migration-'));
    try {
      fs.writeFileSync(
        path.join(dir, '900_orphan.sql'),
        'CREATE TABLE t (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users (id)) STRICT;\nINSERT INTO t VALUES (1, 9999);',
      );
      expect(() => runMigrations(db, dir)).toThrow(/breaks 1 foreign key/);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 't'").get()).toBeUndefined();
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enables foreign keys and WAL', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  });
});

describe('CHECK constraints match src/rules/enums.js', () => {
  const cases = [
    ['users.role', enums.ROLES, (v) => insert('users', user({ role: v }))],
    ['users.specialty', enums.CATEGORIES, (v) => insert('users', user({ specialty: v }))],
    ['assets.category', enums.CATEGORIES, (v) => insert('assets', asset({ category: v }))],
    ['assets.criticality', enums.CRITICALITIES, (v) => insert('assets', asset({ criticality: v }))],
    ['assets.status', enums.ASSET_STATUSES, (v) => insert('assets', asset({ status: v }))],
    [
      'work_orders.type',
      enums.WORK_ORDER_TYPES,
      (v) => insert('work_orders', workOrder(insert('users', user()), { type: v })),
    ],
    [
      'work_orders.status',
      enums.WORK_ORDER_STATUSES,
      (v) =>
        insert(
          'work_orders',
          workOrder(insert('users', user()), {
            status: v,
            ...(v === 'CLOSED' && { closed_on: '2026-10-02', work_report: 'Done' }),
          }),
        ),
    ],
    [
      'work_orders.priority',
      enums.WORK_ORDER_PRIORITIES,
      (v) => insert('work_orders', workOrder(insert('users', user()), { priority: v })),
    ],
    [
      'feedback.status',
      enums.FEEDBACK_STATUSES,
      (v) =>
        insert('feedback', {
          message: 'Idea',
          page_path: '/dashboard',
          page_title: 'Dashboard',
          user_id: insert('users', user()),
          user_role: 'TECHNICIAN',
          status: v,
          created_at: '2026-10-04T12:00:00.000Z',
          updated_at: '2026-10-04T12:00:00.000Z',
        }),
    ],
    [
      'feedback.user_role',
      enums.ROLES,
      (v) =>
        insert('feedback', {
          message: 'Idea',
          page_path: '/requests',
          page_title: 'My requests',
          user_id: insert('users', user()),
          user_role: v,
          created_at: '2026-10-04T12:00:00.000Z',
          updated_at: '2026-10-04T12:00:00.000Z',
        }),
    ],
    [
      'work_order_comments.user_role',
      enums.ROLES,
      (v) => {
        const u = insert('users', user());
        insert('work_order_comments', {
          work_order_id: insert('work_orders', workOrder(u)),
          user_id: u,
          user_role: v,
          body: 'Any news?',
          created_at: '2026-10-04T12:00:00.000Z',
        });
      },
    ],
    [
      'conflicts.entity_type',
      enums.CONFLICT_ENTITY_TYPES,
      (v) =>
        insert(
          'conflicts',
          conflict(insert('users', user()), { entity_type: v, entity_id: ++userSeq }),
        ),
    ],
    [
      'conflicts.resolution',
      enums.CONFLICT_RESOLUTIONS,
      (v) => {
        const u = insert('users', user());
        insert(
          'conflicts',
          conflict(u, {
            entity_id: ++userSeq,
            status: 'RESOLVED',
            resolution: v,
            resolved_by: u,
            resolved_at: '2026-10-04T11:00:00.000Z',
          }),
        );
      },
    ],
    [
      'maintenance_plans.type',
      enums.PLAN_TYPES,
      (v) => insert('maintenance_plans', plan(insert('users', user()), { type: v })),
    ],
    [
      'maintenance_plans.category',
      enums.CATEGORIES,
      (v) => insert('maintenance_plans', plan(insert('users', user()), { category: v })),
    ],
    [
      'maintenance_plans.schedule_mode',
      enums.SCHEDULE_MODES,
      (v) => insert('maintenance_plans', plan(insert('users', user()), { schedule_mode: v })),
    ],
    [
      'maintenance_plans.performed_by',
      enums.PERFORMERS,
      (v) => insert('maintenance_plans', plan(insert('users', user()), { performed_by: v })),
    ],
    [
      'plan_occurrences.status',
      enums.OCCURRENCE_STATUSES,
      (v) => {
        const u = insert('users', user());
        insert(
          'plan_occurrences',
          occurrence(insert('maintenance_plans', plan(u)), {
            status: v,
            ...(v === 'RELEASED' && { work_order_id: insert('work_orders', workOrder(u)) }),
            ...(v === 'SKIPPED' && { skip_reason: 'Closed for works' }),
          }),
        );
      },
    ],
    [
      'allocations.kind',
      enums.ALLOCATION_KINDS,
      (v) => {
        const u = insert('users', user());
        insert(
          'allocations',
          allocation(u, {
            kind: v,
            work_order_id: v === 'WORK' ? insert('work_orders', workOrder(u)) : null,
          }),
        );
      },
    ],
    [
      'capacity_overrides.reason',
      enums.CAPACITY_REASONS,
      (v) => {
        const u = insert('users', user());
        insert('capacity_overrides', {
          technician_id: u,
          day: '2026-10-05',
          hours: 0,
          reason: v,
          updated_by: u,
          updated_at: '2026-10-04T12:00:00.000Z',
        });
      },
    ],
    [
      'audit_log.entity_type',
      enums.AUDIT_ENTITY_TYPES,
      (v) => insert('audit_log', { entity_type: v, entity_id: 1, action: 'UPDATE', label: 'x' }),
    ],
  ];

  it.each(cases)('%s accepts every enum value and rejects others', (_name, values, run) => {
    for (const v of values) expect(() => run(v)).not.toThrow();
    expect(() => run('NOT_A_VALUE')).toThrow(/CHECK constraint failed/);
    // Values are case-sensitive.
    const v = values[0];
    const otherCase = v === v.toLowerCase() ? v.toUpperCase() : v.toLowerCase();
    expect(() => run(otherCase)).toThrow(/CHECK constraint failed/);
  });
});

describe('integrity rules', () => {
  it('enforces unique asset codes and work order numbers', () => {
    insert('assets', asset({ code: 'AST-0001' }));
    expect(() => insert('assets', asset({ code: 'AST-0001' }))).toThrow(/UNIQUE/);
    const u = insert('users', user());
    insert('work_orders', workOrder(u, { number: 'WO-2026-00001' }));
    expect(() => insert('work_orders', workOrder(u, { number: 'WO-2026-00001' }))).toThrow(
      /UNIQUE/,
    );
  });

  it('enforces the work order number format and lowercase usernames', () => {
    const u = insert('users', user());
    expect(() => insert('work_orders', workOrder(u, { number: 'WO-26-1' }))).toThrow(/CHECK/);
    expect(() => insert('users', user({ username: 'Admin' }))).toThrow(/CHECK/);
  });

  it('allows many work orders without client_id but rejects a duplicate client_id (D26)', () => {
    const u = insert('users', user());
    insert('work_orders', workOrder(u));
    insert('work_orders', workOrder(u));
    insert('work_orders', workOrder(u, { client_id: 'c1' }));
    expect(() => insert('work_orders', workOrder(u, { client_id: 'c1' }))).toThrow(/UNIQUE/);
  });

  it('rejects unknown foreign keys', () => {
    expect(() => insert('work_orders', workOrder(9999))).toThrow(/FOREIGN KEY/);
    const u = insert('users', user());
    expect(() => insert('work_orders', workOrder(u, { asset_id: 9999 }))).toThrow(/FOREIGN KEY/);
  });

  it('rejects badly formatted dates and wrong types (STRICT)', () => {
    expect(() => insert('assets', asset({ commissioned_on: '04/10/2026' }))).toThrow(/CHECK/);
    expect(() => insert('assets', asset({ version: 'two' }))).toThrow(
      /cannot store TEXT value in INTEGER/,
    );
  });

  it('enforces BR-W8 date order', () => {
    const u = insert('users', user());
    expect(() => insert('work_orders', workOrder(u, { due_on: '2026-09-30' }))).toThrow(/CHECK/);
    expect(() =>
      insert('work_orders', workOrder(u, { started_on: '2026-10-03', closed_on: '2026-10-02' })),
    ).toThrow(/CHECK/);
    expect(() => insert('work_orders', workOrder(u, { due_on: '2026-10-01' }))).not.toThrow();
  });

  it('requires closed_on and a work report on CLOSED work orders (BR-W6)', () => {
    const u = insert('users', user());
    const closed = { status: 'CLOSED', started_on: '2026-10-01', closed_on: '2026-10-02' };
    expect(() => insert('work_orders', workOrder(u, closed))).toThrow(/CHECK/);
    expect(() => insert('work_orders', workOrder(u, { ...closed, work_report: '  ' }))).toThrow(
      /CHECK/,
    );
    expect(() =>
      insert('work_orders', workOrder(u, { ...closed, work_report: 'Fixed' })),
    ).not.toThrow();
  });

  it('allows one open conflict per record, and any number of resolved ones (D4)', () => {
    const u = insert('users', user());
    const resolved = {
      status: 'RESOLVED',
      resolution: 'A',
      resolved_by: u,
      resolved_at: '2026-10-04T11:00:00.000Z',
    };
    insert('conflicts', conflict(u, resolved));
    insert('conflicts', conflict(u, resolved));
    insert('conflicts', conflict(u));
    expect(() => insert('conflicts', conflict(u))).toThrow(/UNIQUE/);
    expect(() => insert('conflicts', conflict(u, { entity_type: 'work_orders' }))).not.toThrow();
  });

  it('keeps plans consistent: code, half hours, weeks, seasons (D48)', () => {
    const u = insert('users', user());
    expect(() => insert('maintenance_plans', plan(u, { code: 'PLAN-1' }))).toThrow(/CHECK/);
    expect(() => insert('maintenance_plans', plan(u, { estimated_hours: 1.25 }))).toThrow(/CHECK/);
    expect(() => insert('maintenance_plans', plan(u, { estimated_hours: 0 }))).toThrow(/CHECK/);
    expect(() => insert('maintenance_plans', plan(u, { anchor_week: '2026-42' }))).toThrow(/CHECK/);
    expect(() => insert('maintenance_plans', plan(u, { frequency_weeks: 105 }))).toThrow(/CHECK/);
    expect(() => insert('maintenance_plans', plan(u, { tolerance_weeks: 9 }))).toThrow(/CHECK/);
    expect(() => insert('maintenance_plans', plan(u, { season_from_week: 14 }))).toThrow(/CHECK/);
    expect(() =>
      insert('maintenance_plans', plan(u, { season_from_week: 45, season_to_week: 10 })),
    ).not.toThrow();
    const p = insert('maintenance_plans', plan(u, { code: 'PM-9000' }));
    expect(() => insert('maintenance_plans', plan(u, { code: 'PM-9000' }))).toThrow(/UNIQUE/);
    expect(() => insert('work_orders', workOrder(u, { plan_id: p, planned_week: 'W42' }))).toThrow(
      /CHECK/,
    );
    expect(() => insert('work_orders', workOrder(u, { plan_id: 9999 }))).toThrow(/FOREIGN KEY/);
  });

  it('links an occurrence to one work order only when released (BR-P6, BR-P7)', () => {
    const u = insert('users', user());
    const p = insert('maintenance_plans', plan(u));
    const wo = insert('work_orders', workOrder(u, { plan_id: p }));
    expect(() => insert('plan_occurrences', occurrence(p, { status: 'RELEASED' }))).toThrow(
      /CHECK/,
    );
    expect(() => insert('plan_occurrences', occurrence(p, { work_order_id: wo }))).toThrow(/CHECK/);
    expect(() => insert('plan_occurrences', occurrence(p, { status: 'SKIPPED' }))).toThrow(/CHECK/);
    insert('plan_occurrences', occurrence(p, { status: 'RELEASED', work_order_id: wo }));
    // One occurrence per due week, and one occurrence per work order.
    expect(() => insert('plan_occurrences', occurrence(p))).toThrow(/UNIQUE/);
    expect(() =>
      insert(
        'plan_occurrences',
        occurrence(p, { due_week: '2027-W03', status: 'RELEASED', work_order_id: wo }),
      ),
    ).toThrow(/UNIQUE/);
    // A visit skipped by cancelling its work order keeps the link.
    expect(() =>
      insert(
        'plan_occurrences',
        occurrence(p, {
          due_week: '2027-W16',
          status: 'SKIPPED',
          skip_reason: 'Work order cancelled',
          work_order_id: insert('work_orders', workOrder(u, { plan_id: p })),
        }),
      ),
    ).not.toThrow();
  });

  it('blocks a week once per site, and once for every site (Phase 18)', () => {
    const u = insert('users', user());
    const blocked = (o = {}) => ({
      week: '2026-W52',
      reason: 'Change freeze',
      created_by: u,
      created_at: '2026-10-04T12:00:00.000Z',
      ...o,
    });
    insert('blocked_weeks', blocked());
    expect(() => insert('blocked_weeks', blocked())).toThrow(/UNIQUE/);
    insert('blocked_weeks', blocked({ site: 'Lyon' }));
    expect(() => insert('blocked_weeks', blocked({ site: 'Lyon' }))).toThrow(/UNIQUE/);
    expect(() => insert('blocked_weeks', blocked({ week: '52' }))).toThrow(/CHECK/);
    expect(() => insert('blocked_weeks', blocked({ week: '2026-W53', reason: ' ' }))).toThrow(
      /CHECK/,
    );
    const p = insert('maintenance_plans', plan(u));
    const o = insert('plan_occurrences', occurrence(p));
    expect(db.prepare('SELECT version FROM plan_occurrences WHERE id = ?').pluck().get(o)).toBe(1);
  });

  it('keeps blocks consistent: half hours, work order only on work, locks (Phase 19)', () => {
    const u = insert('users', user());
    const wo = insert('work_orders', workOrder(u));
    expect(() => insert('allocations', allocation(u, { hours: 1.25 }))).toThrow(/CHECK/);
    expect(() => insert('allocations', allocation(u, { hours: 0 }))).toThrow(/CHECK/);
    expect(() => insert('allocations', allocation(u, { hours: 8.5 }))).toThrow(/CHECK/);
    expect(() => insert('allocations', allocation(u, { day: '5 Oct' }))).toThrow(/CHECK/);
    // WORK ⇔ a work order.
    expect(() => insert('allocations', allocation(u, { kind: 'WORK' }))).toThrow(/CHECK/);
    expect(() => insert('allocations', allocation(u, { work_order_id: wo }))).toThrow(/CHECK/);
    // An appointment: a time on the half hour, who locked it, on work only.
    const work = { kind: 'WORK', work_order_id: wo };
    expect(() => insert('allocations', allocation(u, { ...work, locked_start: '10:00' }))).toThrow(
      /CHECK/,
    );
    expect(() =>
      insert('allocations', allocation(u, { ...work, locked_start: '10:15', locked_by: u })),
    ).toThrow(/CHECK/);
    expect(() =>
      insert('allocations', allocation(u, { locked_start: '10:00', locked_by: u })),
    ).toThrow(/CHECK/);
    expect(() =>
      insert('allocations', allocation(u, { ...work, locked_start: '10:30', locked_by: u })),
    ).not.toThrow();
    expect(() => insert('allocations', allocation(u, { ...work, work_order_id: 9999 }))).toThrow(
      /FOREIGN KEY/,
    );
    expect(() => insert('allocations', allocation(u, { note: 'x'.repeat(501) }))).toThrow(/CHECK/);
  });

  it('keeps one capacity override per person and day, and weekend switches per week', () => {
    const u = insert('users', user());
    const override = (o = {}) => ({
      technician_id: u,
      day: '2026-10-08',
      hours: 0,
      reason: 'LEAVE',
      updated_by: u,
      updated_at: '2026-10-04T12:00:00.000Z',
      ...o,
    });
    insert('capacity_overrides', override());
    expect(() => insert('capacity_overrides', override())).toThrow(/UNIQUE|PRIMARY/);
    expect(() =>
      insert('capacity_overrides', override({ day: '2026-10-09', hours: 12.5 })),
    ).toThrow(/CHECK/);
    expect(() =>
      insert('capacity_overrides', override({ day: '2026-10-09', hours: 3.25 })),
    ).toThrow(/CHECK/);
    const week = { week: '2026-W41', saturday_open: 1, updated_by: u, updated_at: 'x' };
    insert('schedule_weeks', week);
    expect(() => insert('schedule_weeks', week)).toThrow(/UNIQUE|PRIMARY/);
    expect(() => insert('schedule_weeks', { ...week, week: '2026-W42', sunday_open: 2 })).toThrow(
      /CHECK/,
    );
    expect(() => insert('schedule_weeks', { ...week, week: 'W42' })).toThrow(/CHECK/);
  });

  it('keeps one row of planning settings with bounded values (P16)', () => {
    expect(db.prepare('SELECT reserve_percent, daily_hours FROM planning_settings').all()).toEqual([
      { reserve_percent: 30, daily_hours: 7 },
    ]);
    expect(() => insert('planning_settings', { id: 2, updated_at: 'x' })).toThrow(/CHECK/);
    expect(() => db.prepare('UPDATE planning_settings SET reserve_percent = 81').run()).toThrow(
      /CHECK/,
    );
    expect(() => db.prepare('UPDATE planning_settings SET max_block_hours = 3.25').run()).toThrow(
      /CHECK/,
    );
  });

  it('keeps resolution fields consistent with the conflict status', () => {
    const u = insert('users', user());
    expect(() => insert('conflicts', conflict(u, { resolution: 'A' }))).toThrow(/CHECK/);
    expect(() => insert('conflicts', conflict(u, { status: 'RESOLVED' }))).toThrow(/CHECK/);
    expect(() => insert('conflicts', conflict(u, { server_snapshot: 'not json' }))).toThrow(
      /CHECK/,
    );
  });
});
