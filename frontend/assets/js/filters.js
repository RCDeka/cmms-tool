// Search and filters above the tables (docs/api-design.md → Search and filters). Filters live
// in the URL query, so they survive reloads, the back button, and opening a record.
import { h } from './dom.js';
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
      return raw === 'true' ? true : undefined;
    default:
      return undefined;
  }
}

/**
 * Filters of an entity from a URL query (unknown or invalid values are dropped). Pure.
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
  return filters;
}

/** Query string of filters, in a stable order (also the API query). Pure. */
export function filtersQuery(entity, filters = {}) {
  const query = new URLSearchParams();
  for (const name of Object.keys(FILTERS[entity] ?? {})) {
    if (filters[name] !== undefined) query.set(name, String(filters[name]));
  }
  return query.toString();
}

export const hasFilters = (filters) => Object.keys(filters ?? {}).length > 0;

/**
 * Filter bar. Controls are named after the query parameters; changes call `onChange` with
 * the new filters (search text after a short pause).
 * @param {object} options
 * @param {string} options.entity
 * @param {object} options.filters current filters
 * @param {{ sites: string[], users: object[] }} options.refs
 * @param {boolean} options.canFilterAssignee supervisors and admins
 * @param {(filters: object, how: { typing: boolean }) => void} options.onChange
 * @returns {{ element: HTMLElement, setFilters: (filters: object) => void }}
 */
export function renderFilterBar({ entity, filters, refs, canFilterAssignee, onChange }) {
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
        onChange({}, { typing: false });
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
    clear.hidden = !hasFilters(next);
  };
  setFilters(filters);
  return { element, setFilters };
}
