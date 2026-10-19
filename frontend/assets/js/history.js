// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Record history and the global audit log (docs/data-model.md → audit_log). Both read from
// the server, so they need a connection.
import { apiFetch } from './api.js';
import { displayValue } from './conflicts.js';
import { h, replaceChildren } from './dom.js';
import { ENTITIES, fieldForApi } from './entities.js';
import { formatDate, formatDateTime, formatHoursValue, personName } from './format.js';
import { valueLabel } from './labels.js';
import { PLANNING_FIELD_LABELS, planningFieldValue } from './planning.js';
import { t, tn } from './i18n.js';

const ACTION_LABELS = {
  CREATE: t('Created'),
  UPDATE: t('Changed'),
  DELETE: t('Deleted'),
  CONFLICT: t('Edit not applied (conflict)'),
  RESOLVE: t('Conflict resolved'),
};
const CHOICE_LABELS = { A: t('kept version A'), B: t('applied version B'), MERGE: t('merged') };
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
  username: t('Username'),
  first_name: t('First name'),
  last_name: t('Last name'),
  role: t('Role'),
  site: t('Site'),
  specialty: t('Specialty'),
  power_user: t('Auto-save'),
  is_active: t('Account active'),
};

/** Value of a user-account field, as text. Pure. */
export function userFieldValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return h('span', { class: 'no-value' }, t('No value'));
  }
  if (typeof value === 'boolean') return value ? t('Yes') : t('No');
  if (field === 'role') return valueLabel('role', value);
  if (field === 'specialty') return valueLabel('category', value);
  return String(value);
}

/** Blocks of the week scheduler (Phase 19). */
const ALLOCATION_FIELD_LABELS = {
  kind: t('Kind'),
  work_order_id: t('Work order'),
  technician_id: t('Person'),
  day: t('Day'),
  hours: t('Length'),
  locked_start: t('Appointment'),
  note: t('Note'),
};

/** Value of a block field, as text; people by name when the server named them. Pure. */
export function allocationFieldValue(field, value, lookups = { users: [] }) {
  if (value === null || value === undefined || value === '') {
    return h(
      'span',
      { class: 'no-value' },
      field === 'locked_start' ? t('Not locked') : t('No value'),
    );
  }
  if (field === 'kind') return valueLabel('allocation_kind', value);
  if (field === 'technician_id') {
    const person = lookups.users.find((u) => u.id === value);
    return person ? personName(person) : t('User #{value}', { value });
  }
  if (field === 'hours') return formatHoursValue(value);
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
  { value: 'assets', label: t('Assets') },
  { value: 'work_orders', label: t('Work orders') },
  { value: 'maintenance_plans', label: t('Maintenance plans') },
  { value: 'plan_occurrences', label: t('Plan visits') },
  { value: 'planning_settings', label: t('Planning settings') },
  { value: 'allocations', label: t('Scheduled blocks') },
  { value: 'users', label: t('User accounts'), adminOnly: true },
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
  if (entry.note?.password_reset) return t('Password reset by an administrator');
  if (entry.note?.password_changed) return t('Password changed by the user');
  // BR-W17: a status set by an admin outside the usual steps.
  if (entry.note?.status_override) return t('Status changed by an administrator (override)');
  const base = ACTION_LABELS[entry.action] ?? entry.action;
  return entry.action === 'RESOLVE' && entry.note?.choice
    ? t('{label}: {value}', { label: base, value: CHOICE_LABELS[entry.note.choice] })
    : base;
}

/** Labels of fields the records no longer have, or that no form shows (D82). */
const OTHER_FIELD_LABELS = {
  place: t('Place'),
  building: t('Building'),
  floor: t('Floor'),
  room_id: t('Room'),
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
        h('span', { class: 'change-field' }, t('{label}: ', { label })),
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
      : h('p', { class: 'muted' }, t('No change recorded yet.')),
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
        replaceChildren(body, h('p', { class: 'muted' }, t('Loading the history…')));
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
              err.status === 0 ? t('The history needs a connection to the server.') : err.message,
            ),
          );
        }
      },
    },
    h('summary', {}, t('History')),
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
    h('option', { value: '' }, t('All records')),
    AUDIT_TYPES.filter((type) => withUsers || !type.adminOnly).map((type) =>
      h('option', { value: type.value }, type.label),
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
    h('h2', { class: 'table-title visually-hidden', tabindex: '-1' }, t('Audit log')),
    h(
      'div',
      { class: 'filter-row' },
      h('label', { for: 'audit-type' }, t('Show')),
      filter,
      paginationTop,
      h('p', { class: 'table-count' }, tn(data.total, '{n} change', '{n} changes')),
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
              t('Audit log, page {page} of {pages}', { page: data.page, pages: data.pages }),
            ),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                [t('When'), t('Who'), t('Record'), t('What'), t('Changes')].map((label) =>
                  h('th', { scope: 'col' }, label),
                ),
              ),
            ),
            h('tbody', {}, rows),
          ),
        )
      : h('p', { class: 'empty-state' }, t('No change recorded yet.')),
    pagination,
  );
}
