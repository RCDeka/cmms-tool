// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Improvement ideas sent from the pages of the tool (docs/data-model.md → feedback, D40).
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { pageOffset, pageQueryFields, pageResponse } from '../lib/pagination.js';
import { fieldErrors } from '../middleware/validate.js';
import { FEEDBACK_STATUSES, ROLES } from '../rules/enums.js';

export const MESSAGE_MAX_LENGTH = 2000;

const createSchema = z.strictObject({
  message: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(MESSAGE_MAX_LENGTH, `At most ${MESSAGE_MAX_LENGTH} characters`),
  page_path: z
    .string()
    .max(500)
    .regex(/^\/(?!\/)/, 'Must be a path of this site'),
  page_title: z.string().trim().max(200),
  viewport_width: z.number().int().min(1).max(20000).nullable().optional(),
});

const listQuery = z.strictObject({
  ...pageQueryFields,
  status: z.enum(FEEDBACK_STATUSES).optional(),
  role: z.enum(ROLES).optional(),
});

const parse = (schema, body) => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new HttpError(400, 'Invalid body', fieldErrors(result.error));
  return result.data;
};

const SELECT = `SELECT f.id, f.message, f.page_path, f.page_title, f.viewport_width, f.user_role,
    f.status, f.created_at, f.updated_at,
    u.id AS u_id, u.first_name AS u_first_name, u.last_name AS u_last_name
  FROM feedback f JOIN users u ON u.id = f.user_id`;

const toItem = (row) => ({
  id: row.id,
  message: row.message,
  page_path: row.page_path,
  page_title: row.page_title,
  viewport_width: row.viewport_width,
  user: { id: row.u_id, first_name: row.u_first_name, last_name: row.u_last_name },
  user_role: row.user_role,
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/** @param {import('better-sqlite3').Database} db */
export function createFeedbackService(db) {
  const insert = db.prepare(
    `INSERT INTO feedback (message, page_path, page_title, viewport_width, user_id, user_role,
       created_at, updated_at)
     VALUES (@message, @page_path, @page_title, @viewport_width, @user_id, @user_role,
       @now, @now)`,
  );
  const byId = db.prepare(`${SELECT} WHERE f.id = ?`);
  const setStatus = db.prepare(
    'UPDATE feedback SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?',
  );
  const getById = (id) => {
    const row = byId.get(id);
    return row ? toItem(row) : null;
  };

  return {
    getById,

    /** POST /api/feedback: any logged-in user. */
    create(body, user, { now }) {
      const input = parse(createSchema, body);
      const id = Number(
        insert.run({
          ...input,
          viewport_width: input.viewport_width ?? null,
          user_id: user.id,
          user_role: user.role,
          now: now.toISOString(),
        }).lastInsertRowid,
      );
      return getById(id);
    },

    /** GET /api/feedback: newest first, with status and role filters. */
    list(query) {
      const { page, size, status, role } = parse(listQuery, query);
      const where = [];
      if (status) where.push('f.status = @status');
      if (role) where.push('f.user_role = @role');
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db
        .prepare(`SELECT count(*) FROM feedback f ${clause}`)
        .pluck()
        .get({ status, role });
      const items = db
        .prepare(
          `${SELECT} ${clause} ORDER BY f.created_at DESC, f.id DESC LIMIT @size OFFSET @offset`,
        )
        .all({ status, role, size, offset: pageOffset(page, size) })
        .map(toItem);
      return pageResponse({ total, page, size, items });
    },

    /** PUT /api/feedback/:id: triage by an administrator. */
    updateStatus(id, body, actor, { now }) {
      const { status } = parse(z.strictObject({ status: z.enum(FEEDBACK_STATUSES) }), body);
      if (!setStatus.run(status, now.toISOString(), actor.id, id).changes) {
        throw new HttpError(404, 'Feedback not found');
      }
      return getById(id);
    },

    /** Ideas still to consider (NEW and PLANNED), oldest first, for `npm run feedback:export`. */
    openItems() {
      return db
        .prepare(`${SELECT} WHERE f.status IN ('NEW', 'PLANNED') ORDER BY f.created_at, f.id`)
        .all()
        .map(toItem);
    },
  };
}
