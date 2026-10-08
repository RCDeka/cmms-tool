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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-cmms-006-'));
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-cmms-migration-'));
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

  it('keeps resolution fields consistent with the conflict status', () => {
    const u = insert('users', user());
    expect(() => insert('conflicts', conflict(u, { resolution: 'A' }))).toThrow(/CHECK/);
    expect(() => insert('conflicts', conflict(u, { status: 'RESOLVED' }))).toThrow(/CHECK/);
    expect(() => insert('conflicts', conflict(u, { server_snapshot: 'not json' }))).toThrow(
      /CHECK/,
    );
  });
});
