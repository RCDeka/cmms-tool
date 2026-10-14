// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/connection.js';
import { listMigrations, pendingMigrations, runMigrations } from '../../src/db/migrate.js';
import { migrateWithBackup } from '../../src/db/upgrade.js';

const REAL_MIGRATIONS = path.resolve(import.meta.dirname, '../../src/db/migrations');
const NOW = new Date('2026-10-14T09:00:00Z');

let dir;
let migrations;
let backups;
let db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-upgrade-'));
  // The real migrations, so a later release can be simulated by adding one.
  migrations = path.join(dir, 'migrations');
  fs.cpSync(REAL_MIGRATIONS, migrations, { recursive: true });
  backups = path.join(dir, 'backups');
  db = openDb(path.join(dir, 'cmms.sqlite'));
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const options = () => ({ dir: backups, keepDays: 14, now: NOW, migrationsDir: migrations });
const backupFiles = () => (fs.existsSync(backups) ? fs.readdirSync(backups) : []);

/** A database of the current release holding one user, then a new release with one migration. */
function updateWithOneMigration() {
  runMigrations(db, migrations);
  db.prepare(
    "INSERT INTO users (username, password_hash, first_name, last_name, role) VALUES ('a', 'x', 'A', 'B', 'ADMIN')",
  ).run();
  fs.writeFileSync(
    path.join(migrations, '999_next_release.sql'),
    'CREATE TABLE next_release (id INTEGER) STRICT;',
  );
}

describe('pendingMigrations', () => {
  it('lists every migration for a new database without creating anything', () => {
    expect(pendingMigrations(db, migrations)).toEqual(listMigrations(migrations));
    expect(db.prepare('SELECT count(*) FROM sqlite_master').pluck().get()).toBe(0);
  });

  it('lists only those not applied', () => {
    updateWithOneMigration();
    expect(pendingMigrations(db, migrations)).toEqual(['999_next_release.sql']);
  });
});

describe('migrateWithBackup', () => {
  it('writes a backup of the database before applying pending migrations', async () => {
    updateWithOneMigration();
    const { applied, backup } = await migrateWithBackup(db, options());
    expect(applied).toEqual(['999_next_release.sql']);
    expect(backup).toBe(path.join(backups, 'cmms-2026-10-14T09-00-00Z.sqlite'));
    expect(backupFiles()).toEqual([path.basename(backup)]);

    // The backup is the database as it was before the migration, data included.
    const copy = new Database(backup, { readonly: true });
    const tables = copy
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all();
    expect(tables).not.toContain('next_release');
    expect(copy.prepare('SELECT username FROM users').pluck().all()).toEqual(['a']);
    expect(copy.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBe(
      listMigrations(REAL_MIGRATIONS).length,
    );
    copy.close();
    expect(pendingMigrations(db, migrations)).toEqual([]);
  });

  it('writes no backup when no migration is pending', async () => {
    runMigrations(db, migrations);
    expect(await migrateWithBackup(db, options())).toEqual({ applied: [], backup: null });
    expect(backupFiles()).toEqual([]);
  });

  it('writes no backup of a new database, which it creates', async () => {
    const { applied, backup } = await migrateWithBackup(db, options());
    expect(applied).toEqual(listMigrations(migrations));
    expect(backup).toBeNull();
    expect(backupFiles()).toEqual([]);
  });

  it('applies nothing when the backup cannot be written', async () => {
    updateWithOneMigration();
    fs.writeFileSync(backups, 'a file where the backup directory should be');
    await expect(migrateWithBackup(db, options())).rejects.toThrow();
    expect(pendingMigrations(db, migrations)).toEqual(['999_next_release.sql']);
  });
});
