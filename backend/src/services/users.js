// Users: sessions, assignment lists and administration (docs/data-model.md → users,
// BR-U1 to BR-U8). password_hash is read by the login lookup only and never returned.
import argon2 from 'argon2';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { pageOffset, pageResponse } from '../lib/pagination.js';
import { fieldErrors } from '../middleware/validate.js';
import { auditLabel, creationChanges, diffChanges } from '../rules/audit.js';
import { CATEGORIES, ROLES } from '../rules/enums.js';
import { PASSWORD_MIN_LENGTH, defaultPowerUser, userChangeBlocker } from '../rules/users.js';
import { recordAudit } from './audit.js';
import { toUser } from './mappers.js';

const PUBLIC_COLUMNS =
  'id, last_name, first_name, username, role, site, specialty, power_user, is_active, created_at, updated_at';

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const nameText = z.string().trim().min(1, 'Required').max(100);
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200);
const USER_FIELDS = {
  first_name: nameText,
  last_name: nameText,
  role: z.enum(ROLES),
  site: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
  specialty: z.preprocess(blankToNull, z.enum(CATEGORIES).nullable()),
  power_user: z.boolean(),
  is_active: z.boolean(),
};

const createSchema = z.strictObject({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, 'Letters, digits, dot, dash or underscore, 3 to 50 characters'),
  password,
  first_name: USER_FIELDS.first_name,
  last_name: USER_FIELDS.last_name,
  role: USER_FIELDS.role,
  site: USER_FIELDS.site.optional(),
  specialty: USER_FIELDS.specialty.optional(),
  power_user: USER_FIELDS.power_user.optional(),
});

// The username never changes (BR-U3): it is not part of the update body.
const updateSchema = z
  .strictObject(Object.fromEntries(Object.entries(USER_FIELDS).map(([k, v]) => [k, v.optional()])))
  .refine((body) => Object.keys(body).length > 0, 'No field to update');

const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.enum(['true', 'false']).optional(),
});

const parse = (schema, body) => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new HttpError(400, 'Invalid body', fieldErrors(result.error));
  return result.data;
};

