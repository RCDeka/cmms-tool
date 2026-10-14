// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Staff requests (D46): work orders created by a STAFF user. Pure rules.

/**
 * Type given to a request: staff are not asked for it (they report something to fix); the
 * maintenance team can change it when triaging.
 */
export const REQUEST_TYPE = 'CORRECTIVE';

/** Request scopes of GET /api/requests: unfinished ones, or every request. */
export const REQUEST_SCOPES = ['open', 'all'];

/**
 * Steps of a work order from its audit entries, oldest first: the creation, the review of a
 * staff request (APPROVED or REJECTED, D47), then each applied status change. Rejected edits
 * (CONFLICT) changed nothing and are skipped. A rejection is one step, not also CANCELLED;
 * so is a withdrawal by the requester (WITHDRAWN, D79).
 * @param {{ action: string, changes: Record<string, { from: unknown, to: unknown }>,
 *   note?: { review?: string } | null, at: string }[]} entries audit entries, oldest first
 * @returns {{ status: string, at: string }[]}
 */
export function statusTimeline(entries) {
  const steps = [];
  for (const entry of entries) {
    if (entry.action === 'CONFLICT') continue;
    const review =
      entry.note?.review ?? (entry.changes.review_status?.to === 'WITHDRAWN' ? 'WITHDRAWN' : null);
    const to = review ?? entry.changes.status?.to;
    if (!to || steps.at(-1)?.status === to) continue;
    steps.push({ status: to, at: entry.at });
  }
  return steps;
}

/** Fields only the review can set on a request waiting for it (BR-R7). */
const SET_BY_REVIEW = ['status', 'assignee_id'];

/**
 * Fields of a regular change that a request waiting for review refuses (BR-R7): it is
 * assigned by approving it and cancelled by rejecting it. Pure.
 * @param {{ review_status: string | null, status: string, assignee_id: number | null }} current
 * @param {object} changes
 * @returns {string[]}
 */
export function fieldsAwaitingReview(current, changes) {
  if (current.review_status !== 'PENDING') return [];
  return SET_BY_REVIEW.filter((f) => f in changes && (changes[f] ?? null) !== current[f]);
}

/**
 * Why a review is refused, or null (BR-R6, BR-V1, BR-V4). Pure.
 * @param {{ review_status: string | null, version: number, has_conflict: number }} current
 * @param {number} version version the reviewer saw
 * @returns {{ status: number, rule: string, message: string } | null}
 */
export function reviewBlocker(current, version) {
  if (current.review_status === null) {
    return { status: 422, rule: 'BR-R6', message: 'This work order is not a staff request.' };
  }
  if (current.review_status !== 'PENDING') {
    return { status: 409, rule: 'BR-R6', message: 'This request has already been reviewed.' };
  }
  if (current.has_conflict === 1) {
    return {
      status: 409,
      rule: 'BR-V4',
      message: 'This request is waiting for a conflict to be resolved.',
    };
  }
  if (current.version !== version) {
    return {
      status: 409,
      rule: 'BR-V1',
      message: 'This request changed since you opened it: reload it and review it again.',
    };
  }
  return null;
}

/**
 * Why the requester cannot cancel their request, or null (BR-R10, D79): only until work
 * starts, and not while a conflict waits for a supervisor (BR-V4). Pure.
 * @param {{ status: string, has_conflict: number }} current
 * @returns {{ status: number, rule: string, message: string } | null}
 */
export function withdrawalBlocker(current) {
  if (current.status === 'CANCELLED' || current.status === 'CLOSED') {
    return { status: 422, rule: 'BR-R10', message: 'This request is already finished.' };
  }
  if (current.status !== 'OPEN') {
    return {
      status: 422,
      rule: 'BR-R10',
      message:
        'Work on this request has started: add a comment to ask the maintenance team to stop.',
    };
  }
  if (current.has_conflict === 1) {
    return {
      status: 409,
      rule: 'BR-V4',
      message: 'The maintenance team is updating this request: try again later.',
    };
  }
  return null;
}
