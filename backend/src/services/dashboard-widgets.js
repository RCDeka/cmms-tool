// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Figures of the dashboard widgets and the records behind them (docs/spec-dashboards.md,
// BR-K4). Each work order widget is one WHERE clause (`where`, with an optional segment: a
// bar, a slice, a cell): its figures count the rows it selects, and the CSV export and the
// drill-down list (`GET /api/work-orders?drill=`) select the same rows, so all three agree.
import { dateInZone } from '../lib/dates.js';
import { HttpError } from '../lib/http-error.js';
import { addInFilter } from '../lib/list-filter.js';
import { UNFINISHED, badSegment, combine, idsIn, scopeClause, splitSegment } from './widget-sql.js';
import { ROWS_LIMIT, filtersFor, widgetDef, withFilterDefaults } from '../rules/dashboards.js';
import { CATEGORIES, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES } from '../rules/enums.js';
import { compareMyWork, monthRange, weekEnd } from '../rules/kpi.js';
import {
  AGE_BUCKETS,
  OLD_AGE_BUCKETS,
  WORK_GROUPS,
  WORK_GROUP_SQL,
  ageDates,
  bucketOf,
  flowSeries,
  periodBuckets,
  periodStart,
  weeksOfWork,
  workGroup,
} from '../rules/kpi-flow.js';
import { weeklyCapacity } from '../rules/planning.js';
import { complianceWidgets, toVisit } from './dashboard-compliance.js';
import { peopleWidgets } from './dashboard-people.js';
import { AWAITING_REPLY } from './work-orders.js';

const RECENT_ACTIVITY_SIZE = 5;
/** Priorities from the most urgent, as rows of the backlog matrix. */
const PRIORITIES_DOWN = [...WORK_ORDER_PRIORITIES].reverse();

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ workOrders: ReturnType<import('./work-orders.js').createWorkOrderService>,
 *   assets: ReturnType<import('./assets.js').createAssetService> }} deps
 */
