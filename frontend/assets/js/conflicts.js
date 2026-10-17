// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Supervisor conflict console (brief → Conflict management; docs/architecture.md → Conflicts).
// Conflict cues always combine color, an icon and text (brief → Accessibility).
import { fullPath } from './places.js';
import { codeFirst, h, replaceChildren } from './dom.js';
import { ENTITIES, fieldForApi } from './entities.js';
import { formatDateTime, isEmpty, personName, renderValue } from './format.js';
import { t, tn, tx } from './i18n.js';

const ENTITY_LABELS = { assets: t('Asset'), work_orders: t('Work order') };

/** URL of a conflicting record. */
const recordUrl = (conflict) => `${ENTITIES[conflict.entity_type].ui}/${conflict.entity_id}`;

/**
 * Rows of the comparison: every field of version B, with both values and whether they differ.
 * Pure, exported for tests.
 * @returns {{ field: string, label: string, a: unknown, b: unknown, divergent: boolean }[]}
 */
export function comparisonRows(conflict) {
  return Object.keys(conflict.version_b).map((field) => ({
    field,
    label: fieldForApi(conflict.entity_type, field)?.def.label ?? field,
    a: conflict.version_a[field] ?? null,
    b: conflict.version_b[field] ?? null,
    divergent: conflict.divergent_fields.includes(field),
  }));
}

/**
 * Fields to send for a manual merge: for each divergent field, the value of the version
 * chosen ('A' or 'B'). Pure, exported for tests.
 * @param {object} conflict
 * @param {Record<string, 'A' | 'B'>} choices
 */
export function mergeFields(conflict, choices) {
  return Object.fromEntries(
    conflict.divergent_fields.map((field) => [
      field,
      (choices[field] ?? 'A') === 'B' ? conflict.version_b[field] : conflict.version_a[field],
    ]),
  );
}

/**
 * Display of an API value in the comparison: names for people and assets, labels for codes.
 * @param {{ users: object[], assets: Map<number, object>, places?: object }} lookups `places`:
 *   placeIndex of the cached tree, for the path of a place (D82)
 */
export function displayValue(entityKey, apiField, value, lookups) {
  if (isEmpty(value)) return h('span', { class: 'no-value' }, t('No value'));
  const match = fieldForApi(entityKey, apiField);
  if (!match) return String(value);
  const { field, def } = match;
  if (def.type === 'user') {
    const user = lookups.users.find((u) => u.id === value);
    return user ? personName(user) : t('User #{value}', { value });
  }
  if (def.type === 'asset') {
    const asset = lookups.assets.get(value);
    return asset ? `${asset.code} — ${asset.name}` : t('Asset #{value}', { value });
  }
  if (def.type === 'plan') return t('Plan #{value}', { value });
  if (def.type === 'place') {
    const path = lookups.places ? fullPath(lookups.places, value) : '';
    return path || t('Place #{value}', { value });
  }
  return renderValue(field, def, value);
}

/** List of open conflicts. */
export function renderConflictList(container, items) {
  const rows = items.map((c) =>
    h(
      'tr',
      {},
      h(
        'td',
        {},
        h(
          'span',
          { class: 'badge badge-conflict badge-tone-warning' },
          h('span', { 'aria-hidden': 'true' }, '⚠'),
          t('Conflict'),
        ),
        ' ',
        h(
          'a',
          { href: `/conflicts/${c.id}`, 'data-link': true },
          codeFirst(c.label ?? `${ENTITY_LABELS[c.entity_type]} #${c.entity_id}`),
        ),
      ),
      h('td', {}, ENTITY_LABELS[c.entity_type]),
      h(
        'td',
        {},
        c.server_updated_by ? personName(c.server_updated_by) : '—',
        h('br'),
        h('span', { class: 'muted' }, formatDateTime(c.server_updated_at)),
      ),
      h(
        'td',
        {},
        personName(c.client_user),
        h('br'),
        h('span', { class: 'muted' }, formatDateTime(c.client_edited_at)),
      ),
      h('td', {}, formatDateTime(c.created_at)),
    ),
  );
  replaceChildren(
    container,
    h('h2', { class: 'table-title visually-hidden', tabindex: '-1' }, t('Open conflicts')),
    h(
      'p',
      { class: 'page-intro' },
      t(
        'Two people changed the same record at the same time. Compare both versions and choose what to keep.',
      ),
    ),
    items.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data-table conflict-list' },
            h(
              'caption',
              { class: 'visually-hidden' },
              tn(items.length, '{n} open conflict', '{n} open conflicts'),
            ),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                [
                  t('Record'),
                  t('Type'),
                  t('Version A (server)'),
                  t('Version B (rejected edit)'),
                  t('Detected'),
                ].map((label) => h('th', { scope: 'col' }, label)),
              ),
            ),
            h('tbody', {}, rows),
          ),
        )
      : h('p', { class: 'empty-state' }, t('No open conflict. Nothing to arbitrate.')),
  );
}

/**
 * Side-by-side arbitration of one conflict.
 * @param {HTMLElement} container
 * @param {object} conflict GET /api/conflicts/:id
 * @param {object} options
 * @param {{ users: object[], assets: Map<number, object> }} options.lookups
 * @param {(choice: 'A' | 'B' | 'MERGE', fields?: object) => void} options.onResolve
 * @param {string} [options.error] message of a refused resolution
 */
