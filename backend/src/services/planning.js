// Year planner (D48): planning settings, the 52-week timeline with its figures, and the
// release of each visit's work order (docs/data-model.md → BR-P6, BR-Y1 to BR-Y4).
import { z } from 'zod';
import { addDays, dateInZone } from '../lib/dates.js';
import { HttpError } from '../lib/http-error.js';
import {
  addWeeks,
  formatWeek,
  mondayOf,
  weekOfDate,
  weekRange,
  weeksBetween,
  weeksInYear,
} from '../lib/iso-week.js';
import { addInFilter } from '../lib/list-filter.js';
import { fieldErrors } from '../middleware/validate.js';
import { auditLabel, diffChanges } from '../rules/audit.js';
import { CATEGORIES } from '../rules/enums.js';
import { PLANNING_SETTINGS_FIELDS, WRITE_META } from '../rules/fields.js';
import {
  GENERAL,
  occurrenceWarnings,
  planWarnings,
  planningTiles,
  releaseDueDate,
  weeklyCapacity,
  weeklyFigures,
} from '../rules/planning.js';
import { recordAudit } from './audit.js';
import { userRef, userRefColumns } from './mappers.js';
import { generateOccurrences, occurrenceLabel } from './occurrences.js';
import { planFilters } from './plans.js';

const settingsSchema = z.strictObject({
  ...Object.fromEntries(
    Object.entries(PLANNING_SETTINGS_FIELDS).map(([f, schema]) => [f, schema.optional()]),
  ),
  version: WRITE_META.version,
});

/**
 * How far the timeline may start from the current week. Occurrences are stored up to
 * HORIZON_WEEKS (104) ahead, so 52 weeks shown from one year ahead are all stored.
 */
const PAST_WEEKS = 104;
const FUTURE_WEEKS = 52;

/** Group keys of the timeline rows. */
export const GROUP_BY = ['site', 'building', 'category'];

/** Released work orders take the plan's title and the week, within the 200-character limit. */
const releaseTitle = (plan, week) => `${plan.title.slice(0, 186)} – ${week}`;

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ workOrders: ReturnType<import('./work-orders.js').createWorkOrderService> }} deps
 */
