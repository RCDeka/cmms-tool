// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Paginated table (brief → Table rendering; docs/ui-guidelines.md → Table rows, Accessibility).
import { h, replaceChildren } from './dom.js';
import { ENTITIES } from './entities.js';
import { isEmpty, renderValue, workOrderStatus } from './format.js';
import { t, tn } from './i18n.js';

/** Row ids are numbers, or `tmp-<uuid>` strings for creations not yet on the server. */
export const parseRowId = (value) => (/^\d+$/.test(value) ? Number(value) : value);

/**
 * Renders a page of records with its pagination controls.
 * @param {HTMLElement} container
 * @param {object} options
 * @param {string} options.entity 'assets' | 'work_orders'
 * @param {{ total: number, page: number, pages: number, items: object[] }} options.data
 * @param {number | null} options.selectedId row shown in the detail panel
 * @param {(id: number) => void} options.onOpen
 * @param {(page: number, control: string) => void} options.onPage
 * @param {{ sort: string, order: 'asc' | 'desc' }} [options.sort] order of the rows
 * @param {(column: string) => void} [options.onSort] click on a sortable column title
 * @param {object[]} [options.pinned] records shown first (work orders waiting to be created)
 * @param {HTMLElement[]} [options.actions] buttons next to the record count
 * @param {boolean} [options.filtered] search or filters are applied
 */
export function renderTable(
  container,
  {
    entity,
    data,
    selectedId,
    onOpen,
    onPage,
    sort = null,
    onSort = null,
    pinned = [],
    actions = [],
    filtered = false,
  },
) {
  const cfg = ENTITIES[entity];
  const titleId = `${cfg.prefix}-table-title`;
  const rows = [...pinned, ...data.items].map((record) =>
    renderRow(cfg, record, record.id === selectedId),
  );
  // Roving tabindex: one row is in the tab order, arrow keys move between rows.
  const tabbable = rows.find((row) => row.classList.contains('is-selected')) ?? rows[0];
  if (tabbable) tabbable.tabIndex = 0;

  const tbody = h(
    'tbody',
    {
      onKeydown: (event) => onRowKeydown(event, onOpen),
      onClick: (event) => {
        const row = event.target.closest('tr[data-id]');
        if (row && !event.target.closest('a, button')) onOpen(parseRowId(row.dataset.id));
      },
    },
    rows,
  );

  const table = h(
    'table',
    { class: `data-table ${cfg.prefix}-table`, 'aria-describedby': `${cfg.prefix}-table-help` },
    h(
      'caption',
      { class: 'visually-hidden' },
      t('{label}, page {page} of {pages}', {
        label: cfg.label,
        page: data.page,
        pages: data.pages,
      }),
    ),
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        cfg.columns.map((f) => columnHeader(cfg, f, sort, onSort)),
      ),
    ),
    tbody,
  );

  replaceChildren(
    container,
    h(
      'div',
      { class: 'table-header' },
      // The h1 already shows the section name; the h2 stays for screen readers and focus.
      h('h2', { id: titleId, class: 'table-title visually-hidden', tabindex: '-1' }, cfg.label),
      // Page buttons above long tables too, so changing page needs no scrolling.
      renderPagination(data, onPage, 'top'),
      h(
        'p',
        { class: 'table-count', role: 'status' },
        filtered
          ? tn(data.total, '{n} matching record', '{n} matching records')
          : tn(data.total, '{n} record', '{n} records'),
      ),
      actions,
    ),
    h(
      'p',
      { id: `${cfg.prefix}-table-help`, class: 'visually-hidden' },
      t('Use the up and down arrow keys to move between rows, and Enter to open one.'),
    ),
    rows.length
      ? h('div', { class: 'table-scroll' }, table)
      : h('p', { class: 'empty-state' }, filtered ? cfg.noMatch : cfg.emptyPage),
    renderPagination(data, onPage),
  );
}

const SORT_ARROWS = { ascending: '▲', descending: '▼', none: '↕' };

/**
 * Column title. Sortable columns hold a button; the sorted one has `aria-sort` and an arrow
 * (▲ ascending, ▼ descending), the others a faint ↕.
 */
function columnHeader(cfg, field, sort, onSort) {
  const label = cfg.fields[field].label;
  const attrs = { scope: 'col', class: columnClass(cfg, field) };
  if (!onSort || !cfg.sortColumns.includes(field)) return h('th', attrs, label);
  const state =
    sort?.sort === field ? (sort.order === 'desc' ? 'descending' : 'ascending') : 'none';
  const classes = ['sortable', attrs.class].filter(Boolean).join(' ');
  return h(
    'th',
    { ...attrs, class: classes, 'aria-sort': state === 'none' ? null : state },
    h(
      'button',
      {
        type: 'button',
        class: `sort-button is-${state}`,
        dataset: { sort: field },
        onClick: () => onSort(field),
      },
      label,
      h('span', { class: 'sort-arrow', 'aria-hidden': 'true' }, SORT_ARROWS[state]),
    ),
  );
}

/** Focuses a column title button after a sort, or returns false. */
export function focusSortButton(container, column) {
  // Column names come from the entity config: safe inside the attribute selector.
  const button = container.querySelector(`[data-sort="${column}"]`);
  button?.focus();
  return Boolean(button);
}

/**
 * Every column gets `col-<field>` (fixed widths, table.css); columns hidden in split view also
 * get `col-secondary` (layout.css).
 */
function columnClass(cfg, field) {
  const name = `col-${field.replaceAll('_', '-')}`;
  return cfg.splitColumns.includes(field) ? name : `${name} col-secondary`;
}

