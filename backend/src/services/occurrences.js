// Occurrences of maintenance plans (docs/data-model.md → plan_occurrences): generated from the
// series, recomputed when the series changes, and kept in step with their work orders. These
// functions write inside the caller's transaction.
import { z } from 'zod';
import { dateInZone } from '../lib/dates.js';
import { HttpError } from '../lib/http-error.js';
import { addWeeks, weekOfDate } from '../lib/iso-week.js';
import { fieldErrors } from '../middleware/validate.js';
import { auditLabel, diffChanges } from '../rules/audit.js';
import { isoWeek, WRITE_META } from '../rules/fields.js';
import {
  floatingAnchor,
  isSeriesWeek,
  moveBlocker,
  occurrenceWarnings,
  seriesShift,
  seriesWeeks,
} from '../rules/planning.js';
import { recordAudit } from './audit.js';
import { userRef, userRefColumns } from './mappers.js';

/** Occurrences are stored from the current week up to this many weeks ahead (BR-P1). */
export const HORIZON_WEEKS = 104;

/** Label of an occurrence in the audit log: its plan and due week. */
export const occurrenceLabel = (plan, dueWeek) => `${plan.code} — ${dueWeek}`;

/**
 * Stores the plan's missing occurrences from `currentWeek` to the horizon. Weeks already
 * stored (released, skipped or moved ones included) are kept as they are.
 * @param {import('better-sqlite3').Database} db
 * @param {object} plan stored row
 * @param {{ currentWeek: string, stamp: string }} context
 */
export function generateOccurrences(db, plan, { currentWeek, stamp }) {
  if (!plan.is_active) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO plan_occurrences (plan_id, due_week, week, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const week of seriesWeeks(plan, currentWeek, addWeeks(currentWeek, HORIZON_WEEKS))) {
    insert.run(plan.id, week, week, stamp, stamp);
  }
}

/**
 * Daily top-up of every active plan (BR-P1): stores the occurrences missing from the current
 * week to the horizon. It reads what is stored first and writes only when something is
 * missing (as time passes, a new week at the end of the horizon), so a planner or scheduler
 * load, which runs it, takes no write lock in the usual case. Returns the number added.
 * @param {import('better-sqlite3').Database} db
 * @param {{ currentWeek: string, stamp: string }} context
 */
