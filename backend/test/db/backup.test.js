import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupDatabase, backupFileName, pruneBackups } from '../../src/db/backup.js';
import { createTestDb } from '../helpers/db.js';

let ctx;
let dir;
beforeEach(() => {
  ctx = createTestDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-cmms-backups-'));
});
afterEach(() => {
  ctx.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('backupDatabase', () => {
  it('writes a consistent, checked copy, even with uncommitted WAL pages', async () => {
    ctx.db
      .prepare(
        "INSERT INTO users (username, password_hash, first_name, last_name, role) VALUES ('a', 'x', 'A', 'B', 'ADMIN')",
      )
      .run();
    const now = new Date('2026-10-04T02:30:00Z');
    const { file } = await backupDatabase(ctx.db, { dir, keepDays: 14, now });
    expect(path.basename(file)).toBe('cmms-2026-10-04T02-30-00Z.sqlite');
    expect(fs.readdirSync(dir)).toEqual([path.basename(file)]); // one self-contained file
    const copy = new Database(file, { readonly: true });
    expect(copy.pragma('journal_mode', { simple: true })).toBe('delete');
    expect(copy.prepare('SELECT count(*) FROM users').pluck().get()).toBe(1);
    expect(copy.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBeGreaterThan(0);
    copy.close();
  });

  it('keeps the last days only and never touches other files', async () => {
    const day = (d) => backupFileName(new Date(`2026-10-${d}T02:30:00Z`));
    for (const d of ['01', '10', '18']) fs.writeFileSync(path.join(dir, day(d)), '');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
    const { removed } = await backupDatabase(ctx.db, {
      dir,
      keepDays: 14,
      now: new Date('2026-10-20T02:30:00Z'),
    });
    expect(removed).toEqual([day('01')]);
    expect(fs.readdirSync(dir).sort()).toEqual(
      [day('10'), day('18'), backupFileName(new Date('2026-10-20T02:30:00Z')), 'notes.txt'].sort(),
    );
  });
});

describe('pruneBackups', () => {
  it('deletes nothing when everything is recent', () => {
    fs.writeFileSync(path.join(dir, backupFileName(new Date('2026-10-19T02:30:00Z'))), '');
    expect(pruneBackups(dir, 14, new Date('2026-10-20T00:00:00Z'))).toEqual([]);
  });
});
