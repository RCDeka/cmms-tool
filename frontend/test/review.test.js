// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from 'vitest';
import { kpiTiles } from '../assets/js/dashboard.js';
import { parseFilters } from '../assets/js/filters.js';
import { resourceOptions, reviewPanel, reviewPayload } from '../assets/js/review.js';
import { checkReview, editableFields } from '../assets/js/rules.js';

const users = [
  { id: 2, first_name: 'Julien', last_name: 'Bernard', role: 'SUPERVISOR' },
  { id: 5, first_name: 'Lucas', last_name: 'Moreau', role: 'TECHNICIAN' },
  { id: 4, first_name: 'Karim', last_name: 'Benali', role: 'TECHNICIAN' },
];
const pending = {
  id: 190,
  number: 'WO-2026-00190',
  status: 'OPEN',
  review_status: 'PENDING',
  type: 'CORRECTIVE',
  priority: 'NORMAL',
  category: null,
  due_on: null,
  version: 3,
  has_conflict: false,
  assignee_id: null,
  created_at: '2026-10-07T08:00:00.000Z',
  created_by: { id: 6, first_name: 'Emma', last_name: 'Rousseau' },
};

describe('review rules', () => {
  it('keeps assignment and status for the review while a request waits for it', () => {
    const fields = editableFields('work_orders', { id: 2, role: 'SUPERVISOR' }, pending);
    expect(fields).not.toContain('assignee_id');
    expect(fields).not.toContain('status');
    expect(fields).toContain('location');
    const approved = { ...pending, review_status: 'APPROVED', assignee_id: 4 };
    expect(editableFields('work_orders', { id: 2, role: 'SUPERVISOR' }, approved)).toContain(
      'assignee_id',
    );
  });

  it('requires a resource to approve and a reason to reject', () => {
    expect(checkReview('APPROVE', { assignee_id: '' })).toHaveProperty('assignee_id');
    expect(checkReview('APPROVE', { assignee_id: '4' })).toEqual({});
    expect(checkReview('REJECT', { reason: '  ' })).toHaveProperty('reason');
    expect(checkReview('REJECT', { reason: 'Duplicate' })).toEqual({});
  });

  it('builds the review body', () => {
    expect(
      reviewPayload(
        'APPROVE',
        { assignee_id: '4', type: 'CORRECTIVE', priority: 'HIGH', category: '', due_on: '' },
        3,
      ),
    ).toEqual({
      decision: 'APPROVE',
      version: 3,
      assignee_id: 4,
      type: 'CORRECTIVE',
      priority: 'HIGH',
      category: null,
    });
    expect(reviewPayload('REJECT', { reason: ' Duplicate ' }, 3)).toEqual({
      decision: 'REJECT',
      version: 3,
      reason: 'Duplicate',
    });
  });

  it('offers technicians first, then supervisors, by name', () => {
    expect(resourceOptions(users).map(([, label]) => label)).toEqual([
      'Karim Benali (technician)',
      'Lucas Moreau (technician)',
      'Julien Bernard (supervisor)',
    ]);
  });
});

describe('review panel', () => {
  it('sends an approval with the chosen resource', async () => {
    const onReview = vi.fn().mockResolvedValue(null);
    const box = reviewPanel({ record: pending, users, onReview });
    box.querySelector('[name="assignee_id"]').value = '5';
    box.querySelector('.button-primary').click();
    await vi.waitFor(() => expect(onReview).toHaveBeenCalled());
    expect(onReview.mock.calls[0][0]).toMatchObject({
      decision: 'APPROVE',
      assignee_id: 5,
      version: 3,
    });
  });

  it('asks for a resource before approving, and shows server errors', async () => {
    const onReview = vi
      .fn()
      .mockResolvedValue({ fields: {}, message: 'This request has already been reviewed.' });
    const box = reviewPanel({ record: pending, users, onReview });
    box.querySelector('.button-primary').click();
    expect(onReview).not.toHaveBeenCalled();
    expect(box.querySelector('#review-assignee_id-error').textContent).toMatch(/Choose/);
    box.querySelector('[name="reason"]').value = 'Duplicate of WO-2026-00150';
    box.querySelector('.button-danger').click();
    await vi.waitFor(() =>
      expect(box.querySelector('.form-summary').textContent).toMatch(/already been reviewed/),
    );
    expect(onReview.mock.calls[0][0]).toEqual({
      decision: 'REJECT',
      version: 3,
      reason: 'Duplicate of WO-2026-00150',
    });
  });
});

describe('dashboard and list', () => {
  it('shows the "to review" tile to whoever receives the count', () => {
    const tiles = kpiTiles({ open_work_orders: 3, requests_to_review: 2 });
    expect(tiles.find((t) => t.key === 'requests_to_review')).toMatchObject({
      value: 2,
      flagged: true,
      href: '/work-orders?to_review=true',
    });
    expect(kpiTiles({ open_work_orders: 3 }).some((t) => t.key === 'requests_to_review')).toBe(
      false,
    );
  });

  it('reads the "to review" filter from the URL', () => {
    expect(parseFilters('work_orders', new URLSearchParams('to_review=true'))).toMatchObject({
      to_review: true,
    });
  });
});
