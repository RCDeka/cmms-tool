// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Work order workflow (docs/data-model.md → BR-W4 to BR-W8).
import { TERMINAL_WORK_ORDER_STATUSES } from './enums.js';

/** Allowed status transitions (BR-W4). Any other change is rejected with 422. */
export const TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'CLOSED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

export const isTerminal = (status) => TERMINAL_WORK_ORDER_STATUSES.includes(status);

/** True for an allowed transition, or no change. */
export function canTransition(from, to) {
  return from === to || TRANSITIONS[from].includes(to);
}

const ruleError = (rule, message) => ({ error: { rule, message } });

/**
 * Applies BR-W4 to BR-W8 to an update of `current` with `changes`.
 * Pure: no database, `today` is given ('YYYY-MM-DD' in APP_TIMEZONE).
 * @returns {{ changes: object } | { error: { rule: string, message: string } }}
 *   changes completed with derived fields (started_on, closed_on)
 */
export function applyWorkOrderRules(current, changes, today) {
  if (isTerminal(current.status)) {
    return ruleError('BR-W7', 'Closed and cancelled work orders are read-only.');
  }
  const next = { ...changes };
  const to = changes.status;

  if (to !== undefined && to !== current.status) {
    if (!canTransition(current.status, to)) {
      return ruleError('BR-W4', `The status cannot change from ${current.status} to ${to}.`);
    }
    // BR-W5: the first time the work order enters IN_PROGRESS.
    const startedOn = 'started_on' in next ? next.started_on : current.started_on;
    if (to === 'IN_PROGRESS' && !startedOn) next.started_on = today;
    // BR-W6: closing needs a work report, and sets the closing date.
    if (to === 'CLOSED') {
      const report = 'work_report' in next ? next.work_report : current.work_report;
      if (!report || !report.trim()) {
        return ruleError('BR-W6', 'A work report is required to close a work order.');
      }
      const closedOn = 'closed_on' in next ? next.closed_on : current.closed_on;
      if (!closedOn) next.closed_on = today;
    }
  }

  // BR-W8 on the record as it would be after the update.
  const after = { ...current, ...next };
  if (after.due_on && after.due_on < after.created_on) {
    return ruleError('BR-W8', 'The due date cannot be earlier than the creation date.');
  }
  if (after.closed_on && after.started_on && after.closed_on < after.started_on) {
    return ruleError('BR-W8', 'The closing date cannot be earlier than the start date.');
  }
  return { changes: next };
}
