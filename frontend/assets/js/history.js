// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Record history and the global audit log (docs/data-model.md → audit_log). Both read from
// the server, so they need a connection.
import { apiFetch } from './api.js';
import { displayValue } from './conflicts.js';
import { h, replaceChildren } from './dom.js';
import { ENTITIES, fieldForApi } from './entities.js';
import { formatDate, formatDateTime, personName } from './format.js';
import { valueLabel } from './labels.js';
import { PLANNING_FIELD_LABELS, planningFieldValue } from './planning.js';

const ACTION_LABELS = {
  CREATE: 'Created',
  UPDATE: 'Changed',
  DELETE: 'Deleted',
  CONFLICT: 'Edit not applied (conflict)',
  RESOLVE: 'Conflict resolved',
};
const CHOICE_LABELS = { A: 'kept version A', B: 'applied version B', MERGE: 'merged' };
/** Fields shown in the summary of a creation (the full list would drown the timeline). */
const CREATION_SUMMARY = [
  'code',
  'number',
  'status',
  'assignee_id',
  'username',
  'role',
  // Blocks of the week scheduler (Phase 19).
  'technician_id',
  'day',
  'hours',
];
/** User accounts are not a table entity: their labels live here (admins only, D39). */
const USER_FIELD_LABELS = {
  username: 'Username',
  first_name: 'First name',
  last_name: 'Last name',
  role: 'Role',
  site: 'Site',
  specialty: 'Specialty',
  power_user: 'Auto-save',
  is_active: 'Account active',
};

/** Value of a user-account field, as text. Pure. */
export function userFieldValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return h('span', { class: 'no-value' }, 'No value');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field === 'role') return valueLabel('role', value);
  if (field === 'specialty') return valueLabel('category', value);
  return String(value);
}

/** Blocks of the week scheduler (Phase 19). */
const ALLOCATION_FIELD_LABELS = {
  kind: 'Kind',
  work_order_id: 'Work order',
  technician_id: 'Person',
  day: 'Day',
  hours: 'Length',
  locked_start: 'Appointment',
  note: 'Note',
};

/** Value of a block field, as text; people by name when the server named them. Pure. */
export function allocationFieldValue(field, value, lookups = { users: [] }) {
  if (value === null || value === undefined || value === '') {
    return h('span', { class: 'no-value' }, field === 'locked_start' ? 'Not locked' : 'No value');
  }
  if (field === 'kind') return valueLabel('allocation_kind', value);
  if (field === 'technician_id') {
    const person = lookups.users.find((u) => u.id === value);
    return person ? personName(person) : `User #${value}`;
  }
  if (field === 'hours') return `${value} h`;
  if (field === 'work_order_id') return `#${value}`;
  if (field === 'day') return formatDate(value);
  return String(value);
}

/**
 * Records that are not a table entity (no field definitions in entities.js): their labels
 * and values. User accounts are for admins only (D39); planning records come with D48.
 */
const OTHER_RECORDS = {
  users: { labels: USER_FIELD_LABELS, value: userFieldValue, url: (id) => `/admin/users/${id}` },
  maintenance_plans: {
    labels: PLANNING_FIELD_LABELS,
    value: planningFieldValue,
    url: (id) => `/planning/plans/${id}`,
  },
  plan_occurrences: { labels: PLANNING_FIELD_LABELS, value: planningFieldValue, url: null },
  planning_settings: {
    labels: PLANNING_FIELD_LABELS,
    value: planningFieldValue,
    url: () => '/admin/planning',
  },
  allocations: { labels: ALLOCATION_FIELD_LABELS, value: allocationFieldValue, url: null },
};

/** Record types of the audit log filter, in display order. */
export const AUDIT_TYPES = [
  { value: 'assets', label: 'Assets' },
  { value: 'work_orders', label: 'Work orders' },
  { value: 'maintenance_plans', label: 'Maintenance plans' },
  { value: 'plan_occurrences', label: 'Plan visits' },
  { value: 'planning_settings', label: 'Planning settings' },
  { value: 'allocations', label: 'Scheduled blocks' },
  { value: 'users', label: 'User accounts', adminOnly: true },
];

/** Adds the people named by the server to the lookups (names instead of "User #id"). */
export function withPeople(lookups, people = {}) {
  const known = new Set(lookups.users.map((u) => u.id));
  return {
    ...lookups,
    users: [...lookups.users, ...Object.values(people).filter((p) => !known.has(p.id))],
  };
}

/** Title of an entry, e.g. "Conflict resolved: merged". Pure. */
export function entryTitle(entry) {
  if (entry.note?.password_reset) return 'Password reset by an administrator';
  if (entry.note?.password_changed) return 'Password changed by the user';
  const base = ACTION_LABELS[entry.action] ?? entry.action;
  return entry.action === 'RESOLVE' && entry.note?.choice
    ? `${base}: ${CHOICE_LABELS[entry.note.choice]}`
    : base;
}

/** Labels of fields the records no longer have, or that no form shows (D82). */
const OTHER_FIELD_LABELS = {
  place: 'Place',
  building: 'Building',
  floor: 'Floor',
  room_id: 'Room',
};

/**
 * Fields of an entry to list, status first (it tells the story of a work order). A place's
 * id is left out when its path is there (D82). Pure.
 */
export function changedFields(entry) {
  const fields = Object.keys(entry.changes).filter(
    (f) => !(f === 'location_id' && 'place' in entry.changes),
  );
  const shown =
    entry.action === 'CREATE' ? fields.filter((f) => CREATION_SUMMARY.includes(f)) : fields;
  return shown.sort((a, b) => (a === 'status' ? -1 : b === 'status' ? 1 : 0));
}

