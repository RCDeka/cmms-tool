// Occurrences of maintenance plans (docs/data-model.md → plan_occurrences): generated from the
// series, recomputed when the series changes, and kept in step with their work orders. These
// functions write inside the caller's transaction.
import { dateInZone } from '../lib/dates.js';
import { addWeeks, weekOfDate } from '../lib/iso-week.js';
import { auditLabel, diffChanges } from '../rules/audit.js';
import { floatingAnchor, seriesWeeks } from '../rules/planning.js';
import { recordAudit } from './audit.js';

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
 * BR-P2: after a change of the series (anchor, frequency, end) or of `is_active`, the
 * occurrences still planned and never moved are replaced by the new series. An inactive plan
 * keeps only its history (released and skipped visits).
 */
export function recomputeOccurrences(db, plan, context) {
  db.prepare(
    plan.is_active
      ? "DELETE FROM plan_occurrences WHERE plan_id = ? AND status = 'PLANNED' AND week = due_week"
      : "DELETE FROM plan_occurrences WHERE plan_id = ? AND status = 'PLANNED'",
  ).run(plan.id);
  generateOccurrences(db, plan, context);
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
  if (!workOrder.plan_id || !['CANCELLED', 'CLOSED'].includes(changes.status)) return;
  const occurrence = db
    .prepare('SELECT * FROM plan_occurrences WHERE work_order_id = ?')
    .get(workOrder.id);
  const plan = db.prepare('SELECT * FROM maintenance_plans WHERE id = ?').get(workOrder.plan_id);

  if (changes.status === 'CANCELLED') {
    if (occurrence?.status !== 'RELEASED') return;
    const skip = { status: 'SKIPPED', skip_reason: `Work order ${workOrder.number} cancelled` };
    db.prepare(
      'UPDATE plan_occurrences SET status = ?, skip_reason = ?, updated_at = ? WHERE id = ?',
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
    { currentWeek: weekOfDate(dateInZone(timeZone, new Date(stamp))), stamp },
  );
}
