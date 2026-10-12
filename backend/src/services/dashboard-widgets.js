// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Figures of the dashboard widgets and the records behind them (docs/spec-dashboards.md,
// BR-K4). Each work order widget is one WHERE clause: its figures count the rows it selects,
// and the CSV export lists the same rows, so both always agree.
import { addDays } from '../lib/dates.js';
import { HttpError } from '../lib/http-error.js';
import { addInFilter } from '../lib/list-filter.js';
import { ROWS_LIMIT, filtersFor, widgetDef } from '../rules/dashboards.js';
import { CATEGORIES, WORK_ORDER_STATUSES } from '../rules/enums.js';
import { compareMyWork, monthRange, weekEnd } from '../rules/kpi.js';

const UNFINISHED = "w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')";
const RECENT_ACTIVITY_SIZE = 5;

/** First day of a period of `days` days ending today (today included). */
const periodStart = (today, days) => addDays(today, -(days - 1));

/**
 * WHERE clause of each work order widget (before the site and trade filters). Constant SQL;
 * values are bound parameters.
 * @type {Record<string, (ctx: { today: string, period: number | null, userId: number }) =>
 *   { sql: string, params?: object }>}
 */
const WORK_ORDER_WIDGETS = {
  open_work_orders: () => ({ sql: "w.status = 'OPEN'" }),
  in_progress_work_orders: () => ({ sql: "w.status = 'IN_PROGRESS'" }),
  closed_this_month: ({ today }) => {
    const { from, to } = monthRange(today);
    return {
      sql: "w.status = 'CLOSED' AND w.closed_on BETWEEN @month_from AND @month_to",
      params: { month_from: from, month_to: to },
    };
  },
  overdue_work_orders: ({ today }) => ({
    sql: `${UNFINISHED} AND w.due_on < @today`,
    params: { today },
  }),
  requests_to_review: () => ({ sql: "w.review_status = 'PENDING'" }),
  by_category: ({ today, period }) => ({
    sql: 'w.created_on BETWEEN @period_from AND @today',
    params: { period_from: periodStart(today, period), today },
  }),
  by_status: ({ today, period }) => ({
    sql: 'w.created_on BETWEEN @period_from AND @today',
    params: { period_from: periodStart(today, period), today },
  }),
  // My work: the next 7 days, late or without a due date (docs/data-model.md → KPI definitions).
  my_work: ({ today, userId }) => ({
    sql: `w.assignee_id = @me AND ${UNFINISHED} AND (w.due_on IS NULL OR w.due_on <= @week_end)`,
    params: { me: userId, week_end: weekEnd(today) },
  }),
  recent_activity: () => ({ sql: '1' }),
};

/** Segments accepted by the rows endpoint, and their extra condition. */
const SEGMENTS = {
  category: {
    values: [...CATEGORIES, 'UNSPECIFIED'],
    clause: (segment) =>
      segment === 'UNSPECIFIED'
        ? { sql: 'w.category IS NULL' }
        : { sql: 'w.category = @segment', params: { segment } },
  },
  status: {
    values: WORK_ORDER_STATUSES,
    clause: (segment) => ({ sql: 'w.status = @segment', params: { segment } }),
  },
  my_work: {
    values: ['today', 'week'],
    clause: (segment, { today }) =>
      segment === 'today'
        ? { sql: '(w.due_on IS NULL OR w.due_on <= @today)', params: { today } }
        : { sql: '1' },
  },
};

/** Site and trade filters of a widget on a table alias (`w` work orders, `a` assets). */
function scopeClause(alias, { sites, categories }) {
  const where = [];
  const params = {};
  addInFilter(where, params, `${alias}.site`, 'scope_site', sites);
  addInFilter(where, params, `${alias}.category`, 'scope_category', categories);
  return { where, params };
}

/** Joins clause parts into one WHERE clause. */
function combine(...parts) {
  const where = parts.flatMap((p) => p.where ?? (p.sql ? [p.sql] : []));
  const params = Object.assign({}, ...parts.map((p) => p.params ?? {}));
  return { clause: `WHERE ${where.map((w) => `(${w})`).join(' AND ')}`, params };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ workOrders: ReturnType<import('./work-orders.js').createWorkOrderService>,
 *   assets: ReturnType<import('./assets.js').createAssetService> }} deps
 */
