// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Staff requests (D46): the work orders a STAFF user created, in a shape without the
// maintenance-only fields (hours, supervisor, versioning).
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { pageOffset, pageResponse } from '../lib/pagination.js';
import { fieldErrors } from '../middleware/validate.js';
import { WORK_ORDER_FIELDS, WRITE_META } from '../rules/fields.js';
import { auditLabel, diffChanges } from '../rules/audit.js';
import { snapshotToApi } from '../rules/conflict-diff.js';
import { REQUEST_TYPE, statusTimeline, withdrawalBlocker } from '../rules/requests.js';
import { recordAudit } from './audit.js';
import { userRef, userRefColumns } from './mappers.js';

/** POST /api/requests body. "I don't know" in the form means the field is left out (or null). */
const createSchema = z.strictObject({
  client_id: z.uuid(),
  title: WORK_ORDER_FIELDS.title,
  description: WORK_ORDER_FIELDS.description.optional(),
  site: WORK_ORDER_FIELDS.site,
  // A place of the list, or a description of the place, or both (BR-R1, BR-LOC9).
  location_id: z.number().int().positive().nullable().optional(),
  location: WORK_ORDER_FIELDS.location.optional(),
  category: WORK_ORDER_FIELDS.category.optional(),
  priority: WORK_ORDER_FIELDS.priority.optional(),
  edited_at: WRITE_META.edited_at,
});

const FIELDS = [
  'id',
  'number',
  'status',
  'priority',
  'title',
  'description',
  'site',
  'location_id',
  'place',
  'location',
  'category',
  'created_on',
  'due_on',
  'started_on',
  'completed_on',
  'closed_on',
  'work_report',
  'review_status',
  'review_note',
  'reviewed_at',
  'client_id',
  'created_at',
  'updated_at',
];

const SELECT = `SELECT ${FIELDS.map((f) => `w.${f}`).join(', ')}, ${userRefColumns('asg')},
    (SELECT count(*) FROM work_order_comments c WHERE c.work_order_id = w.id) AS comment_count,
    (SELECT max(c.created_at) FROM work_order_comments c WHERE c.work_order_id = w.id) AS last_comment_at
  FROM work_orders w
  LEFT JOIN users asg ON asg.id = w.assignee_id`;

const OPEN_CLAUSE = "AND w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')";

function toRequest(row) {
  const item = {};
  for (const f of FIELDS) item[f] = row[f];
  item.assignee = userRef(row, 'asg');
  item.comment_count = row.comment_count;
  item.last_comment_at = row.last_comment_at;
  return item;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} deps
 * @param {ReturnType<import('./work-orders.js').createWorkOrderService>} deps.workOrders
 * @param {ReturnType<import('./comments.js').createCommentService>} deps.comments
 * @param {ReturnType<import('./locations.js').createLocationService>} deps.locations
 */
export function createRequestService(db, { workOrders, comments, locations }) {
  const ownById = db.prepare(`${SELECT} WHERE w.id = ? AND w.created_by = ?`);
  const ownRow = db.prepare('SELECT * FROM work_orders WHERE id = ? AND created_by = ?');
  const withdraw = db.prepare(
    `UPDATE work_orders SET status = 'CANCELLED', review_status = 'WITHDRAWN',
       version = version + 1, updated_by = @user, updated_at = @now WHERE id = @id`,
  );
  const auditOf = db.prepare(
    `SELECT action, changes, note, coalesce(edited_at, at) AS at FROM audit_log
     WHERE entity_type = 'work_orders' AND entity_id = ? ORDER BY id`,
  );
  const getOwn = (id, userId) => {
    const row = ownById.get(id, userId);
    return row ? toRequest(row) : null;
  };

  return {
    /** GET /api/requests: the user's requests, newest first. */
    list(userId, { scope, page, size }) {
      const clause = `WHERE w.created_by = @userId ${scope === 'open' ? OPEN_CLAUSE : ''}`;
      const total = db
        .prepare(`SELECT count(*) FROM work_orders w ${clause}`)
        .pluck()
        .get({ userId });
      const rows = db
        .prepare(
          `${SELECT} ${clause} ORDER BY w.created_at DESC, w.id DESC LIMIT @limit OFFSET @offset`,
        )
        .all({ userId, limit: size, offset: pageOffset(page, size) });
      return pageResponse({ total, page, size, items: rows.map(toRequest) });
    },

    /** One of the user's requests, or null (someone else's request is "not found"). */
    getOwn,

    /** GET /api/requests/:id: the request, its status steps and its comments. */
    detail(id, userId) {
      const item = getOwn(id, userId);
      if (!item) return null;
      const entries = auditOf.all(id).map((e) => ({
        ...e,
        changes: JSON.parse(e.changes),
        note: e.note ? JSON.parse(e.note) : null,
      }));
      return { ...item, status_history: statusTimeline(entries), comments: comments.list(id) };
    },

    /**
     * POST /api/requests: a work order of type REQUEST_TYPE, unassigned, created by the user.
     * Same numbering, idempotent client_id and audit entry as POST /api/work-orders.
     */
    create(body, user, ctx) {
      const parsed = createSchema.safeParse(body ?? {});
      if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
      const { location_id: locationId = null, ...fields } = parsed.data;
      // The site alone needs the place in words (BR-R1).
      if (locationId === null && !(fields.location ?? '').trim()) {
        throw new HttpError(400, 'Invalid body', {
          fields: { location: 'Required: pick a room or say where the problem is' },
        });
      }
      const place = locations.forRequest({ site: fields.site, location_id: locationId });
      const { site: _site, ...rest } = fields;
      // Every request waits for a supervisor's review (D47).
      const { created, item } = workOrders.create({ ...rest, type: REQUEST_TYPE }, user, ctx, {
        reviewStatus: 'PENDING',
        place,
      });
      const own = getOwn(item.id, user.id);
      // A replayed client_id that belongs to someone else's work order (BR-W11).
      if (!own) throw new HttpError(409, 'This client_id is already used');
      return { created, item: own };
    },

    /**
     * POST /api/requests/:id/cancel (BR-R10, D79): the requester cancels their request until
     * work starts, whether or not it was reviewed. A reviewer's decision fields are kept. No
     * version is sent: staff never see it, and the maintenance team's later edits from an older
     * version become conflicts (BR-V3).
     * @returns {object | null} the request after the change; null if not found or not theirs
     */
    cancel(id, user, { now }) {
      const found = db
        .transaction(() => {
          const current = ownRow.get(id, user.id);
          if (!current) return false;
          const blocker = withdrawalBlocker(current);
          if (blocker) {
            throw new HttpError(blocker.status, blocker.message, { rule: blocker.rule });
          }
          const stamp = now.toISOString();
          withdraw.run({ id, user: user.id, now: stamp });
          recordAudit(db, {
            entityType: 'work_orders',
            entityId: id,
            action: 'UPDATE',
            changes: diffChanges(snapshotToApi('work_orders', current), {
              status: 'CANCELLED',
              review_status: 'WITHDRAWN',
            }),
            label: auditLabel('work_orders', current),
            userId: user.id,
            version: current.version + 1,
            at: stamp,
          });
          return true;
        })
        .immediate();
      return found ? getOwn(id, user.id) : null;
    },
  };
}