function renderRow(cfg, record, selected) {
  const classes = ['table-row'];
  if (selected) classes.push('is-selected');
  if (record.has_conflict) classes.push('has-conflict');
  if (cfg.key === 'assets' && record.status === 'BROKEN_DOWN') classes.push('is-broken-down');
  if (record._pending || record._pendingCreate) classes.push('is-pending');

  const cells = cfg.columns.map((field, index) =>
    h(
      'td',
      {
        class: columnClass(cfg, field),
        // Phones show the due date of a work order card as "Due 23 Oct 2026" (table.css).
        dataset: field === 'due_on' ? { before: `${t('card|Due')} ` } : undefined,
      },
      // Conflict: color + icon + text, never color alone (brief → Accessibility).
      index === 0 && record.has_conflict ? conflictMarker() : null,
      index === 0 && record._pendingCreate ? pendingMarker(t('Pending creation')) : null,
      index === 0 && record._pending && !record._pendingCreate
        ? pendingMarker(t('Pending sync'))
        : null,
      isEmpty(record[field])
        ? ''
        : cfg.key === 'work_orders' && field === 'status'
          ? workOrderStatus(record)
          : renderValue(field, cfg.fields[field], record[field]),
    ),
  );
  return h(
    'tr',
    {
      class: classes.join(' '),
      dataset: { id: record.id },
      tabindex: '-1',
      'aria-current': selected ? 'true' : null,
    },
    cells,
  );
}

function conflictMarker() {
  return h(
    'span',
    { class: 'badge badge-conflict badge-tone-warning' },
    h('span', { 'aria-hidden': 'true' }, '⚠'),
    t('Conflict'),
  );
}

function pendingMarker(text) {
  return h(
    'span',
    { class: 'badge badge-pending badge-tone-info' },
    h('span', { 'aria-hidden': 'true' }, '⟳'),
    text,
  );
}

function onRowKeydown(event, onOpen) {
  const row = event.target.closest?.('tr[data-id]');
  if (!row) return;
  let target;
  switch (event.key) {
    case 'ArrowDown':
      target = row.nextElementSibling;
      break;
    case 'ArrowUp':
      target = row.previousElementSibling;
      break;
    case 'Home':
      target = row.parentElement.firstElementChild;
      break;
    case 'End':
      target = row.parentElement.lastElementChild;
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      onOpen(parseRowId(row.dataset.id));
      return;
    default:
      return;
  }
  event.preventDefault();
  if (target) focusRowElement(target);
}

/** Moves the roving tabindex to a row and focuses it. */
function focusRowElement(row) {
  for (const other of row.parentElement.querySelectorAll('tr[tabindex="0"]')) other.tabIndex = -1;
  row.tabIndex = 0;
  row.focus();
}

function findRow(container, id) {
  const value = String(id);
  // Ids are digits or tmp-<uuid>: safe inside the attribute selector.
  if (!/^(\d+|tmp-[0-9a-f-]+)$/.test(value)) return null;
  return container.querySelector(`tr[data-id="${value}"]`);
}

/** Marks a row as selected (or none) without re-rendering the table. */
export function selectRow(container, id) {
  for (const row of container.querySelectorAll('tr.is-selected')) {
    row.classList.remove('is-selected');
    row.removeAttribute('aria-current');
  }
  const row = id ? findRow(container, id) : null;
  if (!row) return;
  row.classList.add('is-selected');
  row.setAttribute('aria-current', 'true');
  for (const other of row.parentElement.querySelectorAll('tr[tabindex="0"]')) other.tabIndex = -1;
  row.tabIndex = 0;
}

/** Focuses the row of a record if it is on the page; returns whether it was found. */
export function focusRow(container, id) {
  const row = findRow(container, id);
  if (row) focusRowElement(row);
  return Boolean(row);
}

/** Focuses a pagination control by name, or the table title when it is disabled. */
export function focusPager(container, control) {
  const button = container.querySelector(`[data-pager="${control}"]`);
  if (button && !button.disabled) button.focus();
  else container.querySelector('.table-title')?.focus();
}

/**
 * Pagination controls, or null when everything fits on one page (DT12). The `top` copy above a
 * table names its buttons `top-first`, … so focus returns to the copy that was used.
 * @param {{ page: number, pages: number }} data
 * @param {(page: number, control: string) => void} onPage
 * @param {'top' | 'bottom'} [position]
 * @returns {HTMLElement | null}
 */
export function renderPagination({ page, pages }, onPage, position = 'bottom') {
  if (pages <= 1) return null;
  const top = position === 'top';
  const button = (name, label, arrow, target, arrowFirst) =>
    h(
      'button',
      {
        type: 'button',
        class: 'button button-pager',
        // The words fold away next to a side panel; the name stays (DT4).
        'aria-label': label,
        dataset: { pager: top ? `top-${name}` : name },
        disabled: target < 1 || target > pages || target === page,
        onClick: () => onPage(target, top ? `top-${name}` : name),
      },
      arrowFirst ? h('span', { 'aria-hidden': 'true' }, `${arrow} `) : null,
      h('span', { class: 'pager-label' }, label),
      arrowFirst ? null : h('span', { 'aria-hidden': 'true' }, ` ${arrow}`),
    );
  return h(
    'nav',
    {
      class: top ? 'pagination pagination-top' : 'pagination',
      'aria-label': top ? t('Pagination, top') : t('Pagination'),
    },
    button('first', t('First'), '◀◀', 1, true),
    button('previous', t('Previous'), '◀', page - 1, true),
    h('span', { class: 'pagination-status' }, t('Page {page} / {pages}', { page, pages })),
    button('next', t('Next'), '▶', page + 1, false),
    button('last', t('Last'), '▶▶', pages, false),
  );
}
