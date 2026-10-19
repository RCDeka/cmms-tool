// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Compliance widgets of the dashboards (docs/spec-dashboards.md §6.3, Phase 23): preventive
// maintenance compliance, regulatory visits late, week schedule kept, contractor scorecard.
// Same shape as the widgets of services/dashboard-widgets.js (`where`, `figures`), plus
// `visits` for the widgets whose records are plan visits (their CSV lists the visits, skipped
// ones included; their drill-down lists the work orders of those visits).
import { addDays, dateInZone } from '../lib/dates.js';
import { addInFilter } from '../lib/list-filter.js';
import { mondayOf, weekOfDate } from '../lib/iso-week.js';
import { CATEGORIES } from '../rules/enums.js';
import {
  OUTCOMES,
  complianceRate,
  deadlineWeek,
  outcomesBy,
  visitOutcome,
  weekSunday,
  weeksEndingBetween,
} from '../rules/kpi-compliance.js';
import { periodBuckets, periodStart } from '../rules/kpi-flow.js';
import { UNFINISHED, badSegment, combine, idsIn, scopeClause } from './widget-sql.js';

/** Visit fields sent with the Visits (CSV) export. */
export const toVisit = (v) => ({
  plan_code: v.plan_code,
  plan_title: v.plan_title,
  type: v.type,
  category: v.category,
  site: v.site,
  performed_by: v.performed_by,
  supplier: v.supplier,
  due_week: v.due_week,
  week: v.week,
  deadline_week: v.deadline_week,
  deadline_on: v.deadline_on,
  outcome: v.outcome,
  skip_reason: v.skip_reason,
  work_order_id: v.work_order_id,
  work_order_number: v.wo_number,
  work_order_status: v.wo_status,
  completed_on: v.completed_on,
});

/** "<outcome>" or "<outcome>:<group>" or ":<group>" → { outcome, group } (either may be null). */
function outcomeSegment(segment, groups) {
  if (!segment) return { outcome: null, group: null };
  const at = segment.indexOf(':');
  const outcome = (at < 0 ? segment : segment.slice(0, at)) || null;
  const group = at < 0 ? null : segment.slice(at + 1);
  if ((outcome && !OUTCOMES.includes(outcome)) || (group !== null && !groups.includes(group))) {
    throw badSegment();
  }
  if (!outcome && group === null) throw badSegment();
  return { outcome, group };
}

/** Work orders of a list of visits (those that have one). */
const workOrdersOf = (visits) =>
  idsIn(visits.filter((v) => v.work_order_id).map((v) => v.work_order_id));

const supplierOf = (v) => v.supplier ?? '';

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {Record<string, { where: Function, figures?: Function, visits?: Function }>}
 */