/** Escapes LIKE wildcards (the user list is small: a LIKE search is enough). */
const likeText = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** @param {import('better-sqlite3').Database} db */
export function createUserService(db) {
  const byId = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`);
  const sessionRow = db.prepare(
    `SELECT ${PUBLIC_COLUMNS}, credentials_changed_at FROM users WHERE id = ?`,
  );
  const credentials = db.prepare(
    'SELECT id, last_name, first_name, role, power_user, is_active, password_hash FROM users WHERE username = ?',
  );
  const assignable = db.prepare(
    `SELECT id, last_name, first_name, role, site, specialty FROM users
     WHERE role IN ('TECHNICIAN', 'SUPERVISOR') AND is_active = 1
     ORDER BY last_name, first_name, id`,
  );
  const activeAdmins = db
    .prepare("SELECT count(*) FROM users WHERE role = 'ADMIN' AND is_active = 1")
    .pluck();
  const openWorkOrders = db
    .prepare(
      "SELECT count(*) FROM work_orders WHERE assignee_id = ? AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')",
    )
    .pluck();
  const usernameTaken = db.prepare('SELECT 1 FROM users WHERE username = ?').pluck();
  const hashOf = db.prepare('SELECT password_hash FROM users WHERE id = ?').pluck();

  const getById = (id) => {
    const row = byId.get(id);
    return row ? toUser(row) : null;
  };

  return {
    /** Public user, or null. */
    getById,

    /** What the token check needs: the user, whether active, and the last password change. */
    session(id) {
      const row = sessionRow.get(id);
      return row
        ? {
            user: toUser(row),
            isActive: row.is_active === 1,
            credentialsChangedAt: row.credentials_changed_at,
          }
        : null;
    },

    /** Login lookup: the only query that reads password_hash. Username is case-insensitive (BR-U1). */
    findCredentials(username) {
      return credentials.get(username.toLowerCase()) ?? null;
    },

    /** Active users a work order can be assigned to (BR-W3), for dropdowns. */
    listAssignable() {
      return assignable.all();
    },

    /** GET /api/admin/users: every user, inactive included, with search and filters. */
    listAdmin(query) {
      const { page, size, q, role, is_active: active } = parse(listQuery, query);
      const where = [];
      const params = {};
      if (q) {
        where.push(
          "(username LIKE @q ESCAPE '\\' OR first_name LIKE @q ESCAPE '\\' OR last_name LIKE @q ESCAPE '\\')",
        );
        params.q = likeText(q);
      }
      if (role) {
        where.push('role = @role');
        params.role = role;
      }
      if (active) {
        where.push('is_active = @active');
        params.active = active === 'true' ? 1 : 0;
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db.prepare(`SELECT count(*) FROM users ${clause}`).pluck().get(params);
      const rows = db
        .prepare(
          `SELECT ${PUBLIC_COLUMNS} FROM users ${clause}
           ORDER BY is_active DESC, last_name, first_name, id LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: size, offset: pageOffset(page, size) });
      return pageResponse({ total, page, size, items: rows.map(toUser) });
    },

    /** POST /api/admin/users. */
    async create(body, actor, { now }) {
      const input = parse(createSchema, body);
      const hash = await argon2.hash(input.password);
      const id = db
        .transaction(() => {
          if (usernameTaken.get(input.username)) {
            throw new HttpError(409, `The username ${input.username} is already used`, {
              rule: 'BR-U1',
              fields: { username: 'Already used' },
            });
          }
          const stamp = now.toISOString();
          const row = {
            username: input.username,
            password_hash: hash,
            first_name: input.first_name,
            last_name: input.last_name,
            role: input.role,
            site: input.site ?? null,
            specialty: input.specialty ?? null,
            power_user: (input.power_user ?? defaultPowerUser(input.role)) ? 1 : 0,
            created_at: stamp,
            updated_at: stamp,
          };
          const newId = Number(
            db
              .prepare(
                `INSERT INTO users (username, password_hash, first_name, last_name, role, site, specialty,
                  power_user, created_at, updated_at)
                 VALUES (@username, @password_hash, @first_name, @last_name, @role, @site, @specialty,
                  @power_user, @created_at, @updated_at)`,
              )
              .run(row).lastInsertRowid,
          );
          const { password_hash: _hidden, ...visible } = toUser({
            ...row,
            id: newId,
            is_active: 1,
          });
          const { id: _id, ...logged } = visible;
          recordAudit(db, {
            entityType: 'users',
            entityId: newId,
            action: 'CREATE',
            changes: creationChanges(logged),
            label: auditLabel('users', row),
            userId: actor.id,
            at: stamp,
          });
          return newId;
        })
        .immediate();
      return getById(id);
    },

    /** PUT /api/admin/users/:id: profile, role, power-user mode, activation (BR-U4 to BR-U6). */
    update(id, body, actor, { now }) {
      const changes = parse(updateSchema, body);
      db.transaction(() => {
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!target) throw new HttpError(404, 'User not found');
        const blocker = userChangeBlocker({
          target,
          changes,
          activeAdmins: activeAdmins.get(),
          openWorkOrders: openWorkOrders.get(id),
          actorId: actor.id,
        });
        if (blocker) throw new HttpError(409, blocker.message, { rule: blocker.rule });

        const before = toUser(target);
        const logged = diffChanges(before, changes);
        if (!Object.keys(logged).length) return;
        const columns = Object.fromEntries(
          Object.entries(changes).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 1 : 0) : v]),
        );
        // Column names come from the schema above, never from the request as is.
        const sets = Object.keys(columns).map((k) => `${k} = @${k}`);
        db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = @__now WHERE id = @__id`).run(
          {
            ...columns,
            __now: now.toISOString(),
            __id: id,
          },
        );
        recordAudit(db, {
          entityType: 'users',
          entityId: id,
          action: 'UPDATE',
          changes: logged,
          label: auditLabel('users', { ...before, ...changes }),
          userId: actor.id,
          at: now.toISOString(),
        });
      }).immediate();
      return getById(id);
    },

    /**
     * Sets a new password (admin reset or the user's own change). Earlier tokens stop working
     * (BR-U8). The audit entry says a password changed, never anything about it.
     */
    async setPassword(id, newPassword, actor, { now, note }) {
      const value = parse(z.strictObject({ password }), { password: newPassword }).password;
      const target = getById(id);
      if (!target) throw new HttpError(404, 'User not found');
      const hash = await argon2.hash(value);
      const stamp = now.toISOString();
      // Compared with JWT issue times, which come from the real clock: use the real clock too
      // (the injected `now` can differ, e.g. in tests).
      const changedAt = new Date().toISOString();
      db.transaction(() => {
        db.prepare(
          'UPDATE users SET password_hash = ?, credentials_changed_at = ?, updated_at = ? WHERE id = ?',
        ).run(hash, changedAt, stamp, id);
        recordAudit(db, {
          entityType: 'users',
          entityId: id,
          action: 'UPDATE',
          note,
          label: auditLabel('users', target),
          userId: actor.id,
          at: stamp,
        });
      }).immediate();
    },

    /** True when `candidate` is the user's current password. */
    async verifyPassword(id, candidate) {
      const hash = hashOf.get(id);
      return Boolean(hash) && argon2.verify(hash, candidate);
    },
  };
}
