// Paginated table (brief → Table rendering; docs/ui-guidelines.md → Table rows, Accessibility).
import { h, replaceChildren } from './dom.js';
import { ENTITIES } from './entities.js';
import { isEmpty, renderValue } from './format.js';

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
 * @param {object[]} [options.pinned] records shown first (work orders waiting to be created)
 * @param {HTMLElement[]} [options.actions] buttons next to the record count
 * @param {boolean} [options.filtered] search or filters are applied
 */
export function renderTable(
  container,
  { entity, data, selectedId, onOpen, onPage, pinned = [], actions = [], filtered = false },
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
    { class: 'data-table', 'aria-describedby': `${cfg.prefix}-table-help` },
    h('caption', { class: 'visually-hidden' }, `${cfg.label}, page ${data.page} of ${data.pages}`),
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        cfg.columns.map((f) =>
          h('th', { scope: 'col', class: columnClass(cfg, f) }, cfg.fields[f].label),
        ),
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
      h(
        'p',
        { class: 'table-count', role: 'status' },
        `${data.total} ${filtered ? 'matching ' : ''}${data.total === 1 ? 'record' : 'records'}`,
      ),
      actions,
    ),
    h(
      'p',
      { id: `${cfg.prefix}-table-help`, class: 'visually-hidden' },
      'Use the up and down arrow keys to move between rows, and Enter to open one.',
    ),
    rows.length
      ? h('div', { class: 'table-scroll' }, table)
      : h(
          'p',
          { class: 'empty-state' },
          filtered
            ? `No ${cfg.singular.toLowerCase()} matches this search.`
            : `No ${cfg.label.toLowerCase()} on this page.`,
        ),
    renderPagination(data, onPage),
  );
}

/** Columns hidden in split view get `col-secondary` (layout.css). */
function columnClass(cfg, field) {
  return cfg.splitColumns.includes(field) ? null : 'col-secondary';
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
      { class: columnClass(cfg, field) },
      // Conflict: color + icon + text, never color alone (brief → Accessibility).
      index === 0 && record.has_conflict ? conflictMarker() : null,
      index === 0 && record._pendingCreate ? pendingMarker('Pending creation') : null,
      index === 0 && record._pending && !record._pendingCreate
        ? pendingMarker('Pending sync')
        : null,
      isEmpty(record[field]) ? '' : renderValue(field, cfg.fields[field], record[field]),
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
    'Conflict',
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

export function renderPagination({ page, pages }, onPage) {
  const button = (name, label, arrow, target, arrowFirst) =>
    h(
      'button',
      {
        type: 'button',
        class: 'button button-pager',
        dataset: { pager: name },
        disabled: target < 1 || target > pages || target === page,
        onClick: () => onPage(target, name),
      },
      arrowFirst ? h('span', { 'aria-hidden': 'true' }, `${arrow} `) : null,
      label,
      arrowFirst ? null : h('span', { 'aria-hidden': 'true' }, ` ${arrow}`),
    );
  return h(
    'nav',
    { class: 'pagination', 'aria-label': 'Pagination' },
    button('first', 'First', '◀◀', 1, true),
    button('previous', 'Previous', '◀', page - 1, true),
    h('span', { class: 'pagination-status' }, `Page ${page} / ${pages}`),
    button('next', 'Next', '▶', page + 1, false),
    button('last', 'Last', '▶▶', pages, false),
  );
}
