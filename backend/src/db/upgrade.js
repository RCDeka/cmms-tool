// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { backupDatabase } from './backup.js';
import { listMigrations, pendingMigrations, runMigrations } from './migrate.js';

/**
 * Applies pending migrations, after writing a backup of the database when it already holds data
 * (some migrations applied): rolling back an update restores that backup (README → Operations).
 * A new database gets no backup, and an up-to-date one is not touched. If the backup fails,
 * nothing is migrated.
 * @param {import('better-sqlite3').Database} db
 * @param {{ dir: string, keepDays: number, now?: Date, migrationsDir?: string }} options
 *   backup directory and retention, as for backupDatabase
 * @returns {Promise<{ applied: string[], backup: string | null }>} migrations applied, backup file
 */
export async function migrateWithBackup(db, { dir, keepDays, now, migrationsDir }) {
  const pending = pendingMigrations(db, migrationsDir);
  let backup = null;
  if (pending.length && pending.length < listMigrations(migrationsDir).length) {
    backup = (await backupDatabase(db, { dir, keepDays, now })).file;
  }
  return { applied: runMigrations(db, migrationsDir), backup };
}