export function renderArbitration(container, conflict, { lookups, onResolve, error = '' }) {
  const rows = comparisonRows(conflict);
  const pickers = new Map();

  const tableRows = rows.map((row) => {
    let decision = h('span', { class: 'muted' }, t('Same value'));
    if (row.divergent) {
      const name = `pick-${row.field}`;
      const option = (value, text) => {
        const input = h('input', { type: 'radio', name, value, checked: value === 'A' });
        return h('label', { class: 'radio' }, input, text);
      };
      decision = h(
        'div',
        { role: 'radiogroup', 'aria-label': t('{label}: version to keep', { label: row.label }) },
        option('A', t('Keep A')),
        option('B', t('Keep B')),
      );
      pickers.set(row.field, decision);
    }
    return h(
      'tr',
      { class: row.divergent ? 'is-divergent' : null },
      h(
        'th',
        { scope: 'row' },
        row.label,
        row.divergent
          ? [
              ' ',
              h(
                'span',
                { class: 'badge badge-tone-warning badge-differs' },
                h('span', { 'aria-hidden': 'true' }, '≠'),
                t('Differs'),
              ),
            ]
          : null,
      ),
      h('td', {}, displayValue(conflict.entity_type, row.field, row.a, lookups)),
      h('td', {}, displayValue(conflict.entity_type, row.field, row.b, lookups)),
      h('td', {}, decision),
    );
  });

  const choices = () =>
    Object.fromEntries(
      [...pickers].map(([field, group]) => [
        field,
        group.querySelector('input:checked')?.value ?? 'A',
      ]),
    );
  const resolved = conflict.status !== 'OPEN';

  replaceChildren(
    container,
    h(
      'div',
      { class: 'arbitration-header' },
      h(
        'h2',
        { class: 'arbitration-title', tabindex: '-1' },
        h('span', { 'aria-hidden': 'true' }, '⚠ '),
        tx(
          conflict.entity_type === 'assets'
            ? 'Conflict on asset {record}'
            : 'Conflict on work order {record}',
          { record: h('a', { href: recordUrl(conflict), 'data-link': true }, conflict.label) },
        ),
      ),
      h('p', {}, h('a', { href: '/conflicts', 'data-link': true }, t('← All conflicts'))),
    ),
    error
      ? h(
          'div',
          { class: 'banner banner-danger', role: 'alert' },
          h('strong', {}, t('Not resolved. ')),
          error,
        )
      : null,
    resolved
      ? h(
          'div',
          { class: 'banner banner-info', role: 'note' },
          t('Resolved ({resolution}) by {person} on {resolved_at}.', {
            resolution: conflict.resolution === 'MERGE' ? t('merge') : conflict.resolution,
            person: conflict.resolved_by ? personName(conflict.resolved_by) : '—',
            resolved_at: formatDateTime(conflict.resolved_at),
          }),
        )
      : null,
    h(
      'dl',
      { class: 'versions' },
      h('dt', {}, t('Version A — server')),
      h(
        'dd',
        {},
        t('Saved by {person} on {server_updated_at}', {
          person: conflict.server_updated_by
            ? personName(conflict.server_updated_by)
            : t('unknown'),
          server_updated_at: formatDateTime(conflict.server_updated_at),
        }),
      ),
      h('dt', {}, t('Version B — rejected edit')),
      h(
        'dd',
        {},
        t('Made by {client_user} on {client_edited_at}, based on an older version', {
          client_user: personName(conflict.client_user),
          client_edited_at: formatDateTime(conflict.client_edited_at),
        }),
      ),
    ),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'data-table compare-table' },
        h(
          'caption',
          {},
          tn(
            conflict.divergent_fields.length,
            'Fields changed in version B ({n} differs from version A)',
            'Fields changed in version B ({n} differ from version A)',
          ),
        ),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            [t('Field'), t('Version A'), t('Version B'), t('Merge: keep')].map((label) =>
              h('th', { scope: 'col' }, label),
            ),
          ),
        ),
        h('tbody', {}, tableRows),
      ),
    ),
    resolved
      ? null
      : h(
          'div',
          { class: 'arbitration-actions' },
          h(
            'button',
            { type: 'button', class: 'button button-secondary', onClick: () => onResolve('A') },
            t('Accept version A'),
          ),
          h(
            'button',
            { type: 'button', class: 'button button-secondary', onClick: () => onResolve('B') },
            t('Accept version B'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'button button-primary',
              disabled: pickers.size === 0,
              onClick: () => onResolve('MERGE', mergeFields(conflict, choices())),
            },
            t('Merge the chosen values'),
          ),
        ),
  );
}

/** Words for the confirmation dialog. */
export function resolutionSummary(choice, conflict) {
  if (choice === 'A')
    return t('Keep version A for {label}. The edit made by {client_user} will be dropped.', {
      label: conflict.label,
      client_user: personName(conflict.client_user),
    });
  if (choice === 'B')
    return t(
      'Apply version B to {label}: the edit made by {client_user} replaces the server values.',
      { label: conflict.label, client_user: personName(conflict.client_user) },
    );
  return t('Save the values you chose for {label}.', { label: conflict.label });
}
