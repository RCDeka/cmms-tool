import { addDays } from '../lib/dates.js';
import { orderByClause, pageOffset, pageResponse, rankExpression } from '../lib/pagination.js';
import {
  CATEGORIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from '../rules/enums.js';
import { toBool, userRef, userRefColumns } from './mappers.js';

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

/** Counts per enum value, in enum order, zeros included. */
function countsFor(values, rows, key) {
  const byValue = new Map(rows.map((r) => [r.value, r.count]));
  return values.map((v) => ({ [key]: v, count: byValue.get(v) ?? 0 }));
}

/** @param {import('better-sqlite3').Database} db */
export function createWorkOrderService(db) {
  const count = db.prepare('SELECT count(*) FROM work_orders').pluck();
  const byId = db.prepare(`${SELECT} WHERE w.id = ?`);
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
    list({ page, size, sort, order }) {
      const rows = db
        .prepare(
          `${SELECT} ${orderByClause(WORK_ORDER_SORTS, sort, order, 'w.id')} LIMIT ? OFFSET ?`,
        )
        .all(size, pageOffset(page, size));
      return pageResponse({ total: count.get(), page, size, items: rows.map(toWorkOrder) });
    },

    /** Work order with its asset, or null. */
    getById(id) {
      const row = byId.get(id);
      return row ? toWorkOrder(row) : null;
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
