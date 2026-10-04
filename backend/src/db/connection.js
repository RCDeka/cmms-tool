import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Opens the SQLite database and applies the connection pragmas from docs/data-model.md.
 * Creates the parent directory of the file if needed.
 * @param {string} databasePath file path or ':memory:'
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}
