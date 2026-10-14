// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';

/**
 * Creates a fresh, migrated SQLite database in a temporary directory.
 * Call `cleanup()` when done (typically in afterEach/afterAll).
 */
export function createTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-test-'));
  const db = openDb(path.join(dir, 'test.sqlite'));
  runMigrations(db);
  return {
    db,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const TEST_PASSWORD = 'test-password-123';

/**
 * Sites of the location tree (D82), for tests that build their own records: a record names
 * its site's place in `location_id`. Returns the id of each site by name.
 * @param {import('better-sqlite3').Database} db
 * @param {string[]} names
 */
export function addSites(db, names) {
  const insert = db.prepare(
    `INSERT INTO locations (id, parent_id, site_id, level_type_id, name, created_at, updated_at)
     VALUES (@id, NULL, @id, 1, @name, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );
  const next = db.prepare('SELECT coalesce(max(id), 0) + 1 FROM locations').pluck();
  return new Map(
    names.map((name) => {
      const id = next.get();
      insert.run({ id, name });
      return [name, id];
    }),
  );
}

/** SQL for the id of the site named by the SQL expression `expr` (see addSites). */
export const SITE_ID = (expr) =>
  `(SELECT id FROM locations WHERE parent_id IS NULL AND name = ${expr})`;
