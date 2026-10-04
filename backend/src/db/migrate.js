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

  for (const name of pending) {
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(name);
    })();
  }
  return pending;
}
