// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Search and filters above the tables (docs/api-design.md → Search and filters). Filters live
// in the URL query, so they survive reloads, the back button, and opening a record.
import { h } from './dom.js';
import { ENTITIES } from './entities.js';
import { ENUMS } from './enums.js';
import { valueLabel } from './labels.js';
import { debounce } from './save-modes.js';
import { drillLabel } from './widgets.js';

const SEARCH_DELAY_MS = 350;
/** "Not finished": the non-terminal statuses, sent as one comma-separated value (dashboard links). */
export const NOT_FINISHED = 'OPEN,IN_PROGRESS,ON_HOLD';

/** Filters of each entity: query name → kind (and enum for selects). */
export const FILTERS = {
  assets: {
    q: { kind: 'search' },
    site: { kind: 'site' },
    category: { kind: 'enum', enum: 'category', label: 'Category' },
    status: { kind: 'enum', enum: 'asset_status', label: 'Status' },
    criticality: { kind: 'enum', enum: 'criticality', label: 'Criticality' },
  },
  work_orders: {
    q: { kind: 'search' },
    status: { kind: 'status', label: 'Status' },
    priority: { kind: 'enum', enum: 'work_order_priority', label: 'Priority' },
    type: { kind: 'enum', enum: 'work_order_type', label: 'Type' },
    category: { kind: 'enum', enum: 'category', label: 'Category' },
    site: { kind: 'site' },
    assignee_id: { kind: 'user', label: 'Assignee' },
    mine: { kind: 'flag', label: 'Assigned to me' },
    overdue: { kind: 'flag', label: 'Overdue' },
    // Staff requests waiting for a supervisor (D47); shown to supervisors and admins.
    to_review: { kind: 'flag', label: 'Requests to review', supervisors: true },
    // The records behind a dashboard widget segment (D59, K9), and its period in days.
    drill: { kind: 'drill' },
    period: { kind: 'period' },
  },
};