export function topUpOccurrences(db, { currentWeek, stamp }) {
  const horizon = addWeeks(currentWeek, HORIZON_WEEKS);
  const plans = db.prepare('SELECT * FROM maintenance_plans WHERE is_active = 1').all();
  const stored = new Map(plans.map((p) => [p.id, new Set()]));
  for (const row of db
    .prepare(
      `SELECT o.plan_id, o.due_week FROM plan_occurrences o
       JOIN maintenance_plans p ON p.id = o.plan_id
       WHERE p.is_active = 1 AND o.due_week >= ?`,
    )
    .all(currentWeek)) {
    stored.get(row.plan_id).add(row.due_week);
  }
  const missing = plans.flatMap((plan) =>
    seriesWeeks(plan, currentWeek, horizon)
      .filter((week) => !stored.get(plan.id).has(week))
      .map((week) => [plan.id, week]),
  );
  if (!missing.length) return 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO plan_occurrences (plan_id, due_week, week, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  // OR IGNORE: another request may have added the same weeks meanwhile.
  db.transaction(() => {
    for (const [planId, week] of missing) insert.run(planId, week, week, stamp, stamp);
  }).immediate();
  return missing.length;
}

/**
 * BR-P2: after a change of the series (anchor, frequency, end) or of `is_active`, the
 * occurrences still planned and never moved are replaced by the new series (D51):
 * - a visit moved by hand follows a moved series by the same number of weeks, keeping its own
 *   offset; it is removed when its due week leaves the series, lands in the past or is taken;
 * - a visit with a work order, or skipped, keeps its week, but its due week follows the series,
 *   so its slot stays filled and the series does not plan a second visit next to it;
 * - when the frequency changes, the series is rebuilt instead of shifted.
 * An inactive plan keeps only its history.
 * @param {object} plan the plan after the change (stored row values)
 * @param {{ currentWeek: string, stamp: string }} context
 * @param {object} [previous] the plan before the change, to shift with the series
 */
export function recomputeOccurrences(db, plan, context, previous = null) {
  if (!plan.is_active) {
    db.prepare("DELETE FROM plan_occurrences WHERE plan_id = ? AND status = 'PLANNED'").run(
      plan.id,
    );
    return;
  }
  db.prepare(
    "DELETE FROM plan_occurrences WHERE plan_id = ? AND status = 'PLANNED' AND week = due_week",
  ).run(plan.id);

  const shift = previous ? seriesShift(previous, plan) : 0;
  const rows = db
    .prepare('SELECT * FROM plan_occurrences WHERE plan_id = ?')
    .all(plan.id)
    // Shift the farthest first, so no visit lands on one not shifted yet.
    .sort((a, b) =>
      shift > 0 ? b.due_week.localeCompare(a.due_week) : a.due_week.localeCompare(b.due_week),
    );
  const taken = db
    .prepare('SELECT 1 FROM plan_occurrences WHERE plan_id = ? AND due_week = ? AND id <> ?')
    .pluck();
  const remove = db.prepare('DELETE FROM plan_occurrences WHERE id = ?');
  const update = db.prepare(
    `UPDATE plan_occurrences SET due_week = ?, week = ?, version = version + 1, updated_at = ?
     WHERE id = ?`,
  );
  for (const o of rows) {
    const due = addWeeks(o.due_week, shift);
    if (o.status !== 'PLANNED') {
      // History stays where it is; a slot still to come moves with the series.
      if (shift && due >= context.currentWeek && !taken.get(plan.id, due, o.id)) {
        update.run(due, o.week, context.stamp, o.id);
      }
      continue;
    }
    const week = addWeeks(o.week, shift);
    if (!isSeriesWeek(plan, due) || week < context.currentWeek || taken.get(plan.id, due, o.id)) {
      remove.run(o.id);
    } else if (shift) {
      update.run(due, week, context.stamp, o.id);
    }
  }
  generateOccurrences(db, plan, context);
}

/**
 * A released visit follows its work order to another week (BR-P4, D55): the occurrence's
 * `week` changes (a moved visit unless back on its due week), logged on the visit, so the year
 * planner shows the visit where the work is planned.
 */
function followPlannedWeek(db, workOrder, week, { userId, stamp }) {
  const occurrence = db
    .prepare("SELECT * FROM plan_occurrences WHERE work_order_id = ? AND status = 'RELEASED'")
    .get(workOrder.id);
  if (!occurrence || occurrence.week === week) return;
  const plan = db.prepare('SELECT * FROM maintenance_plans WHERE id = ?').get(workOrder.plan_id);
  const back = week === occurrence.due_week;
  const moved = { week, moved_by: back ? null : userId, moved_at: back ? null : stamp };
  db.prepare(
    `UPDATE plan_occurrences SET week = @week, moved_by = @moved_by, moved_at = @moved_at,
       version = version + 1, updated_at = @stamp WHERE id = @id`,
  ).run({ ...moved, stamp, id: occurrence.id });
  recordAudit(db, {
    entityType: 'plan_occurrences',
    entityId: occurrence.id,
    action: 'UPDATE',
    changes: diffChanges(occurrence, { week }),
    note: { work_order: workOrder.number },
    label: occurrenceLabel(plan, occurrence.due_week),
    userId,
    version: occurrence.version + 1,
    at: stamp,
  });
}

/**
 * Keeps a plan's visit in step with its work order, after a change of status:
 * - cancelled: the occurrence is skipped (BR-P7);
 * - closed, in a FLOATING plan: the series restarts from the closing week (BR-P5).
 * @param {import('better-sqlite3').Database} db
 * @param {object} workOrder stored row before the change
 * @param {object} changes applied changes (API values)
 * @param {{ userId: number, stamp: string, timeZone: string }} context
 */
export function followWorkOrder(db, workOrder, changes, { userId, stamp, timeZone }) {
  if (!workOrder.plan_id) return;
  if ('planned_week' in changes && changes.planned_week !== workOrder.planned_week) {
    followPlannedWeek(db, workOrder, changes.planned_week, { userId, stamp });
  }
  if (!['CANCELLED', 'CLOSED'].includes(changes.status)) return;
  const occurrence = db
    .prepare('SELECT * FROM plan_occurrences WHERE work_order_id = ?')
    .get(workOrder.id);
  const plan = db.prepare('SELECT * FROM maintenance_plans WHERE id = ?').get(workOrder.plan_id);

  if (changes.status === 'CANCELLED') {
    if (occurrence?.status !== 'RELEASED') return;
    const skip = { status: 'SKIPPED', skip_reason: `Work order ${workOrder.number} cancelled` };
    db.prepare(
      `UPDATE plan_occurrences SET status = ?, skip_reason = ?, version = version + 1,
         updated_at = ? WHERE id = ?`,
    ).run(skip.status, skip.skip_reason, stamp, occurrence.id);
    recordAudit(db, {
      entityType: 'plan_occurrences',
      entityId: occurrence.id,
      action: 'UPDATE',
      changes: diffChanges(occurrence, skip),
      label: occurrenceLabel(plan, occurrence.due_week),
      userId,
      at: stamp,
    });
    return;
  }

  const closedOn =
    changes.closed_on ?? workOrder.closed_on ?? dateInZone(timeZone, new Date(stamp));
  const anchor = floatingAnchor(plan, weekOfDate(closedOn));
  if (!anchor || !plan.is_active || anchor === plan.anchor_week) return;
  db.prepare(
    `UPDATE maintenance_plans SET anchor_week = ?, version = version + 1, updated_by = ?,
       updated_at = ? WHERE id = ?`,
  ).run(anchor, userId, stamp, plan.id);
  recordAudit(db, {
    entityType: 'maintenance_plans',
    entityId: plan.id,
    action: 'UPDATE',
    changes: { anchor_week: { from: plan.anchor_week, to: anchor } },
    note: { floating: workOrder.number },
    label: auditLabel('maintenance_plans', plan),
    userId,
    version: plan.version + 1,
    at: stamp,
  });
  recomputeOccurrences(
    db,
    { ...plan, anchor_week: anchor },
    // A restart, not a shift: the closed visit holds no slot, the next one comes a period later.
    { currentWeek: weekOfDate(dateInZone(timeZone, new Date(stamp))), stamp },
  );
}

const moveSchema = z.strictObject({ week: isoWeek, version: WRITE_META.version });
const skipSchema = z.strictObject({
  reason: z.string().trim().min(1, 'Say why the visit is skipped').max(500),
  version: WRITE_META.version,
});
const restoreSchema = z.strictObject({ version: WRITE_META.version });

const parse = (schema, body) => {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
  return parsed.data;
};

/**
 * Moves, skips and restores of single visits (Phase 18): supervisors and admins, at the
 * version the user saw, logged in the audit log.
 * @param {import('better-sqlite3').Database} db
 */
export function createOccurrenceService(db) {
  const byId = db.prepare(
    `SELECT o.*, w.number AS wo_number, w.status AS wo_status, ${userRefColumns('mb')}
     FROM plan_occurrences o
     LEFT JOIN work_orders w ON w.id = o.work_order_id
     LEFT JOIN users mb ON mb.id = o.moved_by
     WHERE o.id = ?`,
  );
  const blockedFor = db.prepare('SELECT week, site FROM blocked_weeks WHERE week = ?');

  /** Occurrence shape of the API (docs/api-design.md → Occurrence). */
  function getById(id) {
    const row = byId.get(id);
    if (!row) return null;
    const plan = db.prepare('SELECT * FROM maintenance_plans WHERE id = ?').get(row.plan_id);
    return {
      id: row.id,
      plan_id: row.plan_id,
      due_week: row.due_week,
      week: row.week,
      status: row.status,
      skip_reason: row.skip_reason,
      work_order:
        row.work_order_id === null
          ? null
          : { id: row.work_order_id, number: row.wo_number, status: row.wo_status },
      moved_by: userRef(row, 'mb'),
      moved_at: row.moved_at,
      version: row.version,
      warnings: occurrenceWarnings(plan, row.week, blockedFor.all(row.week)),
    };
  }

  /**
   * Applies a change to one occurrence in an IMMEDIATE transaction: 404, 409 when the version
   * differs, then `check` (throw to refuse), the update and its audit entry.
   */
  function write(id, version, user, now, check) {
    const stamp = now.toISOString();
    db.transaction(() => {
      const current = db.prepare('SELECT * FROM plan_occurrences WHERE id = ?').get(id);
      if (!current) throw new HttpError(404, 'Visit not found');
      if (current.version !== version) {
        throw new HttpError(409, 'This visit changed since you opened it. Reload and try again.', {
          rule: 'BR-V1',
        });
      }
      const plan = db.prepare('SELECT * FROM maintenance_plans WHERE id = ?').get(current.plan_id);
      const changes = check(current, plan);
      // Column names come from the callers below, never from the request as is.
      db.prepare(
        `UPDATE plan_occurrences SET ${Object.keys(changes)
          .map((k) => `${k} = @${k}`)
          .join(', ')}, version = version + 1, updated_at = @__now WHERE id = @__id`,
      ).run({ ...changes, __now: stamp, __id: id });
      recordAudit(db, {
        entityType: 'plan_occurrences',
        entityId: id,
        action: 'UPDATE',
        changes: diffChanges(current, changes),
        label: occurrenceLabel(plan, current.due_week),
        userId: user.id,
        version: current.version + 1,
        at: stamp,
      });
    }).immediate();
    return getById(id);
  }

  return {
    getById,

    /** PUT /api/plan-occurrences/:id: one visit to another week (BR-P3, BR-P4). */
    move(id, body, user, { now, timeZone }) {
      const { week, version } = parse(moveSchema, body);
      const currentWeek = weekOfDate(dateInZone(timeZone, now));
      return write(id, version, user, now, (current, plan) => {
        const blocker = moveBlocker(plan, current, week, currentWeek);
        if (blocker) throw new HttpError(422, blocker.message, { rule: blocker.rule });
        // Back on its due week: no longer a moved visit.
        const back = week === current.due_week;
        return {
          week,
          moved_by: back ? null : user.id,
          moved_at: back ? null : now.toISOString(),
        };
      });
    },

    /** POST /api/plan-occurrences/:id/skip (BR-P7): a planned visit, with a reason. */
    skip(id, body, user, { now }) {
      const { reason, version } = parse(skipSchema, body);
      return write(id, version, user, now, (current) => {
        if (current.status !== 'PLANNED') {
          throw new HttpError(
            422,
            current.status === 'RELEASED'
              ? 'This visit has its work order: cancel the work order to skip the visit.'
              : 'This visit is already skipped.',
            { rule: 'BR-P7' },
          );
        }
        return { status: 'SKIPPED', skip_reason: reason };
      });
    },

    /** POST /api/plan-occurrences/:id/restore: undoes a skip made by hand. */
    restore(id, body, user, { now }) {
      const { version } = parse(restoreSchema, body);
      return write(id, version, user, now, (current) => {
        if (current.status !== 'SKIPPED' || current.work_order_id !== null) {
          throw new HttpError(
            422,
            current.status === 'SKIPPED'
              ? 'This visit was skipped by cancelling its work order: it cannot come back.'
              : 'Only a skipped visit can be restored.',
            { rule: 'BR-P7' },
          );
        }
        return { status: 'PLANNED', skip_reason: null };
      });
    },
  };
}
