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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-cmms-test-'));
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