/** Valid distinct values of a list filter, or undefined if one is invalid or none is left. Pure. */
function parseList(raw, separator, parseOne) {
  const values = [];
  for (const part of raw.split(separator)) {
    const value = parseOne(part);
    if (value === undefined) return undefined;
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

/** Valid value of one filter from a raw query value, or undefined. Pure. */
function parseValue(def, raw) {
  if (raw === null || raw === '') return undefined;
  switch (def.kind) {
    case 'search':
      return raw.trim().slice(0, 100) || undefined;
    case 'site': {
      const sites = parseList(raw, '|', (v) => v.trim().slice(0, 200) || undefined);
      return sites?.join('|');
    }
    case 'enum':
    case 'status': {
      // Several codes, written in the enum's own order so the same choice gives the same URL.
      const all = ENUMS[def.kind === 'status' ? 'work_order_status' : def.enum];
      const codes = parseList(raw, ',', (v) => (all.includes(v) ? v : undefined));
      return codes && all.filter((code) => codes.includes(code)).join(',');
    }
    case 'user':
      return parseList(raw, ',', (v) => (/^[1-9]\d{0,9}$/.test(v) ? v : undefined))?.join(',');
    case 'flag':
      // `false` only matters to turn off a default filter (technicians' "Assigned to me").
      return raw === 'true' ? true : raw === 'false' ? false : undefined;
    case 'drill':
      // A segment may hold a contractor's name: any text without control characters.
      return raw.length <= 200 && /^[a-z_]{1,40}(:[^\p{Cc}]*)?$/u.test(raw) ? raw : undefined;
    case 'period':
      return ['30', '90', '365'].includes(raw) ? Number(raw) : undefined;
    default:
      return undefined;
  }
}

/** Sort chosen in the URL: a sortable column and `asc`/`desc` (default `asc`), or {}. Pure. */
function parseSort(entity, query) {
  const cfg = ENTITIES[entity];
  const sort = query.get('sort');
  if (!cfg || !cfg.sortColumns.includes(sort)) return {};
  return sortParams(cfg, { sort, order: query.get('order') === 'desc' ? 'desc' : 'asc' });
}

/** `{ sort, order }`, or {} for the default order, which stays out of the URL. */
function sortParams(cfg, { sort, order }) {
  const { defaultSort } = cfg;
  return sort === defaultSort.sort && order === defaultSort.order ? {} : { sort, order };
}

/**
 * Filters of an entity from a URL query (unknown or invalid values are dropped), with the
 * table sort when it is not the default (`sort`, `order`). Pure.
 * @param {string} entity
 * @param {URLSearchParams} query
 * @returns {Record<string, string | number | boolean>}
 */
export function parseFilters(entity, query) {
  const filters = {};
  for (const [name, def] of Object.entries(FILTERS[entity] ?? {})) {
    const value = parseValue(def, query.get(name));
    if (value !== undefined) filters[name] = value;
  }
  // A period only means something for a dashboard drill-down.
  if (filters.drill === undefined) delete filters.period;
  return { ...filters, ...parseSort(entity, query) };
}

/** Query string of filters then sort, in a stable order (also the API query). Pure. */
export function filtersQuery(entity, filters = {}) {
  const query = new URLSearchParams();
  for (const name of [...Object.keys(FILTERS[entity] ?? {}), 'sort', 'order']) {
    if (filters[name] !== undefined) query.set(name, String(filters[name]));
  }
  return query.toString();
}

const SORT_KEYS = ['sort', 'order'];

/** Search or filters applied (the sort alone narrows nothing). Pure. */
export const hasFilters = (filters) =>
  Object.keys(filters ?? {}).some((name) => !SORT_KEYS.includes(name));

/** Neither filters nor a sort: the only lists cached on the device (D38, D42). Pure. */
export const isPlainList = (filters) => Object.keys(filters ?? {}).length === 0;

/** The filters without the sort. Pure. */
export function withoutSort(filters = {}) {
  return Object.fromEntries(Object.entries(filters).filter(([name]) => !SORT_KEYS.includes(name)));
}

/** The sort part of the filters (`{}` for the default order). Pure. */
export function sortOf(filters = {}) {
  return filters.sort ? { sort: filters.sort, order: filters.order } : {};
}

/** Sort shown in the table: the one in the URL, or the entity's default. Pure. */
export function currentSort(entity, filters = {}) {
  return filters.sort ? sortOf(filters) : ENTITIES[entity].defaultSort;
}

/**
 * Filters a role gets on a list opened without any: technicians see the work orders
 * assigned to them (suggestion #3, D44). Pure.
 * @param {string} entity
 * @param {string} [role]
 */
export function defaultFilters(entity, role) {
  return entity === 'work_orders' && role === 'TECHNICIAN' ? { mine: true } : {};
}

const sameFilters = (entity, a, b) => filtersQuery(entity, a) === filtersQuery(entity, b);

/**
 * Filters applied to a list: the role defaults when the URL has no filter, else the URL's
 * own. A `false` flag in the URL only turns a default off. Pure.
 */
export function effectiveFilters(entity, role, filters = {}) {
  const merged = { ...(hasFilters(filters) ? {} : defaultFilters(entity, role)), ...filters };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== false));
}

/**
 * URL filters for what the filter bar shows: the role defaults alone give a clean URL (the
 * list cached on the device), and an unchecked default is written as `false`. Pure.
 */
export function urlFilters(entity, role, chosen) {
  const defaults = defaultFilters(entity, role);
  const filters = withoutSort(chosen);
  if (sameFilters(entity, filters, defaults)) return sortOf(chosen);
  if (hasFilters(filters)) return chosen;
  const off = Object.fromEntries(Object.keys(defaults).map((name) => [name, false]));
  return { ...off, ...sortOf(chosen) };
}

/**
 * Filters after a click on a column title: the same column flips the order, another one
 * starts ascending. Filters are kept. Pure.
 * @param {string} entity
 * @param {object} filters current filters (and sort)
 * @param {string} column
 */
