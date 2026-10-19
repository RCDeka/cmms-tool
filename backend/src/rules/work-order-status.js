// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Work order workflow (docs/data-model.md → BR-W4 to BR-W8, BR-W14 to BR-W18).
import {
  DONE_WORK_ORDER_STATUSES,
  TERMINAL_WORK_ORDER_STATUSES,
  UNFINISHED_WORK_ORDER_STATUSES,
} from './enums.js';

/** Allowed status transitions (BR-W4). Any other change is rejected with 422. */
export const TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

/** Statuses of work that has started: entering one sets the start (BR-W5, BR-W17). */
const STARTED = ['IN_PROGRESS', 'COMPLETED', 'CLOSED'];

/**
 * Fields an admin override may send with the status on a closed or cancelled work order:
 * those the target status needs (BR-W7, BR-W17).
 */
const OVERRIDE_FIELDS = [
  'status',
  'hold_reason',
  'hold_note',
  'work_report',
  'report_waived',
  'assignee_id',
  'started_on',
  'completed_on',
  'closed_on',
];

export const isTerminal = (status) => TERMINAL_WORK_ORDER_STATUSES.includes(status);
export const isDone = (status) => DONE_WORK_ORDER_STATUSES.includes(status);
export const isUnfinished = (status) => UNFINISHED_WORK_ORDER_STATUSES.includes(status);

/**
 * True for an allowed transition, or no change (BR-W4). Back to OPEN from a hold only for work
 * that never started (BR-W5): pass the work order's `first_started_at`.
 */
export function canTransition(from, to, firstStartedAt = null) {
  if (from === to) return true;
  if (from === 'ON_HOLD' && to === 'OPEN' && firstStartedAt) return false;
  return TRANSITIONS[from].includes(to);
}

const ruleError = (rule, message, status = 422) => ({ error: { rule, message, status } });

