// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Migration files (`NNN_name.sql`) in application order. */
export function listMigrations(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort();
}

/**
 * Applies pending migrations in order, each in its own transaction, and records them in
 * schema_migrations. Committed migrations are never edited; add a new file instead.
 * Foreign keys are off while migrations run, so a table can be rebuilt (SQLite's way to change
 * a CHECK constraint); they are checked before each commit, and a violation rolls it back.
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]} names of the migrations applied by this call
 */
export function runMigrations(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ) STRICT`);

  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all());
  const pending = listMigrations(dir).filter((name) => !applied.has(name));
  const record = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');

  if (!pending.length) return pending;

  // The pragma has no effect inside a transaction: set it around them.
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    for (const name of pending) {
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      db.transaction(() => {
        db.exec(sql);
        const broken = db.pragma('foreign_key_check');
        if (broken.length) {
          throw new Error(
            `${name} breaks ${broken.length} foreign key(s), first in ${broken[0].table}`,
          );
        }
        record.run(name);
      })();
    }
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
  return pending;
}
