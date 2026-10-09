// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  comparisonRows,
  displayValue,
  mergeFields,
  renderArbitration,
  renderConflictList,
} from '../assets/js/conflicts.js';

const conflict = {
  id: 7,
  entity_type: 'work_orders',
  entity_id: 37,
  label: 'WO-2026-00037 — Leak',
  status: 'OPEN',
  server_updated_at: '2026-10-04T08:00:00.000Z',
  server_updated_by: { id: 2, first_name: 'Julien', last_name: 'Bernard' },
  client_edited_at: '2026-10-04T08:05:00.000Z',
  client_user: { id: 4, first_name: 'Karim', last_name: 'Benali' },
  created_at: '2026-10-04T08:06:00.000Z',
  version_a: { status: 'ON_HOLD', work_report: null, assignee_id: 4, actual_hours: 2 },
  version_b: { status: 'CLOSED', work_report: 'Fuse replaced', actual_hours: 2 },
  divergent_fields: ['status', 'work_report'],
};
const lookups = { users: [{ id: 4, first_name: 'Karim', last_name: 'Benali' }], assets: new Map() };

let host;
beforeEach(() => {
  document.body.innerHTML = '<section id="host"></section>';
  host = document.getElementById('host');
});

describe('comparison', () => {
  it('lists every field of version B with both values', () => {
    expect(comparisonRows(conflict)).toEqual([
      { field: 'status', label: 'Status', a: 'ON_HOLD', b: 'CLOSED', divergent: true },
      { field: 'work_report', label: 'Work report', a: null, b: 'Fuse replaced', divergent: true },
      { field: 'actual_hours', label: 'Actual time', a: 2, b: 2, divergent: false },
    ]);
  });

  it('builds merge fields from the choices, A by default', () => {
    expect(mergeFields(conflict, { work_report: 'B' })).toEqual({
      status: 'ON_HOLD',
      work_report: 'Fuse replaced',
    });
    expect(mergeFields(conflict, { status: 'B', work_report: 'B' })).toEqual({
      status: 'CLOSED',
      work_report: 'Fuse replaced',
    });
  });

  it('shows names, labels and "No value"', () => {
    expect(displayValue('work_orders', 'assignee_id', 4, lookups)).toBe('Karim Benali');
    expect(displayValue('work_orders', 'assignee_id', 9, lookups)).toBe('User #9');
    expect(displayValue('work_orders', 'status', 'ON_HOLD', lookups).textContent).toBe('On hold');
    expect(displayValue('work_orders', 'work_report', null, lookups).textContent).toBe('No value');
  });
});

describe('renderArbitration', () => {
  it('marks divergent fields with color, icon and text, and offers a choice for each', () => {
    renderArbitration(host, conflict, { lookups, onResolve() {} });
    const divergent = host.querySelectorAll('tr.is-divergent');
    expect(divergent).toHaveLength(2);
    expect(divergent[0].querySelector('.badge-differs').textContent).toBe('≠Differs');
    expect(host.querySelectorAll('[role="radiogroup"]')).toHaveLength(2);
    expect(host.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe(
      'Status: version to keep',
    );
    expect(host.textContent).toContain('Saved by Julien Bernard');
    expect(host.textContent).toContain('Made by Karim Benali');
  });

  it('sends A, B, or the merged values', () => {
    const onResolve = vi.fn();
    renderArbitration(host, conflict, { lookups, onResolve });
    const button = (text) =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === text);
    button('Accept version A').click();
    expect(onResolve).toHaveBeenLastCalledWith('A');
    button('Accept version B').click();
    expect(onResolve).toHaveBeenLastCalledWith('B');
    host.querySelector('input[name="pick-work_report"][value="B"]').click();
    button('Merge the chosen values').click();
    expect(onResolve).toHaveBeenLastCalledWith('MERGE', {
      status: 'ON_HOLD',
      work_report: 'Fuse replaced',
    });
  });

  it('shows a refused resolution and hides the actions once resolved', () => {
    renderArbitration(host, conflict, {
      lookups,
      onResolve() {},
      error: 'The status cannot change.',
    });
    expect(host.querySelector('[role="alert"]').textContent).toContain('The status cannot change.');
    renderArbitration(
      host,
      {
        ...conflict,
        status: 'RESOLVED',
        resolution: 'A',
        resolved_by: { first_name: 'Julien', last_name: 'Bernard' },
        resolved_at: '2026-10-04T09:00:00.000Z',
      },
      { lookups, onResolve() {} },
    );
    expect(host.querySelector('.arbitration-actions')).toBeNull();
    expect(host.textContent).toContain('Resolved (A) by Julien Bernard');
  });
});

describe('renderConflictList', () => {
  it('lists conflicts with a text badge and a link to each', () => {
    renderConflictList(host, [conflict]);
    expect(host.querySelector('tbody .badge-conflict').textContent).toBe('⚠Conflict');
    expect(host.querySelector('tbody a').getAttribute('href')).toBe('/conflicts/7');
    renderConflictList(host, []);
    expect(host.querySelector('.empty-state').textContent).toMatch(/No open conflict/);
  });
});
