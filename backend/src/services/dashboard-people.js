// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Responsiveness, asset and people widgets of the dashboards (docs/spec-dashboards.md §6.4,
// Phase 24): response times, staff request service, bad actors, repeat failures, critical
// downtime, workload, estimate accuracy. Same shape as the other widget modules: `where`
// (work orders) or `assetWhere` (assets), `figures`, and `extra`: columns added to the
// exported rows, `_sort` ordering them (the slowest, the biggest overrun first).
import { addDays, dateInZone } from '../lib/dates.js';
import { mondayOf, weekOfDate } from '../lib/iso-week.js';
import { CATEGORIES, WORK_ORDER_PRIORITIES } from '../rules/enums.js';
import { periodBuckets, periodStart } from '../rules/kpi-flow.js';
import {
  breakdownSpells,
  downDays,
  durationStats,
  hoursBetween,
  median,
  repeatFailures,
} from '../rules/kpi-people.js';
import { UNFINISHED, badSegment, combine, idsIn, scopeClause } from './widget-sql.js';

const PRIORITIES_DOWN = [...WORK_ORDER_PRIORITIES].reverse();
const CRITICAL = ['HIGH', 'CRITICAL'];
const BAD_ACTORS_SHOWN = 10;

/** "<first>" or "<first>:<rest>". */
function split(segment) {
  const at = segment.indexOf(':');
  return at < 0 ? [segment, null] : [segment.slice(0, at), segment.slice(at + 1)];
}

const inPeriod = (date, ctx) =>
  date !== null && date >= periodStart(ctx.today, ctx.period) && date <= ctx.today;

/**
 * @param {import('better-sqlite3').Database} db
 */
