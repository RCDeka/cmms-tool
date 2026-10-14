// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// First administrator of a database without demo data (D70): `npm run user:create-admin`.
// Once an administrator exists, accounts are created on the Users page (D39).
import { createUserService } from '../services/users.js';

/**
 * Creates the first administrator, with the same checks and audit entry as `POST /api/admin/users`
 * (written without an author: nobody is logged in). Refused while an active administrator exists.
 * Invalid input throws the service's HttpError (400, `details.fields`).
 * @param {import('better-sqlite3').Database} db
 * @param {{ username: string, password: string, first_name: string, last_name: string,
 *   site?: string | null }} input
 * @param {{ now?: Date }} [options]
 */
export async function createFirstAdmin(db, input, { now = new Date() } = {}) {
  const activeAdmins = db
    .prepare("SELECT count(*) FROM users WHERE role = 'ADMIN' AND is_active = 1")
    .pluck()
    .get();
  if (activeAdmins > 0) {
    throw new Error(
      'An active administrator already exists: create other accounts on the Users page (/admin/users).',
    );
  }
  return createUserService(db).create({ ...input, role: 'ADMIN' }, { id: null }, { now });
}
