// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Comments on work orders, shared by the requester and the maintenance team
// (docs/data-model.md → work_order_comments, D46). Append-only.
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors } from '../middleware/validate.js';
import { userRef, userRefColumns } from './mappers.js';

export const COMMENT_MAX_LENGTH = 2000;

const createSchema = z.strictObject({
  body: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(COMMENT_MAX_LENGTH, `At most ${COMMENT_MAX_LENGTH} characters`),
});

const SELECT = `SELECT c.id, c.work_order_id, c.body, c.user_role, c.created_at, ${userRefColumns('u')}
  FROM work_order_comments c JOIN users u ON u.id = c.user_id`;

const toComment = (row) => ({
  id: row.id,
  work_order_id: row.work_order_id,
  body: row.body,
  user: userRef(row, 'u'),
  user_role: row.user_role,
  created_at: row.created_at,
});

/** @param {import('better-sqlite3').Database} db */
export function createCommentService(db) {
  const forWorkOrder = db.prepare(
    `${SELECT} WHERE c.work_order_id = ? ORDER BY c.created_at, c.id`,
  );
  const byId = db.prepare(`${SELECT} WHERE c.id = ?`);
  const insert = db.prepare(
    `INSERT INTO work_order_comments (work_order_id, user_id, user_role, body, created_at)
     VALUES (@work_order_id, @user_id, @user_role, @body, @created_at)`,
  );

  return {
    /** Comments of a work order, oldest first (read as a conversation). */
    list(workOrderId) {
      return forWorkOrder.all(workOrderId).map(toComment);
    },

    /**
     * Adds a comment. The caller checks that the user may see the work order.
     * @param {number} workOrderId
     * @param {unknown} body request body `{ body }`
     * @param {{ id: number, role: string }} user
     * @param {{ now: Date }} ctx
     */
    add(workOrderId, body, user, { now }) {
      const parsed = createSchema.safeParse(body ?? {});
      if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
      const id = insert.run({
        work_order_id: workOrderId,
        user_id: user.id,
        user_role: user.role,
        body: parsed.data.body,
        created_at: now.toISOString(),
      }).lastInsertRowid;
      return toComment(byId.get(id));
    },
  };
}
