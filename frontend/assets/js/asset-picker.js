// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Asset picker: a dialog to find an asset without knowing its code, with search, filters,
// sortable columns and pages (GET /api/assets). Used by the plan form and the work order
// form. Needs a connection: the button that opens it is `.online-only`.
import { h, replaceChildren } from './dom.js';
import { ASSET_STATUSES, CATEGORIES } from './enums.js';
import { badge } from './format.js';
import { valueLabel } from './labels.js';
import { renderPagination } from './table.js';

export const PICKER_PAGE_SIZE = 20;

/** Columns of the picker; `sort`: the API sort key, when the column can be sorted. */
export const PICKER_COLUMNS = [
  { key: 'code', label: 'Code', sort: 'code' },
  { key: 'name', label: 'Name', sort: 'name' },
  { key: 'location', label: 'Location' },
  { key: 'site', label: 'Site', sort: 'site' },
  { key: 'category', label: 'Trade', sort: 'category' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'criticality', label: 'Criticality', sort: 'criticality' },
];

/** Query of GET /api/assets for the picker's state. Pure. */
export function pickerQuery({ q, site, category, status, sort = 'code', order = 'asc', page = 1 }) {
  const query = new URLSearchParams({ page: String(page), size: String(PICKER_PAGE_SIZE) });
  if (sort !== 'code' || order !== 'asc') {
    query.set('sort', sort);
    query.set('order', order);
  }
  if (q) query.set('q', q);
  // Site names may contain commas: the API separates several sites with "|" (one here).
  if (site) query.set('site', site);
  if (category) query.set('category', category);
  if (status) query.set('status', status);
  return query.toString();
}

/** Sort after a click on a column title: ascending, then descending on a second click. Pure. */
export function nextSort(state, key) {
  return {
    sort: key,
    order: state.sort === key && state.order === 'asc' ? 'desc' : 'asc',
    page: 1,
  };
}

/** "Tower A › L3 · Plant room" from the place (D82) and the exact location. Pure. */
export function assetLocation(asset) {
  return [asset.place, asset.exact_location].filter(Boolean).join(' · ');
}

/**
 * Opens the picker and resolves with the chosen asset, or null when closed without a choice.
 * @param {object} options
 * @param {HTMLDialogElement} options.dialog
 * @param {(query: string) => Promise<{ total: number, page: number, pages: number, items: object[] }>} options.fetchPage
 * @param {string[]} [options.sites] for the site filter
 * @param {{ q?: string, site?: string, category?: string, status?: string }} [options.initial]
 * @returns {Promise<object | null>}
 */
