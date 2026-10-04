// Record history and the global audit log (docs/data-model.md → audit_log). Both read from
// the server, so they need a connection.
import { apiFetch } from './api.js';
import { displayValue } from './conflicts.js';
import { h, replaceChildren } from './dom.js';
import { ENTITIES, fieldForApi } from './entities.js';
import { formatDateTime, personName } from './format.js';

const ACTION_LABELS = {
  CREATE: 'Created',
  UPDATE: 'Changed',
  DELETE: 'Deleted',
  CONFLICT: 'Edit not applied (conflict)',
  RESOLVE: 'Conflict resolved',
};
const CHOICE_LABELS = { A: 'kept version A', B: 'applied version B', MERGE: 'merged' };
/** Fields shown in the summary of a creation (the full list would drown the timeline). */
const CREATION_SUMMARY = ['code', 'number', 'status', 'assignee_id'];

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
  const base = ACTION_LABELS[entry.action] ?? entry.action;
  return entry.action === 'RESOLVE' && entry.note?.choice
    ? `${base}: ${CHOICE_LABELS[entry.note.choice]}`
    : base;
}

/** Fields of an entry to list, status first (it tells the story of a work order). Pure. */
export function changedFields(entry) {
  const fields = Object.keys(entry.changes);
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
      const label = fieldForApi(entityKey, field)?.def.label ?? field;
      return h(
        'li',
        {},
        h('span', { class: 'change-field' }, `${label}: `),
        entry.action === 'CREATE'
          ? null
          : [
              displayValue(entityKey, field, from, lookups),
              h('span', { class: 'change-arrow' }, ' → '),
            ],
        displayValue(entityKey, field, to, lookups),
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

/** URL of a record in the log (deleted records have none). */
function recordLink(entry) {
  const label = entry.label;
  if (entry.action === 'DELETE' || entry.entity_type === 'users') return label;
  return h(
    'a',
    { href: `${ENTITIES[entry.entity_type].ui}/${entry.entity_id}`, 'data-link': true },
    label,
  );
}

/**
 * Global audit log page: type filter, table, pagination.
 * @param {HTMLElement} container
 * @param {{ data: object, entityType: string | null, lookups: object,
 *   onFilter: (type: string | null) => void, pagination: HTMLElement }} options
 */
export function renderAuditLog(container, { data, entityType, lookups, onFilter, pagination }) {
  const filter = h(
    'select',
    { id: 'audit-type', onChange: (event) => onFilter(event.target.value || null) },
    h('option', { value: '' }, 'All records'),
    h('option', { value: 'assets' }, 'Assets'),
    h('option', { value: 'work_orders' }, 'Work orders'),
  );
  filter.value = entityType ?? '';
  const rows = data.items.map((entry) =>
    h(
      'tr',
      {},
      h('td', { class: 'nowrap' }, formatDateTime(entry.at)),
      h('td', {}, entry.user ? personName(entry.user) : '—'),
      h('td', {}, recordLink(entry)),
      h('td', {}, entryTitle(entry)),
      h('td', {}, changeList(entry.entity_type, entry, lookups)),
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