function changeList(entityKey, entry, lookups) {
  const fields = changedFields(entry);
  if (!fields.length) return null;
  return h(
    'ul',
    { class: 'change-list' },
    fields.map((field) => {
      const { from, to } = entry.changes[field];
      const other = OTHER_RECORDS[entityKey];
      const label = other
        ? (other.labels[field] ?? field)
        : (fieldForApi(entityKey, field)?.def.label ?? OTHER_FIELD_LABELS[field] ?? field);
      const show = (value) =>
        other ? other.value(field, value, lookups) : displayValue(entityKey, field, value, lookups);
      return h(
        'li',
        {},
        h('span', { class: 'change-field' }, `${label}: `),
        entry.action === 'CREATE'
          ? null
          : [show(from), h('span', { class: 'change-arrow' }, ' → ')],
        show(to),
      );
    }),
  );
}

/** Timeline of one record, newest first. */
export function renderTimeline(container, entityKey, entries, lookups) {
  replaceChildren(
    container,
    entries.length
      ? h(
          'ol',
          { class: 'timeline' },
          entries.map((entry) =>
            h(
              'li',
              { class: `timeline-entry action-${entry.action.toLowerCase()}` },
              h(
                'p',
                { class: 'timeline-head' },
                h('strong', {}, entryTitle(entry)),
                ` · ${formatDateTime(entry.at)}${entry.user ? ` · ${personName(entry.user)}` : ''}`,
              ),
              changeList(entityKey, entry, lookups),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'No change recorded yet.'),
  );
}

/**
 * Collapsed "History" section for a record panel, loaded when opened.
 * @param {string} entityKey 'assets' | 'work_orders'
 * @param {number} id
 * @param {(entries: object[]) => Promise<object>} getLookups names of people and assets
 */
export function historySection(entityKey, id, getLookups) {
  const body = h('div', { class: 'history-body', 'aria-live': 'polite' });
  let loaded = false;
  const section = h(
    'details',
    {
      class: 'history',
      onToggle: async () => {
        if (!section.open || loaded) return;
        replaceChildren(body, h('p', { class: 'muted' }, 'Loading the history…'));
        try {
          const { items, people } = await apiFetch(`${ENTITIES[entityKey].api}/${id}/history`);
          renderTimeline(body, entityKey, items, withPeople(await getLookups(items), people));
          loaded = true;
        } catch (err) {
          replaceChildren(
            body,
            h(
              'p',
              { class: 'muted' },
              err.status === 0 ? 'The history needs a connection to the server.' : err.message,
            ),
          );
        }
      },
    },
    h('summary', {}, 'History'),
    body,
  );
  return section;
}

/**
 * Label of a record in the log. Block labels end with their day in ISO form
 * ("WO-2026-00259 · Lucas Moreau · 2026-10-13"), written like the other dates (DT11). Pure.
 */
export function recordLabel(entry) {
  if (entry.entity_type !== 'allocations') return entry.label;
  return entry.label.replace(/ · (\d{4}-\d{2}-\d{2})$/, (_, day) => ` · ${formatDate(day)}`);
}

/** URL of a record in the log (deleted records have none). */
function recordLink(entry) {
  const label = recordLabel(entry);
  if (entry.action === 'DELETE') return label;
  const other = OTHER_RECORDS[entry.entity_type];
  const url = other
    ? other.url?.(entry.entity_id)
    : `${ENTITIES[entry.entity_type].ui}/${entry.entity_id}`;
  return url ? h('a', { href: url, 'data-link': true }, label) : label;
}

/**
 * Global audit log page: type filter, table, pagination.
 * @param {HTMLElement} container
 * @param {{ data: object, entityType: string | null, lookups: object,
 *   withUsers?: boolean, onFilter: (type: string | null) => void, pagination: HTMLElement | null,
 *   paginationTop: HTMLElement | null }} options
 */
export function renderAuditLog(
  container,
  { data, entityType, lookups, withUsers = false, onFilter, pagination, paginationTop },
) {
  const filter = h(
    'select',
    { id: 'audit-type', onChange: (event) => onFilter(event.target.value || null) },
    h('option', { value: '' }, 'All records'),
    AUDIT_TYPES.filter((t) => withUsers || !t.adminOnly).map((t) =>
      h('option', { value: t.value }, t.label),
    ),
  );
  filter.value = entityType ?? '';
  const rows = data.items.map((entry) =>
    h(
      'tr',
      {},
      // Classes place each cell on the phone card (components.css).
      h('td', { class: 'nowrap audit-when' }, formatDateTime(entry.at)),
      h('td', { class: 'audit-who' }, entry.user ? personName(entry.user) : '—'),
      h('td', { class: 'audit-record' }, recordLink(entry)),
      h('td', { class: 'audit-what' }, entryTitle(entry)),
      h('td', { class: 'audit-changes' }, changeList(entry.entity_type, entry, lookups)),
    ),
  );
  replaceChildren(
    container,
    h('h2', { class: 'table-title visually-hidden', tabindex: '-1' }, 'Audit log'),
    h(
      'div',
      { class: 'filter-row' },
      h('label', { for: 'audit-type' }, 'Show'),
      filter,
      paginationTop,
      h('p', { class: 'table-count' }, `${data.total} change${data.total === 1 ? '' : 's'}`),
    ),
    data.items.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data-table audit-table' },
            h(
              'caption',
              { class: 'visually-hidden' },
              `Audit log, page ${data.page} of ${data.pages}`,
            ),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ['When', 'Who', 'Record', 'What', 'Changes'].map((t) =>
                  h('th', { scope: 'col' }, t),
                ),
              ),
            ),
            h('tbody', {}, rows),
          ),
        )
      : h('p', { class: 'empty-state' }, 'No change recorded yet.'),
    pagination,
  );
}