export function peopleWidgets(db) {
  const dailyHours = db.prepare('SELECT daily_hours FROM planning_settings WHERE id = 1').pluck();

  /** Work orders of the scope with the instants of their first start and their closing. */
  function timedWorkOrders(ctx, extraSql = '1') {
    const where = combine({ sql: extraSql }, scopeClause('w', ctx));
    return db
      .prepare(
        `SELECT w.id, w.priority, w.status, w.created_at, w.created_on, w.review_status,
           w.reviewed_at,
           (SELECT min(l.at) FROM audit_log l WHERE l.entity_type = 'work_orders'
              AND l.entity_id = w.id AND json_extract(l.changes, '$.status.to') = 'IN_PROGRESS')
             AS started_at,
           (SELECT max(l.at) FROM audit_log l WHERE l.entity_type = 'work_orders'
              AND l.entity_id = w.id AND json_extract(l.changes, '$.status.to') = 'CLOSED')
             AS closed_at
         FROM work_orders w ${where.clause}`,
      )
      .all(where.params);
  }
  const dayOf = (instant, ctx) => (instant ? dateInZone(ctx.timeZone, new Date(instant)) : null);

  /** Response times: work orders started (or closed) in the period, with their hours. */
  function responses(ctx) {
    const rows = timedWorkOrders(ctx);
    const start = rows
      .filter((w) => w.started_at && inPeriod(dayOf(w.started_at, ctx), ctx))
      .map((w) => ({ ...w, hours: hoursBetween(w.created_at, w.started_at) }));
    const close = rows
      .filter((w) => w.status === 'CLOSED' && w.closed_at && inPeriod(dayOf(w.closed_at, ctx), ctx))
      .map((w) => ({ ...w, hours: hoursBetween(w.created_at, w.closed_at) }));
    return { start, close };
  }
  function responsesOf(ctx, segment) {
    const [kind, priority] = segment ? split(segment) : [null, null];
    if (kind && !['start', 'close'].includes(kind)) throw badSegment();
    if (priority !== null && !WORK_ORDER_PRIORITIES.includes(priority)) throw badSegment();
    const { start, close } = responses(ctx);
    const list = kind === 'start' ? start : kind === 'close' ? close : [...start, ...close];
    return list.filter((w) => priority === null || w.priority === priority);
  }

  /** Staff requests created in the period, with their review and closing times. */
  function requestsIn(ctx) {
    const where = combine(
      {
        sql: 'w.review_status IS NOT NULL AND w.created_on BETWEEN @req_from AND @req_to',
        params: { req_from: periodStart(ctx.today, ctx.period), req_to: ctx.today },
      },
      scopeClause('w', ctx),
    );
    return db
      .prepare(
        `SELECT w.id, w.created_at, w.created_on, w.review_status, w.reviewed_at, w.status,
           (SELECT max(l.at) FROM audit_log l WHERE l.entity_type = 'work_orders'
              AND l.entity_id = w.id AND json_extract(l.changes, '$.status.to') = 'CLOSED')
             AS closed_at
         FROM work_orders w ${where.clause}`,
      )
      .all(where.params)
      .map((r) => ({
        ...r,
        review_hours: r.reviewed_at ? hoursBetween(r.created_at, r.reviewed_at) : null,
        done_hours:
          r.status === 'CLOSED' && r.closed_at ? hoursBetween(r.created_at, r.closed_at) : null,
      }));
  }
  const requestSummary = (list) => {
    // A request withdrawn before its review was never reviewed (D79).
    const reviewed = list.filter((r) => r.reviewed_at !== null);
    const rejected = list.filter((r) => r.review_status === 'REJECTED').length;
    return {
      count: list.length,
      reviewed: reviewed.length,
      rejected,
      rejected_share: reviewed.length ? rejected / reviewed.length : null,
      review_median: median(list.filter((r) => r.review_hours !== null).map((r) => r.review_hours)),
      done_median: median(list.filter((r) => r.done_hours !== null).map((r) => r.done_hours)),
    };
  };

  /** Corrective work (not cancelled) on assets, any date, with the asset's criticality. */
  function correctiveOnAssets(ctx) {
    const where = combine(
      { sql: "w.type = 'CORRECTIVE' AND w.status <> 'CANCELLED' AND w.asset_id IS NOT NULL" },
      scopeClause('w', ctx),
    );
    return db
      .prepare(
        `SELECT w.id, w.number, w.asset_id, w.created_on, w.status, w.closed_on,
           a.code AS asset_code, a.name AS asset_name, a.site AS asset_site,
           a.criticality AS asset_criticality
         FROM work_orders w JOIN assets a ON a.id = w.asset_id ${where.clause}`,
      )
      .all(where.params);
  }
  const counted = (ctx) => (wo) => inPeriod(wo.created_on, ctx);

  function badActors(list) {
    const byAsset = new Map();
    for (const wo of list) {
      const entry = byAsset.get(wo.asset_id) ?? {
        asset: {
          id: wo.asset_id,
          code: wo.asset_code,
          name: wo.asset_name,
          site: wo.asset_site,
          criticality: wo.asset_criticality,
        },
        count: 0,
      };
      entry.count++;
      byAsset.set(wo.asset_id, entry);
    }
    const ranked = [...byAsset.values()].sort(
      (a, b) => b.count - a.count || a.asset.code.localeCompare(b.asset.code),
    );
    let running = 0;
    const items = ranked.slice(0, BAD_ACTORS_SHOWN).map((e) => {
      running += e.count;
      return { ...e, share: e.count / list.length, cumulative: running / list.length };
    });
    return { total: list.length, assets: byAsset.size, items };
  }

  /** Assets of the scope that are High or Critical, with their days broken down in the period. */
  function downtime(ctx) {
    const scope = scopeClause('a', ctx);
    const where = ["a.criticality IN ('HIGH', 'CRITICAL')", ...scope.where];
    const assets = db
      .prepare(`SELECT a.id, a.code, a.site, a.status FROM assets a WHERE ${where.join(' AND ')}`)
      .all(scope.params);
    const changes = db
      .prepare(
        `SELECT entity_id AS id, at, json_extract(changes, '$.status.to') AS status
         FROM audit_log WHERE entity_type = 'assets'
           AND json_extract(changes, '$.status.to') IS NOT NULL
         ORDER BY at, id`,
      )
      .all();
    const history = new Map();
    for (const c of changes) {
      if (!history.has(c.id)) history.set(c.id, []);
      history.get(c.id).push({ day: dayOf(c.at, ctx), to: c.status });
    }
    const from = periodStart(ctx.today, ctx.period);
    return assets.map((a) => {
      // Without history, the current status is all that is known: from the period start.
      const spells = history.has(a.id)
        ? breakdownSpells(history.get(a.id))
        : a.status === 'BROKEN_DOWN'
          ? [{ start: from, end: null }]
          : [];
      return { ...a, days: downDays(spells, from, ctx.today) };
    });
  }

  /** Booked hours and capacity of each person in the current week (week scheduler). */
  function weekLoad(today) {
    const week = weekOfDate(today);
    const monday = mondayOf(week);
    const sunday = addDays(monday, 6);
    const booked = new Map(
      db
        .prepare(
          `SELECT technician_id AS id, sum(hours) AS hours FROM allocations
           WHERE day BETWEEN ? AND ? GROUP BY technician_id`,
        )
        .all(monday, sunday)
        .map((r) => [r.id, r.hours]),
    );
    const overrides = db
      .prepare(
        'SELECT technician_id AS id, day, hours FROM capacity_overrides WHERE day BETWEEN ? AND ?',
      )
      .all(monday, sunday);
    const daily = dailyHours.get();
    const capacityOf = (id) => {
      let total = 0;
      for (let i = 0; i < 7; i++) {
        const day = addDays(monday, i);
        const override = overrides.find((o) => o.id === id && o.day === day);
        total += override ? override.hours : i < 5 ? daily : 0;
      }
      return total;
    };
    return { week, booked, capacityOf };
  }

  const HOURS_LEFT = `CASE WHEN w.estimated_hours IS NULL THEN 0 ELSE max(0, w.estimated_hours -
      coalesce((SELECT sum(a.hours) FROM allocations a WHERE a.work_order_id = w.id
        AND a.kind = 'WORK' AND a.day < @today), 0)) END`;

  return {
    // Segments: "start" or "close", optionally ":<PRIORITY>".
    response_times: {
      where: (ctx, segment) => idsIn(responsesOf(ctx, segment).map((w) => w.id)),
      extra: (ctx, segment) =>
        new Map(
          responsesOf(ctx, segment).map((w) => [
            w.id,
            { hours: Math.round(w.hours * 10) / 10, _sort: w.hours },
          ]),
        ),
      figures: (ctx) => {
        const { start, close } = responses(ctx);
        const stats = (list, priority) =>
          durationStats(list.filter((w) => w.priority === priority).map((w) => w.hours));
        return {
          period: ctx.period,
          rows: PRIORITIES_DOWN.map((priority) => ({
            priority,
            start: stats(start, priority),
            close: stats(close, priority),
          })),
          start: durationStats(start.map((w) => w.hours)),
          close: durationStats(close.map((w) => w.hours)),
        };
      },
    },

    // Segments: "rejected", "pending", "done".
    request_service: {
      where: (ctx, segment) => {
        if (segment && !['rejected', 'pending', 'done'].includes(segment)) throw badSegment();
        const list = requestsIn(ctx).filter(
          (r) =>
            !segment ||
            (segment === 'rejected' && r.review_status === 'REJECTED') ||
            (segment === 'pending' && r.review_status === 'PENDING') ||
            (segment === 'done' && r.done_hours !== null),
        );
        return idsIn(list.map((r) => r.id));
      },
      extra: (ctx) =>
        new Map(
          requestsIn(ctx).map((r) => [
            r.id,
            {
              hours_to_review:
                r.review_hours === null ? null : Math.round(r.review_hours * 10) / 10,
              hours_to_done: r.done_hours === null ? null : Math.round(r.done_hours * 10) / 10,
            },
          ]),
        ),
      figures: (ctx) => {
        const list = requestsIn(ctx);
        const { unit, buckets } = periodBuckets(ctx.today, ctx.period);
        return {
          period: ctx.period,
          unit,
          ...requestSummary(list),
          buckets: buckets.map((b) => ({
            ...b,
            ...requestSummary(list.filter((r) => r.created_on >= b.from && r.created_on <= b.to)),
          })),
        };
      },
    },

    // Segments: "critical" (High and Critical assets only), "asset:<id>".
    bad_actors: {
      where: (ctx, segment) => {
        let list = correctiveOnAssets(ctx).filter(counted(ctx));
        if (segment) {
          const [kind, id] = split(segment);
          if (kind === 'critical' && id === null) {
            list = list.filter((w) => CRITICAL.includes(w.asset_criticality));
          } else if (kind === 'asset' && /^[1-9]\d*$/.test(id ?? '')) {
            list = list.filter((w) => w.asset_id === Number(id));
          } else throw badSegment();
        }
        return idsIn(list.map((w) => w.id));
      },
      figures: (ctx) => {
        const list = correctiveOnAssets(ctx).filter(counted(ctx));
        return {
          period: ctx.period,
          all: badActors(list),
          critical: badActors(list.filter((w) => CRITICAL.includes(w.asset_criticality))),
        };
      },
    },

    repeat_failures: {
      where: (ctx) => idsIn(repeatFailures(correctiveOnAssets(ctx), counted(ctx)).map((w) => w.id)),
      extra: (ctx) =>
        new Map(
          repeatFailures(correctiveOnAssets(ctx), counted(ctx)).map((w) => [
            w.id,
            { previous: w.previous.number, days_since_previous: w.gap, _sort: -w.gap },
          ]),
        ),
      figures: (ctx) => {
        const all = correctiveOnAssets(ctx);
        const total = all.filter(counted(ctx)).length;
        const value = repeatFailures(all, counted(ctx)).length;
        return { value, total, share: total ? value / total : null };
      },
    },

    // Asset widget. Segments: "site:<name>".
    critical_downtime: {
      assetWhere: (ctx, segment) => {
        let list = downtime(ctx).filter((a) => a.days > 0 || a.status === 'BROKEN_DOWN');
        if (segment) {
          const [kind, site] = split(segment);
          if (kind !== 'site' || site === null || !list.some((a) => a.site === site))
            throw badSegment();
          list = list.filter((a) => a.site === site);
        }
        return {
          sql: 'a.id IN (SELECT value FROM json_each(@asset_ids))',
          params: { asset_ids: JSON.stringify(list.map((a) => a.id)) },
        };
      },
      extra: (ctx) =>
        new Map(downtime(ctx).map((a) => [a.id, { days_down: a.days, _sort: a.days }])),
      figures: (ctx) => {
        const assets = downtime(ctx);
        const bySite = new Map();
        for (const a of assets) {
          if (!a.days && a.status !== 'BROKEN_DOWN') continue;
          const entry = bySite.get(a.site) ?? { site: a.site, days: 0, assets: 0, down_today: 0 };
          entry.days += a.days;
          if (a.days) entry.assets++;
          if (a.status === 'BROKEN_DOWN') entry.down_today++;
          bySite.set(a.site, entry);
        }
        const items = [...bySite.values()].sort(
          (a, b) => b.days - a.days || a.site.localeCompare(b.site),
        );
        return {
          period: ctx.period,
          items,
          days: items.reduce((s, i) => s + i.days, 0),
          down_today: items.reduce((s, i) => s + i.down_today, 0),
          watched: assets.length,
        };
      },
    },

    // Segments: "person:<id>" or "UNASSIGNED", optionally ":<PRIORITY>".
    workload: {
      where: (ctx, segment) => {
        const parts = [{ sql: UNFINISHED }];
        if (segment) {
          const [who, rest] = split(segment);
          let priority;
          if (who === 'UNASSIGNED') {
            parts.push({ sql: 'w.assignee_id IS NULL' });
            priority = rest;
          } else if (who === 'person') {
            const [id, p] = split(rest ?? '');
            if (!/^[1-9]\d*$/.test(id)) throw badSegment();
            parts.push({ sql: 'w.assignee_id = @person', params: { person: Number(id) } });
            priority = p;
          } else throw badSegment();
          if (priority !== null) {
            if (!WORK_ORDER_PRIORITIES.includes(priority)) throw badSegment();
            parts.push({ sql: 'w.priority = @priority', params: { priority } });
          }
        }
        return combine(...parts);
      },
      figures: (ctx, whereOf) => {
        const where = whereOf();
        const rows = db
          .prepare(
            `SELECT w.assignee_id AS id, w.priority, count(*) AS count, sum(${HOURS_LEFT}) AS hours
             FROM work_orders w ${where.clause} GROUP BY w.assignee_id, w.priority`,
          )
          .all({ ...where.params, today: ctx.today });
        const people = db
          .prepare(
            `SELECT id, first_name, last_name, role, site FROM users
             WHERE role IN ('TECHNICIAN', 'SUPERVISOR') AND is_active = 1
             ORDER BY first_name, last_name`,
          )
          .all();
        const { week, booked, capacityOf } = weekLoad(ctx.today);
        const of = (id) => {
          const mine = rows.filter((r) => r.id === id);
          const counts = PRIORITIES_DOWN.map((p) => mine.find((r) => r.priority === p)?.count ?? 0);
          return {
            counts,
            total: counts.reduce((s, n) => s + n, 0),
            hours_left: mine.reduce((s, r) => s + r.hours, 0),
          };
        };
        const shown = people
          .map((p) => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            role: p.role,
            ...of(p.id),
            booked: booked.get(p.id) ?? 0,
            capacity: capacityOf(p.id),
            site: p.site,
          }))
          // With a site filter: the people of those sites, and anyone with work there.
          .filter((p) => !ctx.sites.length || ctx.sites.includes(p.site) || p.total > 0)
          .sort((a, b) => b.total - a.total || b.hours_left - a.hours_left)
          .map(({ site: _site, ...p }) => p);
        return {
          week,
          priorities: PRIORITIES_DOWN,
          people: shown,
          unassigned: of(null),
        };
      },
    },

    // Segments: a trade or "UNSPECIFIED".
    estimate_accuracy: {
      where: (ctx, segment) => {
        const parts = [
          {
            sql: `w.status = 'CLOSED' AND w.closed_on BETWEEN @acc_from AND @acc_to
              AND w.estimated_hours > 0 AND w.actual_hours > 0`,
            params: { acc_from: periodStart(ctx.today, ctx.period), acc_to: ctx.today },
          },
        ];
        if (segment === 'UNSPECIFIED') parts.push({ sql: 'w.category IS NULL' });
        else if (segment) {
          if (!CATEGORIES.includes(segment)) throw badSegment();
          parts.push({ sql: 'w.category = @acc_category', params: { acc_category: segment } });
        }
        return combine(...parts);
      },
      order: 'w.actual_hours / w.estimated_hours DESC, w.number',
      extra: (_ctx, _segment, items) =>
        new Map(
          items.map((w) => [
            w.id,
            { ratio: Math.round((w.actual_hours / w.estimated_hours) * 100) / 100 },
          ]),
        ),
      figures: (ctx, whereOf) => {
        const where = whereOf();
        const rows = db
          .prepare(
            `SELECT coalesce(w.category, 'UNSPECIFIED') AS category, count(*) AS count,
               sum(w.estimated_hours) AS estimated, sum(w.actual_hours) AS actual
             FROM work_orders w ${where.clause} GROUP BY category`,
          )
          .all(where.params);
        const items = rows
          .map((r) => ({ ...r, ratio: r.actual / r.estimated }))
          .sort((a, b) => b.ratio - a.ratio || a.category.localeCompare(b.category));
        const estimated = rows.reduce((s, r) => s + r.estimated, 0);
        const actual = rows.reduce((s, r) => s + r.actual, 0);
        return {
          period: ctx.period,
          items,
          count: rows.reduce((s, r) => s + r.count, 0),
          ratio: estimated ? actual / estimated : null,
        };
      },
    },
  };
}