const hasText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Applies BR-W4 to BR-W8 and BR-W14 to BR-W18 to an update of `current` with `changes`.
 * Pure: no database; `today` is 'YYYY-MM-DD' in APP_TIMEZONE.
 * @param {object} current stored row
 * @param {object} changes parsed API changes
 * @param {object} context
 * @param {string} context.today
 * @param {string} [context.editDay] date the status change was made ('YYYY-MM-DD' in
 *   APP_TIMEZONE; today by default): an offline start or completion keeps its day
 * @param {string} context.role role of the user writing
 * @param {{ status: string, assignee_id: string }} context.moments datetime the change of the
 *   status, and of the assignee, was made (the write's edited_at, BR-W18)
 * @param {boolean} [context.assigneeActive] the assignee after the change is an active user
 * @returns {{ changes: object, override: boolean }
 *   | { error: { rule: string, message: string, status: number } }}
 *   changes completed with the derived fields; `override` for an admin override (BR-W17)
 */
export function applyWorkOrderRules(current, changes, context) {
  const { today, role, moments, assigneeActive = true } = context;
  const day = context.editDay && context.editDay < today ? context.editDay : today;
  const next = { ...changes };
  const from = current.status;
  const to = changes.status;
  const moving = to !== undefined && to !== from;
  const allowed = moving && !isTerminal(from) && canTransition(from, to, current.first_started_at);
  const override = moving && !allowed && role === 'ADMIN';

  if (isTerminal(from) && !override) {
    return ruleError('BR-W7', 'Closed and cancelled work orders are read-only.');
  }
  if (override) {
    if (current.review_status === 'WITHDRAWN' || current.review_status === 'REJECTED') {
      return ruleError(
        'BR-W17',
        current.review_status === 'WITHDRAWN'
          ? 'Its requester cancelled this request: it cannot be brought back.'
          : 'This request was rejected: it cannot be brought back.',
      );
    }
    if (isTerminal(from) && Object.keys(changes).some((f) => !OVERRIDE_FIELDS.includes(f))) {
      return ruleError(
        'BR-W7',
        'On a closed or cancelled work order, only the status and the fields it needs change.',
      );
    }
  }
  if (moving && !allowed && !override) {
    if (from === 'ON_HOLD' && to === 'OPEN') {
      return ruleError('BR-W5', 'This work has started: resume it instead of reopening it.');
    }
    return ruleError('BR-W4', `The status cannot change from ${from} to ${to}.`);
  }
  // BR-W16: the administrative closing belongs to supervisors and admins.
  if (moving && to === 'CLOSED' && !['SUPERVISOR', 'ADMIN'].includes(role)) {
    return ruleError('BR-W16', 'Only supervisors and admins close work orders.', 403);
  }

  const value = (field) => (field in next ? next[field] : current[field]);
  const status = moving ? to : from;

  if (moving) {
    // BR-W5, BR-W17: the first start.
    if (STARTED.includes(to)) {
      if (!value('started_on')) next.started_on = day;
      if (!current.first_started_at) next.first_started_at = moments.status;
    }
    // BR-W14: leaving the hold clears its reason and note (the audit log keeps them).
    if (from === 'ON_HOLD') {
      next.hold_reason = null;
      next.hold_note = null;
    }
    // BR-W15, BR-W17: leaving the technical end clears it; the clocks run on.
    if (isDone(from) && !isDone(to)) {
      if (isUnfinished(to) && to !== 'OPEN' && !assigneeActive) {
        return ruleError('BR-W15', 'Assign this work order to an active person to reopen it.');
      }
      next.completed_on = null;
      next.completed_at = null;
      next.report_waived = false;
    }
    if (from === 'CLOSED') next.closed_on = null;
    // BR-W6: the technical end.
    if (isDone(to)) {
      if (!value('completed_on')) next.completed_on = day;
      if (!isDone(from)) next.completed_at = moments.status;
    }
    if (to === 'CLOSED' && !value('closed_on')) next.closed_on = day;
  }

  // BR-W14: a hold has its reason; reason and note exist only on hold.
  if (status === 'ON_HOLD' && !value('hold_reason')) {
    return ruleError('BR-W14', 'Say why the work order is on hold.');
  }
  if (status !== 'ON_HOLD' && (hasText(next.hold_reason) || hasText(next.hold_note))) {
    return ruleError('BR-W14', 'A hold reason is given only when putting the work on hold.');
  }

  // BR-W6: the waiver and the dates of the technical end belong to finished work.
  if (!isDone(status)) {
    if (next.report_waived === true) {
      return ruleError('BR-W6', 'The report is waived only on technically done work.');
    }
    if (next.completed_on) {
      return ruleError('BR-W6', 'The completion date is set when the work is technically done.');
    }
  } else if (!hasText(value('work_report')) && !value('report_waived')) {
    return ruleError(
      'BR-W6',
      'Write the work report first: the work cannot be marked technically done without it.',
    );
  }
  if (status !== 'CLOSED' && next.closed_on) {
    return ruleError('BR-W6', 'The closing date is set when the work order is closed.');
  }

  // BR-W18: the first assignment.
  if ('assignee_id' in next && next.assignee_id !== null && !current.first_assigned_at) {
    next.first_assigned_at = moments.assignee_id;
  }

  // BR-W8 on the record as it would be after the update.
  const after = { ...current, ...next };
  if (after.due_on && after.due_on < after.created_on) {
    return ruleError('BR-W8', 'The due date cannot be earlier than the creation date.');
  }
  if (after.completed_on && after.started_on && after.completed_on < after.started_on) {
    return ruleError('BR-W8', 'The completion date cannot be earlier than the start date.');
  }
  if (after.completed_on && after.completed_on > today) {
    return ruleError('BR-W8', 'The completion date cannot be in the future.');
  }
  if (after.closed_on && after.completed_on && after.closed_on < after.completed_on) {
    return ruleError('BR-W8', 'The closing date cannot be earlier than the completion date.');
  }
  if (after.closed_on && after.started_on && after.closed_on < after.started_on) {
    return ruleError('BR-W8', 'The closing date cannot be earlier than the start date.');
  }
  return { changes: next, override };
}