export function createPlanningService(db, { workOrders }) {
  const settingsStmt = db.prepare(
    `SELECT s.*, ${userRefColumns('ub')} FROM planning_settings s
     LEFT JOIN users ub ON ub.id = s.updated_by WHERE s.id = 1`,
  );
  const activePlans = db.prepare('SELECT * FROM maintenance_plans WHERE is_active = 1');

  /** People who count as capacity (P17): active technicians and supervisors. */
  function capacityPeople({ site, category } = {}) {
    const where = ["role IN ('TECHNICIAN', 'SUPERVISOR')", 'is_active = 1'];
    const params = {};
    addInFilter(where, params, 'site', 'site', site);
    addInFilter(where, params, 'specialty', 'category', category);
    return db.prepare(`SELECT specialty, site FROM users WHERE ${where.join(' AND ')}`).all(params);
  }

  function settings() {
    const row = settingsStmt.get();
    return {
      daily_hours: row.daily_hours,
      reserve_percent: row.reserve_percent,
      release_weeks_ahead: row.release_weeks_ahead,
      max_block_hours: row.max_block_hours,
      version: row.version,
      updated_by: userRef(row, 'ub'),
      updated_at: row.updated_at,
    };
  }

  /**
   * Creates the work order of one planned occurrence, in its own transaction (BR-P6). Does
   * nothing when the occurrence was released meanwhile, so a second run creates nothing.
   * @returns {number | null} id of the new work order
   */
  function releaseOne(occurrenceId, { today, stamp, userId }) {
    return db
      .transaction(() => {
        const occurrence = db
          .prepare("SELECT * FROM plan_occurrences WHERE id = ? AND status = 'PLANNED'")
          .get(occurrenceId);
        if (!occurrence) return null;
        const plan = db
          .prepare('SELECT * FROM maintenance_plans WHERE id = ?')
          .get(occurrence.plan_id);
        const author = userId ?? plan.created_by;
        const workOrderId = workOrders.insert(
          {
            type: plan.type,
            status: 'OPEN',
            priority: 'NORMAL',
            title: releaseTitle(plan, occurrence.week),
            description: plan.description,
            asset_id: plan.asset_id,
            site: plan.site,
            location: plan.location,
            category: plan.category,
            assignee_id: null,
            supervisor_id: null,
            created_on: today,
            due_on: releaseDueDate(addDays(mondayOf(occurrence.week), 4), today),
            estimated_hours: plan.estimated_hours,
            created_by: author,
            updated_by: author,
            review_status: null,
            plan_id: plan.id,
            planned_week: occurrence.week,
          },
          { userId: author, stamp },
        );
        const released = { status: 'RELEASED', work_order_id: workOrderId };
        db.prepare(
          'UPDATE plan_occurrences SET status = ?, work_order_id = ?, updated_at = ? WHERE id = ?',
        ).run(released.status, released.work_order_id, stamp, occurrence.id);
        recordAudit(db, {
          entityType: 'plan_occurrences',
          entityId: occurrence.id,
          action: 'UPDATE',
          changes: diffChanges(occurrence, released),
          label: occurrenceLabel(plan, occurrence.due_week),
          userId: author,
          at: stamp,
        });
        return workOrderId;
      })
      .immediate();
  }

  /** Settings with the number of people counted as capacity (preview of a change). */
  const settingsWithPeople = () => ({ ...settings(), capacity_people: capacityPeople().length });

  return {
    settings,
    settingsWithPeople,

    /**
     * PUT /api/planning/settings (administrators, P16), at the version they saw. Logged.
     * @returns {{ updated: boolean, item: object }}
     */
    updateSettings(body, user, { now }) {
      const parsed = settingsSchema.safeParse(body ?? {});
      if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
      const { version, ...changes } = parsed.data;
      if (!Object.keys(changes).length) throw new HttpError(400, 'No field to update');
      const stamp = now.toISOString();
      const updated = db
        .transaction(() => {
          const current = db.prepare('SELECT * FROM planning_settings WHERE id = 1').get();
          if (current.version !== version) {
            throw new HttpError(
              409,
              'The settings changed since you opened them. Reload and try again.',
              { rule: 'BR-V1' },
            );
          }
          const logged = diffChanges(current, changes);
          if (!Object.keys(logged).length) return false;
          // Column names come from PLANNING_SETTINGS_FIELDS, never from the request as is.
          db.prepare(
            `UPDATE planning_settings SET ${Object.keys(logged)
              .map((k) => `${k} = @${k}`)
              .join(', ')}, version = version + 1, updated_by = @__user, updated_at = @__now
             WHERE id = 1`,
          ).run({ ...changes, __user: user.id, __now: stamp });
          recordAudit(db, {
            entityType: 'planning_settings',
            entityId: 1,
            action: 'UPDATE',
            changes: logged,
            label: auditLabel('planning_settings', current),
            userId: user.id,
            version: current.version + 1,
            at: stamp,
          });
          return true;
        })
        .immediate();
      return { updated, item: settingsWithPeople() };
    },

    /**
     * BR-P6: releases every planned occurrence of an active plan whose week starts within
     * `release_weeks_ahead` weeks, and stores the plans' occurrences up to the horizon.
     * Idempotent. `user`: who asked for it; the daily job and the planner's own run leave it
     * out, and each work order is then created in the name of its plan's author.
     * @returns {{ released: number, work_order_ids: number[] }}
     */
    release({ now, timeZone, user = null }) {
      const today = dateInZone(timeZone, now);
      const currentWeek = weekOfDate(today);
      const stamp = now.toISOString();
      db.transaction(() => {
        for (const plan of activePlans.all()) generateOccurrences(db, plan, { currentWeek, stamp });
      }).immediate();

      const limit = addWeeks(currentWeek, settings().release_weeks_ahead);
      const due = db
        .prepare(
          `SELECT o.id FROM plan_occurrences o JOIN maintenance_plans p ON p.id = o.plan_id
           WHERE o.status = 'PLANNED' AND p.is_active = 1 AND o.week <= ? ORDER BY o.week, o.id`,
        )
        .pluck()
        .all(limit);
      const ids = due
        .map((id) => releaseOne(id, { today, stamp, userId: user?.id ?? null }))
        .filter((id) => id !== null);
      return { released: ids.length, work_order_ids: ids };
    },

    /**
     * GET /api/planning/timeline: active plans grouped in rows, their occurrences in the
     * weeks shown, and the figures of each week (BR-Y1 to BR-Y4) for the filters in use.
     */
    timeline({ from: start, year, weeks: size, group_by: groupBy, ...filters }, { now, timeZone }) {
      const currentWeek = weekOfDate(dateInZone(timeZone, now));
      const from = year ? formatWeek(year, 1) : (start ?? currentWeek);
      const offset = weeksBetween(currentWeek, from);
      if (offset < -PAST_WEEKS || offset > FUTURE_WEEKS) {
        throw new HttpError(400, 'Invalid query', {
          fields: {
            [year ? 'year' : 'from']:
              'The planner shows from two years back to one year ahead of the current week',
          },
        });
      }
      const weeks = weekRange(from, year ? weeksInYear(year) : size);
      const to = weeks.at(-1);
      const current = settings();
      const { clause, params } = planFilters({ ...filters, active: true });

      const plans = db
        .prepare(
          `SELECT p.* FROM maintenance_plans p ${clause}
           ORDER BY p.site, p.building, p.category, p.code`,
        )
        .all(params);
      const rows = db
        .prepare(
          `SELECT o.id, o.plan_id, o.due_week, o.week, o.status, o.skip_reason, o.work_order_id,
             w.number AS wo_number, w.status AS wo_status
           FROM plan_occurrences o
           JOIN maintenance_plans p ON p.id = o.plan_id
           LEFT JOIN work_orders w ON w.id = o.work_order_id
           ${clause ? `${clause} AND` : 'WHERE'} o.week BETWEEN @from AND @to
           ORDER BY o.week, o.id`,
        )
        .all({ ...params, from, to });

      const byPlan = new Map(plans.map((p) => [p.id, { plan: p, occurrences: [] }]));
      for (const o of rows) {
        const entry = byPlan.get(o.plan_id);
        entry.occurrences.push({
          id: o.id,
          due_week: o.due_week,
          week: o.week,
          status: o.status,
          skip_reason: o.skip_reason,
          work_order:
            o.work_order_id === null
              ? null
              : { id: o.work_order_id, number: o.wo_number, status: o.wo_status },
          warnings: occurrenceWarnings(entry.plan, o.week),
        });
      }

      const capacity = weeklyCapacity(
        capacityPeople({ site: filters.site, category: filters.category }),
        current,
      );
      const figures = weeklyFigures(
        weeks,
        rows.map((o) => {
          const p = byPlan.get(o.plan_id).plan;
          return { ...o, ...pick(p, ['estimated_hours', 'category', 'site', 'performed_by']) };
        }),
        capacity,
      );

      const weekIndex = new Map(weeks.map((w, i) => [w, i]));
      const groups = new Map();
      for (const { plan, occurrences } of byPlan.values()) {
        const key = groupKey(plan, groupBy);
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            ...groupLabel(plan, groupBy),
            plans: [],
            hours: weeks.map(() => 0),
          });
        }
        const group = groups.get(key);
        group.plans.push({
          ...pick(plan, [
            'id',
            'code',
            'title',
            'type',
            'category',
            'site',
            'building',
            'estimated_hours',
            'frequency_weeks',
            'anchor_week',
            'tolerance_weeks',
            'schedule_mode',
            'performed_by',
            'supplier',
          ]),
          warnings: planWarnings(plan, current),
          occurrences,
        });
        if (plan.performed_by === 'INTERNAL') {
          for (const o of occurrences) {
            if (o.status !== 'SKIPPED') group.hours[weekIndex.get(o.week)] += plan.estimated_hours;
          }
        }
      }

      return {
        from,
        to,
        current_week: currentWeek,
        group_by: groupBy,
        weeks: weeks.map((week) => ({ week, monday: mondayOf(week) })),
        settings: current,
        capacity: { weekly: capacity.total, by_category: capacity.by_category },
        figures,
        tiles: planningTiles(figures, capacity, CATEGORIES),
        groups: [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)),
      };
    },
  };
}

const pick = (object, keys) => Object.fromEntries(keys.map((k) => [k, object[k]]));

function groupKey(plan, groupBy) {
  if (groupBy === 'building') return `${plan.site}\u0000${plan.building ?? ''}`;
  return plan[groupBy];
}

/** Group title: the site, "site · building", or the trade code (the client shows its label). */
function groupLabel(plan, groupBy) {
  if (groupBy === 'building') return { site: plan.site, building: plan.building };
  if (groupBy === 'site') return { site: plan.site };
  return { category: plan.category ?? GENERAL };
}
