// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const BACKUP_FILE = /^cmms-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})Z\.sqlite$/;

/** 'cmms-2026-10-04T02-30-00Z.sqlite' for an instant (UTC, sortable, safe in file names). */
export function backupFileName(now) {
  return `cmms-${now.toISOString().slice(0, 19).replace(/:/g, '-')}Z.sqlite`;
}

/**
 * Deletes backups older than `keepDays`. Only files named like backups are touched.
 * @returns {string[]} deleted file names
 */
export function pruneBackups(dir, keepDays, now = new Date()) {
  const limit = now.getTime() - keepDays * 86_400_000;
  const removed = [];
  for (const name of fs.readdirSync(dir)) {
    const match = BACKUP_FILE.exec(name);
    if (!match) continue;
    const [day, time] = match[1].split('T');
    const takenAt = new Date(`${day}T${time.replace(/-/g, ':')}Z`).getTime();
    if (takenAt < limit) {
      fs.rmSync(path.join(dir, name));
      removed.push(name);
    }
  }
  return removed.sort();
}

/**
 * Copies the live database with SQLite's online backup API: consistent even while the
 * application writes (WAL mode), unlike copying the file. The copy is then checked with
 * PRAGMA integrity_check, and old copies are pruned.
 * @param {import('better-sqlite3').Database} db open connection to the live database
 * @param {{ dir: string, keepDays: number, now?: Date }} options
 * @returns {Promise<{ file: string, removed: string[] }>}
 */
export async function backupDatabase(db, { dir, keepDays, now = new Date() }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, backupFileName(now));
  await db.backup(file);

  // The copy inherits WAL mode from the live database; switch it back so the backup is one
  // self-contained file (no -wal / -shm beside it).
  const copy = new Database(file);
  try {
    copy.pragma('journal_mode = DELETE');
    const result = copy.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`Backup integrity check failed: ${result}`);
  } finally {
    copy.close();
  }
  return { file, removed: pruneBackups(dir, keepDays, now) };
}