export function sortByColumn(entity, filters, column) {
  const now = currentSort(entity, filters);
  const order = now.sort === column && now.order === 'asc' ? 'desc' : 'asc';
  return { ...withoutSort(filters), ...sortParams(ENTITIES[entity], { sort: column, order }) };
}

let closeOnOutsideClick = false;

/** Closes an open multi-select dropdown when the user clicks or tabs away from it. */
function installDropdownClosing() {
  if (closeOnOutsideClick) return;
  closeOnOutsideClick = true;
  document.addEventListener('click', (event) => {
    for (const open of document.querySelectorAll('.multi-select[open]')) {
      if (!open.contains(event.target)) open.open = false;
    }
  });
}

/**
 * Several values can be ticked: a dropdown of checkboxes that behaves like a form control
 * (`el.value` is the values joined by the separator, as in the URL). Used by the list filter
 * bars and the dashboard filters.
 * @param {{ id: string, labelId: string, options: [string, string][], separator?: string,
 *   onChange: () => void, summary?: (value: string) => string | null }} options
 * @returns {HTMLDetailsElement & { value: string }}
 */
export function multiSelect({ id, labelId, options, separator = ',', onChange, summary: text }) {
  installDropdownClosing();
  const summary = h('summary', { 'aria-labelledby': labelId });
  const boxes = options.map(([value, label]) => {
    const box = h('input', { type: 'checkbox', value });
    return {
      box,
      text: label,
      row: h('label', { class: 'multi-option' }, box, h('span', {}, label)),
    };
  });
  const el = h(
    'details',
    { id, class: 'multi-select', onChange },
    summary,
    h(
      'div',
      { class: 'multi-options' },
      boxes.map(({ row }) => row),
    ),
  );
  const chosen = () => boxes.filter(({ box }) => box.checked);
  const refresh = () => {
    const picked = chosen();
    const value = picked.map(({ box }) => box.value).join(separator);
    summary.textContent =
      text?.(value) ??
      (picked.length === 0
        ? 'Any'
        : picked.length === 1
          ? picked[0].text
          : `${picked.length} selected`);
  };
  el.addEventListener('change', refresh);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      el.open = false;
      summary.focus();
    }
  });
  Object.defineProperty(el, 'value', {
    get: () =>
      chosen()
        .map(({ box }) => box.value)
        .join(separator),
    set: (value) => {
      const wanted = value ? String(value).split(separator) : [];
      for (const { box } of boxes) box.checked = wanted.includes(box.value);
      refresh();
    },
  });
  refresh();
  return el;
}

/**
 * Filter bar. Controls are named after the query parameters; changes call `onChange` with
 * the new filters (search text after a short pause).
 * @param {object} options
 * @param {string} options.entity
 * @param {object} options.filters current filters
 * @param {{ sites: string[], users: object[] }} options.refs
 * @param {boolean} options.canFilterAssignee supervisors and admins
 * @param {object} [options.defaults] filters of the role's default list ("Clear filters")
 * @param {(filters: object, how: { typing: boolean }) => void} options.onChange
 * @returns {{ element: HTMLElement, setFilters: (filters: object) => void }}
 */
