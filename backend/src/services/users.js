import { toUser } from './mappers.js';

const PUBLIC_COLUMNS = 'id, last_name, first_name, username, role, site, specialty, power_user';

/** @param {import('better-sqlite3').Database} db */
export function createUserService(db) {
  const byId = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`);
  const credentials = db.prepare(
    'SELECT id, last_name, first_name, role, power_user, password_hash FROM users WHERE username = ?',
  );
  const assignable = db.prepare(
    `SELECT id, last_name, first_name, role, site, specialty FROM users
     WHERE role IN ('TECHNICIAN', 'SUPERVISOR')
     ORDER BY last_name, first_name, id`,
  );

  return {
    /** Public user, or null. */
    getById(id) {
      const row = byId.get(id);
      return row ? toUser(row) : null;
    },

    /** Login lookup: the only query that reads password_hash. Username is case-insensitive (BR-U1). */
    findCredentials(username) {
      return credentials.get(username.toLowerCase()) ?? null;
    },

    /** Users a work order can be assigned to (BR-W3), for dropdowns. */
    listAssignable() {
      return assignable.all();
    },
  };
}
