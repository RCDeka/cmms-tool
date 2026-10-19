// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Dashboard KPI rules (docs/data-model.md → KPI definitions). Pure: "today" is given,
// computed by the caller in APP_TIMEZONE (D13).
import { addDays } from '../lib/dates.js';
import { WORK_ORDER_PRIORITIES } from './enums.js';
import { isUnfinished } from './work-order-status.js';

/** First and last day of the calendar month of `today` ('YYYY-MM-DD'). */
export function monthRange(today) {
  const first = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split('-').map(Number);
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from: first, to: addDays(nextFirst, -1) };
}

/** Overdue: unfinished, and the due date is before today (due today is not late). */
export function isOverdue(workOrder, today) {
  return isUnfinished(workOrder.status) && Boolean(workOrder.due_on) && workOrder.due_on < today;
}

/** "My work": assigned to the user, unfinished, due on `lastDay` or earlier, or no due date. */
export function isMyWorkDueBy(workOrder, userId, lastDay) {
  return (
    workOrder.assignee_id === userId &&
    isUnfinished(workOrder.status) &&
    (!workOrder.due_on || workOrder.due_on <= lastDay)
  );
}

/** "My work today": due today or earlier, or no due date. */
export function isMyWorkToday(workOrder, userId, today) {
  return isMyWorkDueBy(workOrder, userId, today);
}

/** Last day of "My work this week": the next 7 days, today included. */
export function weekEnd(today) {
  return addDays(today, 6);
}

const PRIORITY_RANK = Object.fromEntries(WORK_ORDER_PRIORITIES.map((p, i) => [p, i]));

/** Order of "My work today": URGENT first, then the earliest due date (none last), then number. */
export function compareMyWork(a, b) {
  return (
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
    (a.due_on ?? '9999-12-31').localeCompare(b.due_on ?? '9999-12-31') ||
    a.number.localeCompare(b.number)
  );
}