export function createDashboardWidgetService(db, { workOrders, assets }) {
  const pendingConflicts = db
    .prepare("SELECT count(*) FROM conflicts WHERE status = 'OPEN'")
    .pluck();

  /** WHERE clause of a work order widget with its filters (and a segment, for the rows). */
  function workOrderWhere(key, ctx, segment) {
    const base = WORK_ORDER_WIDGETS[key](ctx);
    const scope = scopeClause('w', ctx);
    const def = widgetDef(key);
    const extra = segment ? SEGMENTS[def.segments].clause(segment, ctx) : {};
    return combine(base, scope, extra);
  }

  const count = (table, alias, { clause, params }) =>
    db.prepare(`SELECT count(*) FROM ${table} ${alias} ${clause}`).pluck().get(params);
  const groupCount = (expression, { clause, params }) =>
    new Map(
      db
        .prepare(
          `SELECT ${expression} AS value, count(*) AS count FROM work_orders w ${clause}
           GROUP BY value`,
        )
        .all(params)
        .map((r) => [r.value, r.count]),
    );
  const assetsWhere = (ctx) => combine({ sql: "a.status = 'BROKEN_DOWN'" }, scopeClause('a', ctx));

  /** Figures of one widget. */
  function compute(key, ctx) {
    switch (key) {
      case 'assets_broken_down':
        return { value: count('assets', 'a', assetsWhere(ctx)) };
      case 'pending_conflicts':
        return { value: pendingConflicts.get() };
      case 'by_category': {
        const counts = groupCount("coalesce(w.category, 'UNSPECIFIED')", workOrderWhere(key, ctx));
        const items = CATEGORIES.map((category) => ({
          category,
          count: counts.get(category) ?? 0,
        }));
        if (counts.get('UNSPECIFIED')) {
          items.push({ category: 'UNSPECIFIED', count: counts.get('UNSPECIFIED') });
        }
        return { period: ctx.period, items };
      }
      case 'by_status': {
        const counts = groupCount('w.status', workOrderWhere(key, ctx));
        return {
          period: ctx.period,
          items: WORK_ORDER_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 })),
        };
      }
      case 'my_work': {
        const week = rows(key, ctx).items;
        return {
          today: ctx.today,
          week_end: weekEnd(ctx.today),
          today_items: week.filter((wo) => !wo.due_on || wo.due_on <= ctx.today),
          week_items: week,
        };
      }
      case 'recent_activity':
        return { items: rows(key, ctx).items };
      default:
        return { value: count('work_orders', 'w', workOrderWhere(key, ctx)) };
    }
  }

  /** Records behind a widget (or one segment of it), at most ROWS_LIMIT. */
  function rows(key, ctx, segment) {
    const def = widgetDef(key);
    if (def.rows === 'assets') {
      const where = assetsWhere(ctx);
      const total = count('assets', 'a', where);
      const items = assets.selectWhere(where.clause, where.params, ROWS_LIMIT);
      return { kind: 'assets', items, total, truncated: total > items.length };
    }
    const where = workOrderWhere(key, ctx, segment);
    if (key === 'recent_activity') {
      const items = workOrders.selectWhere(where.clause, where.params, {
        orderBy: 'w.updated_at DESC, w.id DESC',
        limit: RECENT_ACTIVITY_SIZE,
      });
      return { kind: 'work_orders', items, total: items.length, truncated: false };
    }
    const total = count('work_orders', 'w', where);
    const items = workOrders.selectWhere(where.clause, where.params, {
      orderBy: 'w.number',
      limit: ROWS_LIMIT,
    });
    if (key === 'my_work') items.sort(compareMyWork);
    return { kind: 'work_orders', items, total, truncated: total > items.length };
  }

  /** Context of a widget: today, the user, and only the filters the widget uses. */
  const contextFor = (key, filters, { today, userId }) => ({
    ...filtersFor(key, filters),
    today,
    userId,
  });

  return {
    /**
     * GET /api/dashboard/widgets: figures of the listed widgets, in one read transaction.
     * @param {string[]} keys
     * @param {{ period: number, sites: string[], categories: string[] }} filters
     * @param {{ today: string, userId: number }} context
     */
    figures(keys, filters, context) {
      return db.transaction(() =>
        Object.fromEntries(
          keys.map((key) => [key, compute(key, contextFor(key, filters, context))]),
        ),
      )();
    },

    /** GET /api/dashboard/widgets/:key/rows (CSV export). */
    rows(key, segment, filters, context) {
      const def = widgetDef(key);
      if (!def.rows) throw new HttpError(404, 'This widget has no records to export');
      if (segment !== undefined) {
        if (!def.segments || !SEGMENTS[def.segments].values.includes(segment)) {
          throw new HttpError(400, 'Invalid query', { fields: { segment: 'Unknown segment' } });
        }
      }
      return rows(key, contextFor(key, filters, context), segment);
    },
  };
}