export function complianceWidgets(db) {
  /**
   * Released and skipped plan visits whose deadline week ended in the period (its Sunday
   * before today), with their outcome. Sites and trades filter the plans.
   */
  function dueVisits(ctx) {
    const where = ["o.status IN ('RELEASED', 'SKIPPED')"];
    const params = {};
    addInFilter(where, params, 'p.site', 'visit_site', ctx.sites);
    addInFilter(where, params, 'p.category', 'visit_category', ctx.categories);
    const from = periodStart(ctx.today, ctx.period);
    return db
      .prepare(
        `SELECT o.id, o.due_week, o.week, o.status, o.skip_reason, o.work_order_id,
           p.code AS plan_code, p.title AS plan_title, p.type, p.category, p.site,
           p.tolerance_weeks, p.performed_by, p.supplier,
           w.number AS wo_number, w.status AS wo_status, w.completed_on
         FROM plan_occurrences o
         JOIN maintenance_plans p ON p.id = o.plan_id
         LEFT JOIN work_orders w ON w.id = o.work_order_id
         WHERE ${where.join(' AND ')}`,
      )
      .all(params)
      .map((v) => {
        const week = deadlineWeek(v, v);
        return { ...v, deadline_week: week, deadline_on: weekSunday(week) };
      })
      .filter((v) => v.deadline_on >= from && v.deadline_on < ctx.today)
      .map((v) => ({ ...v, outcome: visitOutcome(v, v.deadline_on) }))
      .sort(
        (a, b) =>
          a.deadline_on.localeCompare(b.deadline_on) || a.plan_code.localeCompare(b.plan_code),
      );
  }

  const pmVisits = (ctx, segment) => {
    const visits = dueVisits(ctx);
    const { outcome, group } = outcomeSegment(segment, CATEGORIES);
    return visits.filter(
      (v) => (!outcome || v.outcome === outcome) && (group === null || v.category === group),
    );
  };

  const contractorVisits = (ctx, segment) => {
    const visits = dueVisits(ctx).filter((v) => v.performed_by === 'CONTRACTOR');
    const suppliers = [...new Set(visits.map(supplierOf))];
    const { outcome, group } = outcomeSegment(segment, suppliers);
    return visits.filter(
      (v) => (!outcome || v.outcome === outcome) && (group === null || supplierOf(v) === group),
    );
  };

  /** Work orders planned in a week that have work blocks in it (cancelled ones left out). */
  function scheduledIn(week, ctx) {
    const monday = mondayOf(week);
    const scope = scopeClause('w', ctx);
    const where = combine(
      {
        sql: `w.planned_week = @week AND w.status <> 'CANCELLED' AND EXISTS (
          SELECT 1 FROM allocations a WHERE a.work_order_id = w.id AND a.kind = 'WORK'
            AND a.day BETWEEN @monday AND @sunday)`,
        params: { week, monday, sunday: weekSunday(week) },
      },
      scope,
    );
    return db
      .prepare(`SELECT w.id, w.status, w.completed_on FROM work_orders w ${where.clause}`)
      .all(where.params);
  }

  /** Work hours of the week, and those booked once the week had started (break-ins). */
  function blocksOf(week, ctx) {
    const monday = mondayOf(week);
    const scope = scopeClause('w', ctx);
    const where = combine(
      {
        sql: "a.kind = 'WORK' AND a.day BETWEEN @monday AND @sunday",
        params: { monday, sunday: weekSunday(week) },
      },
      scope,
    );
    const blocks = db
      .prepare(
        `SELECT a.hours, a.created_at FROM allocations a JOIN work_orders w ON w.id = a.work_order_id
         ${where.clause}`,
      )
      .all(where.params);
    const late = blocks.filter((b) => dateInZone(ctx.timeZone, new Date(b.created_at)) >= monday);
    const sum = (list) => list.reduce((s, b) => s + b.hours, 0);
    return { hours: sum(blocks), breakIn: sum(late) };
  }

  /** Finished weeks of the period (their Sunday before today), grouped in the period's buckets. */
  function scheduleBuckets(ctx) {
    const { unit, buckets } = periodBuckets(ctx.today, ctx.period);
    const weeks = weeksEndingBetween(periodStart(ctx.today, ctx.period), addDays(ctx.today, -1));
    return {
      unit,
      buckets: buckets.map((b) => ({
        ...b,
        weeks: weeks.filter((w) => weekSunday(w) >= b.from && weekSunday(w) <= b.to),
      })),
    };
  }

  /** Done (D86) by the Sunday of its week. */
  const keptBy = (wo, week) =>
    ['COMPLETED', 'CLOSED'].includes(wo.status) && wo.completed_on <= weekSunday(week);

  return {
    // Segments: "<outcome>" or "<outcome>:<TRADE>" (outcome: on_time, late, skipped).
    pm_compliance: {
      visits: pmVisits,
      where: (ctx, segment) => workOrdersOf(pmVisits(ctx, segment)),
      figures: (ctx) => {
        const visits = dueVisits(ctx);
        const total = outcomesBy(visits, () => 'all').get('all') ?? {
          on_time: 0,
          late: 0,
          skipped: 0,
          rate: null,
        };
        const byTrade = outcomesBy(visits, (v) => v.category);
        const regulatory = outcomesBy(
          visits.filter((v) => v.type === 'REGULATORY'),
          () => 'all',
        ).get('all');
        return {
          period: ctx.period,
          ...total,
          items: CATEGORIES.filter((c) => byTrade.has(c)).map((category) => ({
            category,
            ...byTrade.get(category),
          })),
          regulatory: regulatory ?? { on_time: 0, late: 0, skipped: 0, rate: null },
        };
      },
    },

    // Regulatory visits past their due week whose work order is not finished, today.
    regulatory_late: {
      where: ({ today }) => ({
        sql: `${UNFINISHED} AND w.id IN (
          SELECT o.work_order_id FROM plan_occurrences o
          JOIN maintenance_plans p ON p.id = o.plan_id
          WHERE o.status = 'RELEASED' AND p.type = 'REGULATORY' AND o.due_week < @this_week)`,
        params: { this_week: weekOfDate(today) },
      }),
    },

    // Segments: "<kind>" or "<kind>:<bucket>" (kind: scheduled, kept, missed).
    schedule_compliance: {
      where: (ctx, segment) => {
        const { buckets } = scheduleBuckets(ctx);
        let kind = 'scheduled';
        let chosen = buckets;
        if (segment) {
          const at = segment.indexOf(':');
          kind = at < 0 ? segment : segment.slice(0, at);
          const key = at < 0 ? null : segment.slice(at + 1);
          if (!['scheduled', 'kept', 'missed'].includes(kind)) throw badSegment();
          if (key !== null) {
            chosen = buckets.filter((b) => b.key === key);
            if (!chosen.length) throw badSegment();
          }
        }
        const ids = new Set();
        for (const week of chosen.flatMap((b) => b.weeks)) {
          for (const wo of scheduledIn(week, ctx)) {
            const kept = keptBy(wo, week);
            if (kind === 'scheduled' || (kind === 'kept') === kept) ids.add(wo.id);
          }
        }
        return idsIn(ids);
      },
      figures: (ctx) => {
        const { unit, buckets } = scheduleBuckets(ctx);
        const series = buckets.map((b) => {
          let scheduled = 0;
          let kept = 0;
          let hours = 0;
          let breakIn = 0;
          for (const week of b.weeks) {
            const wos = scheduledIn(week, ctx);
            scheduled += wos.length;
            kept += wos.filter((wo) => keptBy(wo, week)).length;
            const blocks = blocksOf(week, ctx);
            hours += blocks.hours;
            breakIn += blocks.breakIn;
          }
          return {
            key: b.key,
            from: b.from,
            to: b.to,
            partial: b.partial,
            weeks: b.weeks.length,
            scheduled,
            kept,
            rate: scheduled ? kept / scheduled : null,
            hours,
            break_in_hours: breakIn,
            break_in: hours ? breakIn / hours : null,
          };
        });
        const scheduled = series.reduce((s, b) => s + b.scheduled, 0);
        const kept = series.reduce((s, b) => s + b.kept, 0);
        return {
          period: ctx.period,
          unit,
          buckets: series,
          scheduled,
          kept,
          rate: scheduled ? kept / scheduled : null,
        };
      },
    },

    // Segments: "<outcome>", "<outcome>:<contractor>" or ":<contractor>".
    contractor_scorecard: {
      visits: contractorVisits,
      where: (ctx, segment) => workOrdersOf(contractorVisits(ctx, segment)),
      figures: (ctx) => {
        const visits = contractorVisits(ctx);
        const bySupplier = outcomesBy(visits, supplierOf);
        const items = [...bySupplier]
          .map(([supplier, counts]) => ({
            supplier,
            visits: counts.on_time + counts.late + counts.skipped,
            ...counts,
          }))
          // The worst first: lowest share on time, then the most late visits.
          .sort(
            (a, b) =>
              (a.rate ?? 2) - (b.rate ?? 2) ||
              b.late - a.late ||
              a.supplier.localeCompare(b.supplier),
          );
        return {
          period: ctx.period,
          items,
          rate: complianceRate(
            items.reduce((s, i) => s + i.on_time, 0),
            items.reduce((s, i) => s + i.late, 0),
          ),
        };
      },
    },
  };
}
