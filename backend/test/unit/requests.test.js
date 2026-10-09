// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { fieldsAwaitingReview, reviewBlocker, statusTimeline } from '../../src/rules/requests.js';
import { defaultPowerUser } from '../../src/rules/users.js';

const entry = (action, changes, at) => ({ action, changes, at });

describe('statusTimeline', () => {
  it('lists the creation, then each applied status change', () => {
    expect(
      statusTimeline([
        entry('CREATE', { status: { from: null, to: 'OPEN' } }, 't1'),
        entry('UPDATE', { assignee_id: { from: null, to: 4 } }, 't2'),
        entry('UPDATE', { status: { from: 'OPEN', to: 'IN_PROGRESS' } }, 't3'),
        entry('RESOLVE', { status: { from: 'IN_PROGRESS', to: 'ON_HOLD' } }, 't4'),
      ]),
    ).toEqual([
      { status: 'OPEN', at: 't1' },
      { status: 'IN_PROGRESS', at: 't3' },
      { status: 'ON_HOLD', at: 't4' },
    ]);
  });

  it('skips rejected edits and repeats of the same status', () => {
    expect(
      statusTimeline([
        entry('CREATE', { status: { from: null, to: 'OPEN' } }, 't1'),
        entry('CONFLICT', { status: { from: 'OPEN', to: 'CANCELLED' } }, 't2'),
        entry('RESOLVE', { status: { from: 'OPEN', to: 'OPEN' } }, 't3'),
      ]),
    ).toEqual([{ status: 'OPEN', at: 't1' }]);
  });

  it('shows the review as one step: approved, or rejected (not also cancelled)', () => {
    expect(
      statusTimeline([
        entry('CREATE', { status: { from: null, to: 'OPEN' } }, 't1'),
        {
          ...entry('UPDATE', { assignee_id: { from: null, to: 4 } }, 't2'),
          note: { review: 'APPROVED' },
        },
      ]).map((s) => s.status),
    ).toEqual(['OPEN', 'APPROVED']);
    expect(
      statusTimeline([
        entry('CREATE', { status: { from: null, to: 'OPEN' } }, 't1'),
        {
          ...entry('UPDATE', { status: { from: 'OPEN', to: 'CANCELLED' } }, 't2'),
          note: { review: 'REJECTED' },
        },
      ]),
    ).toEqual([
      { status: 'OPEN', at: 't1' },
      { status: 'REJECTED', at: 't2' },
    ]);
  });

  it('is empty without entries', () => {
    expect(statusTimeline([])).toEqual([]);
  });
});

describe('defaultPowerUser (D21)', () => {
  it('is on for supervisors and admins only', () => {
    expect(['STAFF', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN'].map(defaultPowerUser)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
});

describe('review rules (D47)', () => {
  const pending = {
    review_status: 'PENDING',
    status: 'OPEN',
    assignee_id: null,
    version: 3,
    has_conflict: 0,
  };

  it('keeps assignment and status changes for the review while pending (BR-R7)', () => {
    expect(fieldsAwaitingReview(pending, { assignee_id: 4, priority: 'HIGH' })).toEqual([
      'assignee_id',
    ]);
    expect(fieldsAwaitingReview(pending, { status: 'CANCELLED' })).toEqual(['status']);
    // Unchanged values (e.g. a conflict resolution sending them back) are fine.
    expect(fieldsAwaitingReview(pending, { status: 'OPEN', assignee_id: null })).toEqual([]);
    expect(
      fieldsAwaitingReview({ ...pending, review_status: 'APPROVED' }, { status: 'CANCELLED' }),
    ).toEqual([]);
    expect(fieldsAwaitingReview({ ...pending, review_status: null }, { assignee_id: 4 })).toEqual(
      [],
    );
  });

  it('says why a review is refused', () => {
    expect(reviewBlocker(pending, 3)).toBeNull();
    expect(reviewBlocker({ ...pending, review_status: null }, 3)).toMatchObject({
      status: 422,
      rule: 'BR-R6',
    });
    expect(reviewBlocker({ ...pending, review_status: 'REJECTED' }, 3)).toMatchObject({
      status: 409,
      rule: 'BR-R6',
    });
    expect(reviewBlocker({ ...pending, has_conflict: 1 }, 3)).toMatchObject({
      status: 409,
      rule: 'BR-V4',
    });
    expect(reviewBlocker(pending, 2)).toMatchObject({ status: 409, rule: 'BR-V1' });
  });
});
