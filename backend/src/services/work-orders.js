import { z } from 'zod';
import { addDays, dateInZone } from '../lib/dates.js';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors } from '../middleware/validate.js';
import { WORK_ORDER_FIELDS, WRITE_META } from '../rules/fields.js';
import { forbiddenCreationFields } from '../rules/permissions.js';
import { creationDate, nextWorkOrderNumber } from '../rules/work-order-creation.js';
import { toFtsQuery } from '../rules/search.js';
import { applyWorkOrderRules } from '../rules/work-order-status.js';
import { orderByClause, pageOffset, pageResponse, rankExpression } from '../lib/pagination.js';
import {
  CATEGORIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from '../rules/enums.js';
import { toBool, userRef, userRefColumns } from './mappers.js';
import { auditLabel, creationChanges } from '../rules/audit.js';
import { recordAudit } from './audit.js';
import { parseUpdate, resolveConflict, versionedUpdate } from './writes.js';

/** POST /api/work-orders body (BR-W9). Status, number, dates and authorship are set by the server. */
const createSchema = z.strictObject({
  client_id: z.uuid(),
  title: WORK_ORDER_FIELDS.title,
  type: WORK_ORDER_FIELDS.type,
  priority: WORK_ORDER_FIELDS.priority.optional(),
  description: WORK_ORDER_FIELDS.description.optional(),
  asset_id: WORK_ORDER_FIELDS.asset_id.optional(),
  site: WORK_ORDER_FIELDS.site.optional(),
  category: WORK_ORDER_FIELDS.category.optional(),
  assignee_id: WORK_ORDER_FIELDS.assignee_id.optional(),
  supervisor_id: WORK_ORDER_FIELDS.supervisor_id.optional(),
  due_on: WORK_ORDER_FIELDS.due_on.optional(),
  estimated_hours: WORK_ORDER_FIELDS.estimated_hours.optional(),
  edited_at: WRITE_META.edited_at,
});

const ruleError = ({ rule, message }) => new HttpError(422, message, { rule });

const FIELDS = [
  'id',
  'number',
  'type',
  'status',
  'priority',
  'title',
  'description',
  'asset_id',
  'site',
  'category',
  'assignee_id',
  'supervisor_id',
  'created_on',
  'due_on',
  'started_on',
  'closed_on',
  'estimated_hours',
  'actual_hours',
  'work_report',
  'client_id',
  'version',
  'has_conflict',
  'created_at',
  'updated_at',
];

const SELECT = `SELECT ${FIELDS.map((f) => `w.${f}`).join(', ')},
    a.id AS a__id, a.code AS a__code, a.name AS a__name, a.site AS a__site, a.status AS a__status,
    ${userRefColumns('asg')}, ${userRefColumns('sup')}, ${userRefColumns('cb')}, ${userRefColumns('ub')}
  FROM work_orders w
  LEFT JOIN assets a ON a.id = w.asset_id
  LEFT JOIN users asg ON asg.id = w.assignee_id
  LEFT JOIN users sup ON sup.id = w.supervisor_id
  LEFT JOIN users cb ON cb.id = w.created_by
  LEFT JOIN users ub ON ub.id = w.updated_by`;

/** Whitelisted sort keys (docs/api-design.md → GET /api/work-orders). */
export const WORK_ORDER_SORTS = {
  number: 'w.number',
  created_on: 'w.created_on',
  due_on: 'w.due_on',
  priority: rankExpression('w.priority', WORK_ORDER_PRIORITIES),
  status: rankExpression('w.status', WORK_ORDER_STATUSES),
  updated_at: 'w.updated_at',
};

/** Row → WorkOrder shape, with its asset summary and user references. */
export function toWorkOrder(row) {
  const wo = {};
  for (const f of FIELDS) wo[f] = row[f];
  wo.has_conflict = toBool(row.has_conflict);
  wo.asset =
    row.a__id === null
      ? null
      : {
          id: row.a__id,
          code: row.a__code,
          name: row.a__name,
          site: row.a__site,
          status: row.a__status,
        };
  wo.assignee = userRef(row, 'asg');
  wo.supervisor = userRef(row, 'sup');
  wo.created_by = userRef(row, 'cb');
  wo.updated_by = userRef(row, 'ub');
  return wo;
}

/**
 * WHERE clause of the work order filters (docs/api-design.md → GET /api/work-orders).
 * `mine` needs the current user id and `overdue` today's date ('YYYY-MM-DD').
 * @returns {{ clause: string, params: object }}
 */
export function workOrderFilters(
  { q, status, priority, type, category, site, assignee_id: assigneeId, mine, overdue },
  { userId, today },
) {
  const where = [];
  const params = {};
  if (q !== undefined) {
    const fts = toFtsQuery(q);
    if (fts === null) where.push('0');
    else {
      where.push('w.id IN (SELECT rowid FROM work_orders_fts WHERE work_orders_fts MATCH @fts)');
      params.fts = fts;
    }
  }
  if (status?.length) {
    where.push(`w.status IN (${status.map((_, i) => `@status${i}`).join(', ')})`);
    status.forEach((s, i) => (params[`status${i}`] = s));
  }
  for (const [key, value] of Object.entries({ priority, type, category, site })) {
    if (value !== undefined) {
      where.push(`w.${key} = @${key}`);
      params[key] = value;
    }
  }
  if (assigneeId !== undefined) {
    where.push('w.assignee_id = @assigneeId');
    params.assigneeId = assigneeId;
  }
  if (mine) {
    where.push('w.assignee_id = @me');
    params.me = userId;
  }
  if (overdue) {
    // Same definition as the dashboard KPI (docs/data-model.md → KPI definitions).
    where.push("w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD') AND w.due_on < @today");
    params.today = today;
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/** Counts per enum value, in enum order, zeros included. */
function countsFor(values, rows, key) {
  const byValue = new Map(rows.map((r) => [r.value, r.count]));
  return values.map((v) => ({ [key]: v, count: byValue.get(v) ?? 0 }));
}

/** @param {import('better-sqlite3').Database} db */
export function createWorkOrderService(db) {
  const byId = db.prepare(`${SELECT} WHERE w.id = ?`);
  const getById = (id) => {
    const row = byId.get(id);
    return row ? toWorkOrder(row) : null;
  };
  const recentStmt = db.prepare(`${SELECT} ORDER BY w.updated_at DESC, w.id DESC LIMIT ?`);
  const openAssigned = db.prepare(
    `${SELECT} WHERE w.assignee_id = ? AND w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')`,
  );
  const assetById = db.prepare('SELECT id, site, category FROM assets WHERE id = ?');
  const roleOf = db.prepare('SELECT role FROM users WHERE id = ?').pluck();
  const idByClientId = db.prepare('SELECT id FROM work_orders WHERE client_id = ?').pluck();
  const highestNumber = db
    .prepare("SELECT max(number) FROM work_orders WHERE number LIKE 'WO-' || ? || '-%'")
    .pluck();

  /**
   * BR-W2 (site follows the asset) and BR-W3 (eligible people) on the record as it will be.
   * @param {object} after record after the change
   * @param {object} sent fields sent by the client
   * @returns {object} fields to add to the change (the asset's site)
   */
  function checkReferences(after, sent) {
    const derived = {};
    if (after.asset_id !== null && after.asset_id !== undefined) {
      const asset = assetById.get(after.asset_id);
      if (!asset) throw ruleError({ rule: 'BR-W2', message: 'This asset does not exist.' });
      if ('site' in sent && sent.site !== asset.site) {
        throw ruleError({ rule: 'BR-W2', message: "The site must be the asset's site." });
      }
      if (after.site !== asset.site) derived.site = asset.site;
    }
    if ('assignee_id' in sent && sent.assignee_id !== null) {
      if (!['TECHNICIAN', 'SUPERVISOR'].includes(roleOf.get(sent.assignee_id))) {
        throw ruleError({
          rule: 'BR-W3',
          message: 'This user cannot be assigned to a work order.',
        });
      }
    }
    if ('supervisor_id' in sent && sent.supervisor_id !== null) {
      if (!['SUPERVISOR', 'ADMIN'].includes(roleOf.get(sent.supervisor_id))) {
        throw ruleError({ rule: 'BR-W3', message: 'This user cannot supervise a work order.' });
      }
    }
    return derived;
  }

  /**
   * Business rules of a change on the current row: workflow (BR-W4 to BR-W8) and references
   * (BR-W2, BR-W3). Shared by updates and conflict resolutions. Returns the final changes.
   */
  function prepareChanges(current, changes, now, timeZone) {
    const workflow = applyWorkOrderRules(current, changes, dateInZone(timeZone, now));
    if (workflow.error) throw ruleError(workflow.error);
    const derived = checkReferences({ ...current, ...workflow.changes }, changes);
    return { ...workflow.changes, ...derived };
  }
  const groupBy = (expression) =>
    db.prepare(
      `SELECT ${expression} AS value, count(*) AS count FROM work_orders
       WHERE created_on BETWEEN @from AND @to GROUP BY value`,
    );
  const byCategory = groupBy(`coalesce(category, 'UNSPECIFIED')`);
  const byStatus = groupBy('status');
  const byType = groupBy('type');

  return {
    /** Paginated list, complete records (D7). */
    list({ page, size, sort, order, ...filters }, context = {}) {
      const { clause, params } = workOrderFilters(filters, context);
      const total = db.prepare(`SELECT count(*) FROM work_orders w ${clause}`).pluck().get(params);
      const rows = db
        .prepare(
          `${SELECT} ${clause} ${orderByClause(WORK_ORDER_SORTS, sort, order, 'w.id')} LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: size, offset: pageOffset(page, size) });
      return pageResponse({ total, page, size, items: rows.map(toWorkOrder) });
    },

    /** Work order with its asset, or null. */
    getById,

    /** The most recently updated work orders (dashboard → Recent activity). */
    recent(limit) {
      return recentStmt.all(limit).map(toWorkOrder);
    },

    /** Non-terminal work orders assigned to a user (dashboard → My work today). */
    openAssignedTo(userId) {
      return openAssigned.all(userId).map(toWorkOrder);
    },

    /**
     * PUT /api/work-orders/:id: permissions, BR-V1 to BR-V4, BR-W2 to BR-W8.
     * @returns {{ status: 'applied' | 'conflict' | 'locked', conflictId?: number, item: object }}
     */
    update(id, body, user, { now, timeZone }) {
      const { changes, version, editedAt } = parseUpdate('work_orders', body, user);
      const result = versionedUpdate(db, {
        entity: 'work_orders',
        id,
        changes,
        version,
        editedAt,
        user,
        now: now.toISOString(),
        prepare: (current) => prepareChanges(current, changes, now, timeZone),
      });
      return { ...result, item: getById(id), changes, version };
    },

    /** PUT /api/work-orders/:id/resolve-conflict (BR-V5); the chosen values follow BR-W2 to BR-W8. */
    resolveConflict(id, body, user, { now, timeZone }) {
      resolveConflict(db, {
        entity: 'work_orders',
        id,
        body,
        user,
        now: now.toISOString(),
        prepare: (current, changes) => prepareChanges(current, changes, now, timeZone),
      });
      return getById(id);
    },

    /**
     * POST /api/work-orders (BR-W9 to BR-W13). Replaying a client_id returns the existing
     * work order instead of creating a second one (BR-W11, D26).
     * @returns {{ created: boolean, item: object }}
     */
    create(body, user, { now, timeZone }) {
      const parsed = createSchema.safeParse(body ?? {});
      if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
      const input = parsed.data;
      if ((input.asset_id === undefined || input.asset_id === null) && !input.site) {
        const message = 'An asset or a site is required';
        throw new HttpError(400, 'Invalid body', { fields: { asset_id: message, site: message } });
      }
      const notAllowed = forbiddenCreationFields(user, input);
      if (notAllowed.length) {
        throw new HttpError(403, 'Technicians can only assign new work orders to themselves', {
          fields: notAllowed,
        });
      }

      const id = db
        .transaction(() => {
          const existing = idByClientId.get(input.client_id);
          if (existing) return { id: existing, created: false };

          const when = creationDate(input.edited_at, now, timeZone);
          if (when.error) throw ruleError(when.error);
          const { edited_at: _editedAt, ...fields } = input;
          const row = {
            priority: 'NORMAL',
            description: null,
            asset_id: null,
            site: null,
            category: null,
            assignee_id: user.role === 'TECHNICIAN' ? user.id : null,
            supervisor_id: null,
            due_on: null,
            estimated_hours: null,
            ...fields,
            status: 'OPEN',
            created_on: when.date,
            created_by: user.id,
            updated_by: user.id,
          };
          if (user.role === 'TECHNICIAN') row.assignee_id = user.id;
          Object.assign(row, checkReferences(row, fields));
          if (row.asset_id !== null && !('category' in fields)) {
            row.category = assetById.get(row.asset_id).category;
          }
          if (row.due_on && row.due_on < row.created_on) {
            throw ruleError({
              rule: 'BR-W8',
              message: 'The due date cannot be earlier than the creation date.',
            });
          }

          const year = row.created_on.slice(0, 4);
          row.number = nextWorkOrderNumber(year, highestNumber.get(year));
          const stamp = now.toISOString();
          const newId = db
            .prepare(
              `INSERT INTO work_orders
                (number, client_id, type, status, priority, title, description, asset_id, site,
                 category, assignee_id, supervisor_id, created_on, due_on, estimated_hours,
                 created_by, updated_by, created_at, updated_at)
               VALUES (@number, @client_id, @type, @status, @priority, @title, @description,
                 @asset_id, @site, @category, @assignee_id, @supervisor_id, @created_on, @due_on,
                 @estimated_hours, @created_by, @updated_by, @stamp, @stamp)`,
            )
            .run({ ...row, stamp }).lastInsertRowid;
          const { created_by: _createdBy, updated_by: _updatedBy, ...logged } = row;
          recordAudit(db, {
            entityType: 'work_orders',
            entityId: Number(newId),
            action: 'CREATE',
            changes: creationChanges(logged),
            label: auditLabel('work_orders', row),
            userId: user.id,
            version: 1,
            at: stamp,
          });
          return { id: Number(newId), created: true };
        })
        .immediate();
      return { created: id.created, item: getById(id.id) };
    },

    /**
     * Counts of work orders created in the last `period` days, today included
     * (docs/data-model.md → KPI definitions). Every enum value is listed, zeros included;
     * UNSPECIFIED appears only when some work orders have no category.
     * @param {number} period days
     * @param {string} today 'YYYY-MM-DD' in APP_TIMEZONE
     */
    stats(period, today) {
      const range = { from: addDays(today, -(period - 1)), to: today };
      const categories = byCategory.all(range);
      const unspecified = categories.find((r) => r.value === 'UNSPECIFIED');
      return {
        period,
        by_category: [
          ...countsFor(CATEGORIES, categories, 'category'),
          ...(unspecified ? [{ category: 'UNSPECIFIED', count: unspecified.count }] : []),
        ],
        by_status: countsFor(WORK_ORDER_STATUSES, byStatus.all(range), 'status'),
        by_type: countsFor(WORK_ORDER_TYPES, byType.all(range), 'type'),
      };
    },
  };
}