export function renderFilterBar({
  entity,
  filters,
  refs,
  canFilterAssignee,
  defaults = {},
  onChange,
}) {
  installDropdownClosing();
  const controls = new Map();
  // A dashboard drill-down has no control: it is kept as it is until removed.
  let drill = {};
  const read = () => {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(drill)) query.set(name, String(value));
    for (const [name, el] of controls) {
      const value = el.type === 'checkbox' ? (el.checked ? 'true' : '') : el.value;
      if (value) query.set(name, value);
    }
    return parseFilters(entity, query);
  };
  const changed = () => onChange(read(), { typing: false });
  const typed = debounce(() => onChange(read(), { typing: true }), SEARCH_DELAY_MS);

  const select = (name, label, options, separator = ',') => {
    const labelId = `filter-${name}-label`;
    const el = multiSelect({
      id: `filter-${name}`,
      labelId,
      options,
      separator,
      onChange: changed,
      summary: (value) => (name === 'status' && value === NOT_FINISHED ? 'Not finished' : null),
    });
    controls.set(name, el);
    return h(
      'div',
      { class: 'filter-field' },
      h('span', { id: labelId, class: 'filter-label' }, label),
      el,
    );
  };

  const parts = [];
  for (const [name, def] of Object.entries(FILTERS[entity])) {
    if (def.kind === 'search') {
      const el = h('input', {
        id: 'filter-q',
        name,
        type: 'search',
        maxlength: '100',
        autocomplete: 'off',
        placeholder:
          entity === 'assets'
            ? 'Code, name, brand, serial number…'
            : 'Number, title, description, report…',
        onInput: typed,
      });
      controls.set(name, el);
      parts.push(
        h('div', { class: 'filter-field filter-search' }, h('label', { for: el.id }, 'Search'), el),
      );
    } else if (def.kind === 'enum') {
      parts.push(
        select(
          name,
          def.label,
          ENUMS[def.enum].map((code) => [code, valueLabel(def.enum, code)]),
        ),
      );
    } else if (def.kind === 'status') {
      parts.push(
        select(
          name,
          def.label,
          ENUMS.work_order_status.map((code) => [code, valueLabel('work_order_status', code)]),
        ),
      );
    } else if (def.kind === 'site') {
      parts.push(
        select(
          name,
          'Site',
          (refs.sites ?? []).map((s) => [s, s]),
          '|',
        ),
      );
    } else if (def.kind === 'user' && canFilterAssignee) {
      const people = (refs.users ?? []).map((u) => [
        String(u.id),
        `${u.first_name} ${u.last_name}`,
      ]);
      parts.push(select(name, def.label, people));
    } else if (def.kind === 'flag' && (!def.supervisors || canFilterAssignee)) {
      const el = h('input', { id: `filter-${name}`, name, type: 'checkbox', onChange: changed });
      controls.set(name, el);
      parts.push(
        h('div', { class: 'filter-field filter-flag' }, el, h('label', { for: el.id }, def.label)),
      );
    }
  }

  const clear = h(
    'button',
    {
      type: 'button',
      class: 'button button-secondary filter-clear',
      onClick: () => {
        typed.cancel();
        onChange({ ...defaults }, { typing: false });
      },
    },
    'Clear filters',
  );

  const drillText = h('strong', {});
  const drillChip = h(
    'div',
    { class: 'filter-drill', role: 'group', 'aria-label': 'From the dashboard', hidden: true },
    h('span', {}, 'From the dashboard: '),
    drillText,
    h(
      'button',
      {
        type: 'button',
        class: 'filter-drill-remove',
        'aria-label': 'Remove the dashboard filter',
        onClick: () => {
          drill = {};
          onChange(read(), { typing: false });
        },
      },
      h('span', { 'aria-hidden': 'true' }, '✕'),
    ),
  );

  const element = h(
    'form',
    {
      class: 'filter-bar',
      role: 'search',
      'aria-label':
        entity === 'assets' ? 'Search and filter assets' : 'Search and filter work orders',
      onSubmit: (event) => {
        event.preventDefault();
        typed.cancel();
        changed();
      },
    },
    drillChip,
    parts,
    clear,
  );

  /** Shows filters chosen elsewhere (back button, link) without disturbing typing. */
  const setFilters = (next) => {
    drill = next.drill ? { drill: next.drill, ...(next.period && { period: next.period }) } : {};
    drillChip.hidden = !next.drill;
    drillText.textContent = next.drill ? (drillLabel(next.drill, next.period) ?? next.drill) : '';
    for (const [name, el] of controls) {
      const value = next[name];
      if (el.type === 'checkbox') el.checked = value === true;
      else if (document.activeElement !== el) el.value = value === undefined ? '' : String(value);
    }
    // Always shown (disabled when there is nothing to clear) so the bar never shifts.
    clear.disabled = sameFilters(entity, withoutSort(next), defaults);
  };
  setFilters(filters);
  return { element, setFilters };
}