export function createDashboardWidgetService(db, { workOrders, assets }) {
  const pendingConflicts = db
    .prepare("SELECT count(*) FROM conflicts WHERE status = 'OPEN'")
    .pluck();
  // Date of the last change to CANCELLED of each cancelled work order (audit log, BR-L1).
  const cancellations = db.prepare(
    `SELECT entity_id AS id, max(at) AS at FROM audit_log
     WHERE entity_type = 'work_orders' AND json_extract(changes, '$.status.to') = 'CANCELLED'
     GROUP BY entity_id`,
  );
  const dailyHours = db.prepare('SELECT daily_hours FROM planning_settings WHERE id = 1').pluck();

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

  /** Day each cancelled work order was cancelled, in APP_TIMEZONE; its last update otherwise. */
  function cancelledOn(rows, timeZone) {
    const dates = new Map(
      cancellations.all().map((r) => [r.id, dateInZone(timeZone, new Date(r.at))]),
    );
    for (const wo of rows) {
      if (wo.status === 'CANCELLED' && !dates.has(wo.id)) {
        dates.set(wo.id, dateInZone(timeZone, new Date(wo.updated_at)));
      }
    }
    return dates;
  }

  /** Opened vs closed: the work orders of the scope and their buckets. */
  function flow(ctx) {
    const scope = combine(
      { sql: 'w.created_on <= @today', params: { today: ctx.today } },
      scopeClause('w', ctx),
    );
    const rows = db
      .prepare(
        `SELECT w.id, w.created_on, w.status, w.closed_on, w.updated_at FROM work_orders w
         ${scope.clause}`,
      )
      .all(scope.params);
    const { unit, buckets } = periodBuckets(ctx.today, ctx.period);
    return { rows, unit, buckets, cancelled: cancelledOn(rows, ctx.timeZone) };
  }

  const periodRange = (ctx) => ({
    sql: 'w.created_on BETWEEN @period_from AND @today',
    params: { period_from: periodStart(ctx.today, ctx.period), today: ctx.today },
  });

  /** Hours left per unfinished work order: estimate minus WORK blocks before today. */
  const HOURS_LEFT = `max(0, w.estimated_hours - coalesce((SELECT sum(a.hours) FROM allocations a
      WHERE a.work_order_id = w.id AND a.kind = 'WORK' AND a.day < @today), 0))`;

  /**
   * The widgets. `where(ctx, segment)`: the rows of the widget (or of one segment), before
   * the site and trade filters. `figures(ctx)`: its data (a count of `where` by default).
   * `order`: order of the exported rows. Segments that do not exist → 400.
   */
  const WIDGETS = {
    open_work_orders: { where: () => ({ sql: "w.status = 'OPEN'" }) },
    in_progress_work_orders: { where: () => ({ sql: "w.status = 'IN_PROGRESS'" }) },
    closed_this_month: {
      where: ({ today }) => {
        const { from, to } = monthRange(today);
        return {
          sql: "w.status = 'CLOSED' AND w.closed_on BETWEEN @month_from AND @month_to",
          params: { month_from: from, month_to: to },
        };
      },
    },
    overdue_work_orders: {
      where: ({ today }) => ({ sql: `${UNFINISHED} AND w.due_on < @today`, params: { today } }),
    },
    requests_to_review: { where: () => ({ sql: "w.review_status = 'PENDING'" }) },
    requests_awaiting_reply: { where: () => ({ sql: AWAITING_REPLY }) },

    by_category: {
      where: (ctx, segment) => {
        if (!segment) return periodRange(ctx);
        if (segment === 'UNSPECIFIED')
          return combine(periodRange(ctx), { sql: 'w.category IS NULL' });
        if (!CATEGORIES.includes(segment)) throw badSegment();
        return combine(periodRange(ctx), { sql: 'w.category = @segment', params: { segment } });
      },
      figures: (ctx, where) => {
        const counts = groupCount("coalesce(w.category, 'UNSPECIFIED')", where());
        const items = CATEGORIES.map((category) => ({
          category,
          count: counts.get(category) ?? 0,
        }));
        if (counts.get('UNSPECIFIED')) {
          items.push({ category: 'UNSPECIFIED', count: counts.get('UNSPECIFIED') });
        }
        return { period: ctx.period, items };
      },
    },
    by_status: {
      where: (ctx, segment) => {
        if (!segment) return periodRange(ctx);
        if (!WORK_ORDER_STATUSES.includes(segment)) throw badSegment();
        return combine(periodRange(ctx), { sql: 'w.status = @segment', params: { segment } });
      },
      figures: (ctx, where) => {
        const counts = groupCount('w.status', where());
        return {
          period: ctx.period,
          items: WORK_ORDER_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 })),
        };
      },
    },
    // My work: the next 7 days, late or without a due date (docs/data-model.md → KPI definitions).
    my_work: {
      where: ({ today, userId }, segment) => {
        if (segment && !['today', 'week'].includes(segment)) throw badSegment();
        return {
          sql: `w.assignee_id = @me AND ${UNFINISHED} AND (w.due_on IS NULL OR w.due_on <= @last_day)`,
          params: { me: userId, last_day: segment === 'today' ? today : weekEnd(today) },
        };
      },
      figures: (ctx) => {
        const week = rows('my_work', ctx).items;
        return {
          today: ctx.today,
          week_end: weekEnd(ctx.today),
          today_items: week.filter((wo) => !wo.due_on || wo.due_on <= ctx.today),
          week_items: week,
        };
      },
    },
    recent_activity: {
      where: () => ({ sql: '1' }),
      order: 'w.updated_at DESC, w.id DESC',
      limit: RECENT_ACTIVITY_SIZE,
      figures: (ctx) => ({ items: rows('recent_activity', ctx).items }),
    },

    // --- Flow and backlog (§6.2, Phase 22) ---------------------------------------------------

    // Segments: "opened:<bucket>", "closed:<bucket>", "cancelled:<bucket>" (a week or a month).
    opened_vs_closed: {
      where: (ctx, segment) => {
        const data = flow(ctx);
        const keys = data.buckets.map((b) => b.key);
        const [kind, key] = segment
          ? splitSegment(segment, ['opened', 'closed', 'cancelled'], keys)
          : [null, null];
        const chosen = key ? data.buckets.filter((b) => b.key === key) : data.buckets;
        const from = chosen[0].from;
        const to = chosen.at(-1).to;
        const inRange = (date) => date !== null && date >= from && date <= to;
        const ids = data.rows
          .filter(
            (wo) =>
              ((!kind || kind === 'opened') && inRange(wo.created_on)) ||
              ((!kind || kind === 'closed') && wo.status === 'CLOSED' && inRange(wo.closed_on)) ||
              ((!kind || kind === 'cancelled') &&
                wo.status === 'CANCELLED' &&
                inRange(data.cancelled.get(wo.id) ?? null)),
          )
          .map((wo) => wo.id);
        return idsIn(ids);
      },
      figures: (ctx) => {
        const data = flow(ctx);
        return {
          period: ctx.period,
          unit: data.unit,
          buckets: flowSeries(data.rows, data.cancelled, data.buckets),
        };
      },
    },

    // Segments: "<PRIORITY>", "<PRIORITY>:<age bucket>" or ":<age bucket>" (every priority).
    backlog_age: {
      where: ({ today }, segment) => {
        const parts = [{ sql: UNFINISHED }];
        if (segment) {
          const at = segment.indexOf(':');
          const priority = at < 0 ? segment : segment.slice(0, at);
          const bucket = at < 0 ? null : segment.slice(at + 1);
          if (
            (priority && !WORK_ORDER_PRIORITIES.includes(priority)) ||
            (bucket !== null && !AGE_BUCKETS.some((b) => b.key === bucket)) ||
            (!priority && bucket === null)
          ) {
            throw badSegment();
          }
          if (priority) parts.push({ sql: 'w.priority = @priority', params: { priority } });
          if (bucket) {
            const { from, to } = ageDates(bucket, today);
            parts.push(
              from
                ? {
                    sql: 'w.created_on BETWEEN @age_from AND @age_to',
                    params: { age_from: from, age_to: to },
                  }
                : { sql: 'w.created_on <= @age_to', params: { age_to: to } },
            );
          }
        }
        return combine(...parts);
      },
      figures: (ctx, where) => {
        const { clause, params } = where();
        const bounds = {};
        const cases = AGE_BUCKETS.map((b, i) => {
          const { from, to } = ageDates(b.key, ctx.today);
          bounds[`age${i}_from`] = from;
          bounds[`age${i}_to`] = to;
          bounds[`age${i}_key`] = b.key;
          return from
            ? `WHEN w.created_on BETWEEN @age${i}_from AND @age${i}_to THEN @age${i}_key`
            : `WHEN w.created_on <= @age${i}_to THEN @age${i}_key`;
        }).join(' ');
        const found = db
          .prepare(
            `SELECT w.priority, CASE ${cases} END AS bucket, count(*) AS count
             FROM work_orders w ${clause} GROUP BY w.priority, bucket`,
          )
          .all({
            ...params,
            ...Object.fromEntries(Object.entries(bounds).filter(([, v]) => v !== null)),
          });
        const at = (priority, bucket) =>
          found.find((r) => r.priority === priority && r.bucket === bucket)?.count ?? 0;
        const rowsOut = PRIORITIES_DOWN.map((priority) => ({
          priority,
          counts: AGE_BUCKETS.map((b) => at(priority, b.key)),
        }));
        const old = rowsOut
          .filter((r) => ['URGENT', 'HIGH'].includes(r.priority))
          .reduce(
            (sum, r) =>
              sum +
              OLD_AGE_BUCKETS.reduce(
                (s, b) => s + r.counts[AGE_BUCKETS.findIndex((x) => x.key === b)],
                0,
              ),
            0,
          );
        return {
          buckets: AGE_BUCKETS.map((b) => b.key),
          rows: rowsOut,
          total: found.reduce((sum, r) => sum + r.count, 0),
          urgent_old: old,
        };
      },
    },

    // Segments: a trade, "UNSPECIFIED" (no trade) or "NO_ESTIMATE" (not counted in hours).
    backlog_weeks: {
      where: (ctx, segment) => {
        if (!segment) return { sql: UNFINISHED };
        if (segment === 'NO_ESTIMATE')
          return { sql: `${UNFINISHED} AND w.estimated_hours IS NULL` };
        const withHours = `${UNFINISHED} AND w.estimated_hours IS NOT NULL`;
        if (segment === 'UNSPECIFIED') return { sql: `${withHours} AND w.category IS NULL` };
        if (!CATEGORIES.includes(segment)) throw badSegment();
        return { sql: `${withHours} AND w.category = @segment`, params: { segment } };
      },
      figures: (ctx, whereOf) => {
        const where = whereOf();
        const hours = db
          .prepare(
            `SELECT coalesce(w.category, 'UNSPECIFIED') AS category, count(*) AS work_orders,
               sum(${HOURS_LEFT}) AS hours
             FROM work_orders w ${where.clause} AND w.estimated_hours IS NOT NULL
             GROUP BY category`,
          )
          .all({ ...where.params, today: ctx.today });
        const withoutEstimate = db
          .prepare(
            `SELECT count(*) FROM work_orders w ${where.clause} AND w.estimated_hours IS NULL`,
          )
          .pluck()
          .get(where.params);
        // The planner's capacity before the corrective reserve (the backlog holds all work).
        const people = [];
        const scope = {
          where: ["role IN ('TECHNICIAN', 'SUPERVISOR')", 'is_active = 1'],
          params: {},
        };
        addInFilter(scope.where, scope.params, 'site', 'site', ctx.sites);
        people.push(
          ...db
            .prepare(`SELECT specialty, site FROM users WHERE ${scope.where.join(' AND ')}`)
            .all(scope.params),
        );
        const capacity = weeklyCapacity(people, {
          daily_hours: dailyHours.get(),
          reserve_percent: 0,
        });
        const byCategory = new Map(hours.map((r) => [r.category, r]));
        const trades = ctx.categories.length ? ctx.categories : CATEGORIES;
        const items = trades
          .map((category) => {
            const row = byCategory.get(category);
            const cap = capacity.by_category[category] ?? 0;
            const left = row?.hours ?? 0;
            return {
              category,
              work_orders: row?.work_orders ?? 0,
              hours: left,
              capacity: cap,
              weeks: weeksOfWork(left, cap),
            };
          })
          .filter((i) => i.work_orders > 0 || i.capacity > 0)
          .sort((a, b) => (b.weeks ?? Infinity) - (a.weeks ?? Infinity) || b.hours - a.hours);
        const unspecified = byCategory.get('UNSPECIFIED');
        return {
          items,
          unspecified: unspecified
            ? { work_orders: unspecified.work_orders, hours: unspecified.hours }
            : null,
          without_estimate: withoutEstimate,
        };
      },
    },

    // Segments: "<KIND>" or "<KIND>:<bucket>" (PLANNED, REACTIVE, REQUESTS, IMPROVEMENT).
    planned_vs_reactive: {
      where: (ctx, segment) => {
        const { buckets } = periodBuckets(ctx.today, ctx.period);
        const [kind, key] = segment
          ? splitSegment(
              segment,
              WORK_GROUPS,
              buckets.map((b) => b.key),
            )
          : [null, null];
        const chosen = key ? buckets.find((b) => b.key === key) : null;
        return combine(
          {
            sql: "w.status = 'CLOSED' AND w.closed_on BETWEEN @closed_from AND @closed_to",
            params: {
              closed_from: chosen?.from ?? periodStart(ctx.today, ctx.period),
              closed_to: chosen?.to ?? ctx.today,
            },
          },
          kind ? { sql: WORK_GROUP_SQL[kind] } : {},
        );
      },
      figures: (ctx, whereOf) => {
        const where = whereOf();
        const { unit, buckets } = periodBuckets(ctx.today, ctx.period);
        const closed = db
          .prepare(
            `SELECT w.type, w.review_status, w.closed_on, w.actual_hours FROM work_orders w
             ${where.clause}`,
          )
          .all(where.params);
        const empty = () => Object.fromEntries(WORK_GROUPS.map((g) => [g, { count: 0, hours: 0 }]));
        const series = buckets.map((b) => ({ ...b, values: empty() }));
        for (const wo of closed) {
          const key = bucketOf(buckets, wo.closed_on);
          const cell = series.find((b) => b.key === key).values[workGroup(wo)];
          cell.count++;
          cell.hours += wo.actual_hours ?? 0;
        }
        return {
          period: ctx.period,
          unit,
          groups: WORK_GROUPS,
          buckets: series,
          without_actual_hours: closed.filter((wo) => wo.actual_hours === null).length,
        };
      },
    },

    // --- Compliance (§6.3, Phase 23) ---------------------------------------------------------
    ...complianceWidgets(db),

    // --- Responsiveness, assets and people (§6.4, Phase 24) --------------------------------
    ...peopleWidgets(db),

    // Asset widgets: `assetWhere` on the alias `a`.
    assets_broken_down: { assetWhere: () => ({ sql: "a.status = 'BROKEN_DOWN'" }) },
  };

  /** WHERE clause of a work order widget with its site and trade filters (and a segment). */
  function workOrderWhere(key, ctx, segment) {
    // Widgets whose `where` takes no segment (the tiles) have none to choose.
    if (segment !== undefined && WIDGETS[key].where.length < 2) throw badSegment();
    return combine(WIDGETS[key].where(ctx, segment), scopeClause('w', ctx));
  }
  /** WHERE clause of an asset widget with its site and trade filters (and a segment). */
  function assetWhere(key, ctx, segment) {
    if (segment !== undefined && WIDGETS[key].assetWhere.length < 2) throw badSegment();
    return combine(WIDGETS[key].assetWhere(ctx, segment), scopeClause('a', ctx));
  }

  /**
   * Columns a widget adds to its exported rows (`dashboard`), and their order: `_sort`, the
   * largest first (the slowest, the longest down…), when the widget gives one.
   */
  function withExtra(key, ctx, segment, items) {
    const extra = WIDGETS[key].extra?.(ctx, segment, items);
    if (!extra) return items;
    const out = items.map((item) => {
      const { _sort, ...columns } = extra.get(item.id) ?? {};
      return { ...item, dashboard: columns, _sort };
    });
    if (out.some((i) => i._sort !== undefined))
      out.sort((a, b) => (b._sort ?? -Infinity) - (a._sort ?? -Infinity));
    return out.map(({ _sort, ...item }) => item);
  }

  /** Figures of one widget. */
  function compute(key, ctx) {
    if (key === 'pending_conflicts') return { value: pendingConflicts.get() };
    if (WIDGETS[key].assetWhere) {
      const where = () => assetWhere(key, ctx);
      const figures = WIDGETS[key].figures;
      return figures ? figures(ctx, where) : { value: count('assets', 'a', where()) };
    }
    // Built only when the widget needs it (opened vs closed computes its own rows).
    const where = () => workOrderWhere(key, ctx);
    const figures = WIDGETS[key].figures;
    return figures ? figures(ctx, where) : { value: count('work_orders', 'w', where()) };
  }

  /** Records behind a widget (or one segment of it), at most ROWS_LIMIT. */
  function rows(key, ctx, segment) {
    if (widgetDef(key).rows === 'visits') {
      const visits = WIDGETS[key].visits(ctx, segment);
      const items = visits.slice(0, ROWS_LIMIT).map(toVisit);
      return {
        kind: 'visits',
        items,
        total: visits.length,
        truncated: visits.length > items.length,
      };
    }
    if (widgetDef(key).rows === 'assets') {
      const where = assetWhere(key, ctx, segment);
      const total = count('assets', 'a', where);
      const items = assets.selectWhere(where.clause, where.params, ROWS_LIMIT);
      return {
        kind: 'assets',
        items: withExtra(key, ctx, segment, items),
        total,
        truncated: total > items.length,
      };
    }
    const def = WIDGETS[key];
    const where = workOrderWhere(key, ctx, segment);
    const limit = def.limit ?? ROWS_LIMIT;
    const total = Math.min(count('work_orders', 'w', where), limit);
    const items = workOrders.selectWhere(where.clause, where.params, {
      orderBy: def.order ?? 'w.number',
      limit,
    });
    if (key === 'my_work') items.sort(compareMyWork);
    return {
      kind: 'work_orders',
      items: withExtra(key, ctx, segment, items),
      total,
      truncated: total > items.length,
    };
  }

  /** Context of a widget: today, the user, the time zone, and only the filters it uses. */
  const contextFor = (key, filters, { today, userId, timeZone }) => ({
    ...filtersFor(key, filters),
    today,
    userId,
    timeZone,
  });

  return {
    /**
     * GET /api/dashboard/widgets: figures of the listed widgets, in one read transaction.
     * @param {string[]} keys
     * @param {{ period: number, sites: string[], categories: string[] }} filters
     * @param {{ today: string, userId: number, timeZone: string }} context
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
      if (!widgetDef(key).rows) throw new HttpError(404, 'This widget has no records to export');
      return rows(key, contextFor(key, filters, context), segment);
    },

    /**
     * `drill=<widget>[:<segment>]` of the work order list, or of the asset list for the asset
     * widgets (K9): the condition selecting the records of a widget segment, without the site
     * and trade filters, which the list applies with its own `site` and `category` filters.
     * @param {string} drill
     * @param {number} period days
     * @param {object} context
     * @param {'work_orders' | 'assets'} [entity]
     * @returns {{ sql: string, params: object }}
     */
    drillWhere(drill, period, context, entity = 'work_orders') {
      const at = drill.indexOf(':');
      const key = at < 0 ? drill : drill.slice(0, at);
      const segment = at < 0 ? undefined : drill.slice(at + 1);
      const def = widgetDef(key);
      const kinds = entity === 'assets' ? ['assets'] : ['work_orders', 'visits'];
      if (!def || !kinds.includes(def.rows) || def.key === 'recent_activity') {
        throw new HttpError(400, 'Invalid query', { fields: { drill: 'Unknown widget' } });
      }
      const ctx = contextFor(key, withFilterDefaults({ period }), context);
      const build = entity === 'assets' ? WIDGETS[key].assetWhere : WIDGETS[key].where;
      try {
        if (segment !== undefined && build.length < 2) throw badSegment();
        return combine(build(ctx, segment));
      } catch (err) {
        if (err instanceof HttpError) {
          throw new HttpError(400, 'Invalid query', { fields: { drill: 'Unknown segment' } });
        }
        throw err;
      }
    },
  };
}
