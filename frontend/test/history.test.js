// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changedFields,
  entryTitle,
  historySection,
  renderAuditLog,
  renderTimeline,
  withPeople,
} from '../assets/js/history.js';
import { reportOnline } from '../assets/js/network.js';
import { parseRoute } from '../assets/js/router.js';

const lookups = { users: [{ id: 4, first_name: 'Karim', last_name: 'Benali' }], assets: new Map() };
const entry = (o) => ({
  id: 1,
  action: 'UPDATE',
  changes: {},
  note: null,
  at: '2026-10-04T08:00:00.000Z',
  user: { id: 4, first_name: 'Karim', last_name: 'Benali' },
  ...o,
});

describe('entries', () => {
  it('names each action, with the choice of a resolution', () => {
    expect(entryTitle(entry({ action: 'CREATE' }))).toBe('Created');
    expect(entryTitle(entry({ action: 'CONFLICT' }))).toBe('Edit not applied (conflict)');
    expect(entryTitle(entry({ action: 'RESOLVE', note: { choice: 'MERGE' } }))).toBe(
      'Conflict resolved: merged',
    );
  });

  it('lists status first, and only key fields for a creation', () => {
    const update = entry({
      changes: { comment: { from: null, to: 'x' }, status: { from: 'OPEN', to: 'IN_PROGRESS' } },
    });
    expect(changedFields(update)).toEqual(['status', 'comment']);
    const created = entry({
      action: 'CREATE',
      changes: { number: { to: 'WO-1' }, title: { to: 'Leak' }, status: { to: 'OPEN' } },
    });
    expect(changedFields(created)).toEqual(['status', 'number']);
  });
});

describe('renderTimeline', () => {
  it('shows who, when and each change from → to, with labels', () => {
    document.body.innerHTML = '<div id="t"></div>';
    const container = document.getElementById('t');
    renderTimeline(
      container,
      'work_orders',
      [
        entry({
          changes: {
            status: { from: 'OPEN', to: 'IN_PROGRESS' },
            assignee_id: { from: null, to: 4 },
          },
        }),
      ],
      lookups,
    );
    const item = container.querySelector('.timeline-entry');
    expect(item.querySelector('.timeline-head').textContent).toMatch(
      /^Changed · .* · Karim Benali$/,
    );
    const changes = [...item.querySelectorAll('.change-list li')].map((li) => li.textContent);
    expect(changes).toEqual(['Status: Open → In progress', 'Assignee: No value → Karim Benali']);
    renderTimeline(container, 'assets', [], lookups);
    expect(container.textContent).toBe('No change recorded yet.');
  });
});

describe('historySection', () => {
  beforeEach(() => {
    localStorage.clear();
    reportOnline();
  });
  afterEach(() => {
    reportOnline();
    vi.unstubAllGlobals();
  });

  it('loads the history the first time it is opened', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [entry({ action: 'CREATE', changes: { code: { from: null, to: 'AST-0001' } } })],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const getLookups = vi.fn(async () => lookups);
    const section = historySection('assets', 1, getLookups);
    document.body.replaceChildren(section);
    section.open = true;
    section.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(section.querySelector('.timeline')).not.toBeNull());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/assets/1/history');
    expect(getLookups).toHaveBeenCalledWith([expect.objectContaining({ action: 'CREATE' })]);
    section.dispatchEvent(new Event('toggle'));
    expect(fetchMock).toHaveBeenCalledOnce(); // loaded once
  });

  it('says the history needs a connection when offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const section = historySection('work_orders', 3, async () => lookups);
    document.body.replaceChildren(section);
    section.open = true;
    section.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(section.textContent).toContain('needs a connection'));
  });
});

describe('withPeople', () => {
  it('adds the names sent by the server without duplicates', () => {
    const merged = withPeople(lookups, {
      4: { id: 4, first_name: 'K', last_name: 'B' },
      2: { id: 2, first_name: 'Julien', last_name: 'Bernard' },
    });
    expect(merged.users.map((u) => u.id)).toEqual([4, 2]);
    expect(withPeople(lookups).users).toHaveLength(1);
  });
});

describe('audit log route', () => {
  it('parses the page and a known type only', () => {
    expect(parseRoute('/audit-log', '?type=assets&page=2')).toEqual({
      name: 'audit',
      page: 2,
      entityType: 'assets',
    });
    expect(parseRoute('/audit-log', '?type=bogus')).toEqual({
      name: 'audit',
      page: 1,
      entityType: null,
    });
  });
});

describe('user accounts in the audit log (admins, D39)', () => {
  const data = (items) => ({ items, total: items.length, page: 1, pages: 1 });
  const account = entry({
    entity_type: 'users',
    entity_id: 9,
    label: 'Eve Tester (e2e.tech)',
    changes: {
      role: { from: 'TECHNICIAN', to: 'SUPERVISOR' },
      is_active: { from: true, to: false },
    },
  });

  it('shows user fields with labels, links to the account, titles password changes', () => {
    const container = document.createElement('div');
    renderAuditLog(container, {
      data: data([
        account,
        entry({ entity_type: 'users', entity_id: 9, label: 'x', note: { password_reset: true } }),
      ]),
      entityType: null,
      lookups,
      withUsers: true,
      onFilter: () => {},
      pagination: null,
    });
    const text = container.textContent;
    expect(text).toContain('Role: Technician → Supervisor');
    expect(text).toContain('Account active: Yes → No');
    expect(text).toContain('Password reset by an administrator');
    expect(container.querySelector('a[href="/admin/users/9"]')).not.toBeNull();
    expect(container.querySelector('option[value="users"]')).not.toBeNull();
  });

  it('offers the "User accounts" filter to admins only', () => {
    const container = document.createElement('div');
    renderAuditLog(container, {
      data: data([]),
      entityType: null,
      lookups,
      onFilter: () => {},
      pagination: null,
    });
    expect(container.querySelector('option[value="users"]')).toBeNull();
    expect(parseRoute('/audit-log', '?type=users').entityType).toBe('users');
  });
});