export function openAssetPicker({ dialog, fetchPage, sites = [], initial = {} }) {
  let state = { sort: 'code', order: 'asc', page: 1, ...initial };
  let requestSeq = 0;
  const results = h('div', { class: 'asset-picker-results', 'aria-live': 'polite' });
  const opener = document.activeElement;

  return new Promise((resolve) => {
    const finish = (asset) => {
      dialog.close();
      resolve(asset);
      if (opener instanceof HTMLElement) opener.focus();
    };

    const select = (key, label, options) => {
      const control = h(
        'select',
        {
          id: `asset-picker-${key}`,
          onChange: (e) => load({ ...state, [key]: e.target.value || undefined, page: 1 }),
        },
        h('option', { value: '' }, 'All'),
        options.map(([value, text]) => h('option', { value }, text)),
      );
      control.value = state[key] ?? '';
      return h('div', { class: 'filter-field' }, h('label', { for: control.id }, label), control);
    };

    let searchTimer;
    const search = h('input', {
      id: 'asset-picker-q',
      type: 'search',
      value: state.q ?? '',
      placeholder: 'Code, name, place, location, brand…',
      autocomplete: 'off',
      onInput: (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(
          () => load({ ...state, q: e.target.value.trim() || undefined, page: 1 }),
          300,
        );
      },
    });

    function table(data) {
      const header = PICKER_COLUMNS.map((col) => {
        if (!col.sort) return h('th', { scope: 'col' }, col.label);
        const active = state.sort === col.sort;
        return h(
          'th',
          {
            scope: 'col',
            'aria-sort': active ? (state.order === 'asc' ? 'ascending' : 'descending') : null,
          },
          h(
            'button',
            {
              type: 'button',
              class: 'sort-button',
              dataset: { sort: col.sort },
              onClick: () => load({ ...state, ...nextSort(state, col.sort) }),
            },
            col.label,
            h(
              'span',
              { class: 'sort-arrow', 'aria-hidden': 'true' },
              active ? (state.order === 'asc' ? ' ▲' : ' ▼') : ' ↕',
            ),
          ),
        );
      });
      const rows = data.items.map((asset) =>
        h(
          'tr',
          { class: asset.status === 'BROKEN_DOWN' ? 'is-broken-down' : null },
          h('td', { class: 'nowrap' }, h('strong', {}, asset.code)),
          h('td', {}, asset.name),
          h('td', {}, assetLocation(asset) || '—'),
          h('td', {}, asset.site),
          h(
            'td',
            {},
            valueLabel('category', asset.category),
            asset.subcategory ? h('span', { class: 'asset-picker-sub' }, asset.subcategory) : null,
          ),
          h('td', {}, badge('status', 'asset_status', asset.status)),
          h('td', {}, badge('criticality', 'criticality', asset.criticality)),
          h(
            'td',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'button button-secondary',
                'aria-label': `Choose ${asset.code} — ${asset.name}`,
                onClick: () => finish(asset),
              },
              'Choose',
            ),
          ),
        ),
      );
      return [
        h(
          'p',
          { class: 'muted asset-picker-count' },
          `${data.total} asset${data.total === 1 ? '' : 's'}`,
        ),
        data.items.length
          ? h(
              'div',
              { class: 'table-scroll' },
              h(
                'table',
                { class: 'data-table asset-picker-table' },
                h(
                  'caption',
                  { class: 'visually-hidden' },
                  `Assets, page ${data.page} of ${data.pages}`,
                ),
                h('thead', {}, h('tr', {}, header, h('th', { scope: 'col' }, 'Choose'))),
                h('tbody', {}, rows),
              ),
            )
          : h('p', { class: 'empty-state' }, 'No asset matches this search.'),
        data.pages > 1 ? renderPagination(data, (page) => load({ ...state, page })) : null,
      ];
    }

    async function load(next) {
      state = next;
      const seq = ++requestSeq;
      results.setAttribute('aria-busy', 'true');
      try {
        const data = await fetchPage(pickerQuery(state));
        if (seq !== requestSeq) return;
        // Keep focus on the control used (sort title or page button), now redrawn.
        const used = document.activeElement?.dataset;
        replaceChildren(results, table(data));
        if (used?.sort) results.querySelector(`[data-sort="${used.sort}"]`)?.focus();
        if (used?.pager) results.querySelector(`[data-pager="${used.pager}"]`)?.focus();
      } catch (err) {
        if (seq !== requestSeq) return;
        replaceChildren(
          results,
          h(
            'p',
            { class: 'error-state', role: 'alert' },
            err.status === 0 ? 'The asset list needs a connection to the server.' : err.message,
          ),
        );
      } finally {
        if (seq === requestSeq) results.removeAttribute('aria-busy');
      }
    }

    replaceChildren(
      dialog,
      h(
        'div',
        { class: 'asset-picker-head' },
        h('h2', { id: 'asset-dialog-title', class: 'dialog-title' }, 'Choose an asset'),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-button',
            'aria-label': 'Close without choosing',
            onClick: () => finish(null),
          },
          h('span', { 'aria-hidden': 'true' }, '✕'),
        ),
      ),
      h(
        'div',
        { class: 'filter-bar asset-picker-filters', role: 'search' },
        h('div', { class: 'filter-field' }, h('label', { for: search.id }, 'Search'), search),
        select(
          'site',
          'Site',
          sites.map((s) => [s, s]),
        ),
        select(
          'category',
          'Trade',
          CATEGORIES.map((c) => [c, valueLabel('category', c)]),
        ),
        select(
          'status',
          'Status',
          ASSET_STATUSES.map((s) => [s, valueLabel('asset_status', s)]),
        ),
      ),
      results,
    );
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    dialog.showModal();
    search.focus();
    load(state);
  });
}
