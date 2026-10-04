// Search and filters above the tables (docs/api-design.md → Search and filters). Filters live
// in the URL query, so they survive reloads, the back button, and opening a record.
import { h } from './dom.js';
import { ENTITIES } from './entities.js';
import { ENUMS } from './enums.js';
import { valueLabel } from './labels.js';
import { debounce } from './save-modes.js';

const SEARCH_DELAY_MS = 350;
/** "Not finished": the non-terminal statuses, sent as one comma-separated value. */
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
  },
};

/** Valid value of one filter from a raw query value, or undefined. Pure. */
function parseValue(def, raw) {
  if (raw === null || raw === '') return undefined;
  switch (def.kind) {
    case 'search':
    case 'site':
      return raw.trim().slice(0, def.kind === 'search' ? 100 : 200) || undefined;
    case 'enum':
      return ENUMS[def.enum].includes(raw) ? raw : undefined;
    case 'status': {
      const values = raw.split(',');
      return values.every((v) => ENUMS.work_order_status.includes(v)) ? raw : undefined;
    }
    case 'user':
      return /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : undefined;
    case 'flag':
      // `false` only matters to turn off a default filter (technicians' "Assigned to me").
      return raw === 'true' ? true : raw === 'false' ? false : undefined;
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
  const controls = new Map();
  const read = () => {
    const query = new URLSearchParams();
    for (const [name, el] of controls) {
      const value = el.type === 'checkbox' ? (el.checked ? 'true' : '') : el.value;
      if (value) query.set(name, value);
    }
    return parseFilters(entity, query);
  };
  const changed = () => onChange(read(), { typing: false });
  const typed = debounce(() => onChange(read(), { typing: true }), SEARCH_DELAY_MS);

  const select = (name, label, options, anyLabel = 'Any') => {
    const el = h(
      'select',
      { id: `filter-${name}`, name, onChange: changed },
      h('option', { value: '' }, anyLabel),
      options.map(([value, text]) => h('option', { value }, text)),
    );
    controls.set(name, el);
    return h('div', { class: 'filter-field' }, h('label', { for: el.id }, label), el);
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
        select(name, def.label, [
          [NOT_FINISHED, 'Not finished'],
          ...ENUMS.work_order_status.map((code) => [code, valueLabel('work_order_status', code)]),
        ]),
      );
    } else if (def.kind === 'site') {
      parts.push(
        select(
          name,
          'Site',
          (refs.sites ?? []).map((s) => [s, s]),
        ),
      );
    } else if (def.kind === 'user' && canFilterAssignee) {
      const people = (refs.users ?? []).map((u) => [
        String(u.id),
        `${u.first_name} ${u.last_name}`,
      ]);
      parts.push(select(name, def.label, people));
    } else if (def.kind === 'flag') {
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
    parts,
    clear,
  );

  /** Shows filters chosen elsewhere (back button, link) without disturbing typing. */
  const setFilters = (next) => {
    for (const [name, el] of controls) {
      const value = next[name];
      if (el.type === 'checkbox') el.checked = value === true;
      else if (document.activeElement !== el) el.value = value === undefined ? '' : String(value);
    }
    clear.hidden = sameFilters(entity, withoutSort(next), defaults);
  };
  setFilters(filters);
  return { element, setFilters };
}
