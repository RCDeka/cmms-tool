// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// The location tree (D82): helpers on the cached tree (GET /api/locations), the place picker
// of the forms (it works offline, from the cache), and the Places page kept by supervisors
// and admins (/admin/locations, online only), with the level types kept by admins.
import { formRow, panelHeader, showErrors } from './admin-users.js';
import { badgeClass, h, replaceChildren } from './dom.js';
import { formatDateTime } from './format.js';
import { t, tn } from './i18n.js';

/** Joins the names of a path: "Tower A › B1 › Plant room 2" (as the server does). */
export const PATH_SEPARATOR = ' › ';
/** Value of the "Not in the list" choice of the request form. */
export const NOT_LISTED = 'none';
/** The level type of sites. */
export const SITE_TYPE = 1;

const indexes = new WeakMap();

/**
 * Index of a tree as GET /api/locations gives it (`{ level_types, items }`, items in tree
 * order): places by id, children by parent, level types by id. Built once per tree. Pure.
 */
export function placeIndex(tree) {
  if (!tree) return placeIndex({ level_types: [], items: [] });
  if (indexes.has(tree)) return indexes.get(tree);
  const byId = new Map(tree.items.map((p) => [p.id, p]));
  const children = new Map();
  for (const p of tree.items) {
    const key = p.parent_id ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(p);
  }
  const types = new Map(tree.level_types.map((type) => [type.id, type]));
  const index = { byId, children, types, items: tree.items };
  indexes.set(tree, index);
  return index;
}

/** The places from the site down to `id`, both included ([] when unknown). Pure. */
export function chainOf(index, id) {
  const chain = [];
  let place = index.byId.get(id);
  while (place) {
    chain.unshift(place);
    place = place.parent_id === null ? undefined : index.byId.get(place.parent_id);
  }
  return chain;
}

/** `{ site, place }` of a place, as records store them (place: '' for the site). Pure. */
export function placeOf(index, id) {
  const [site, ...below] = chainOf(index, id);
  return { site: site?.name ?? '', place: below.map((p) => p.name).join(PATH_SEPARATOR) };
}

/** "Site › Tower A › L12" for a place of the index (the full path). Pure. */
export const fullPath = (index, id) =>
  chainOf(index, id)
    .map((p) => p.name)
    .join(PATH_SEPARATOR);

/** "site · place" of a record, or the site alone. Pure. */
export const recordPlace = (record) => [record.site, record.place].filter(Boolean).join(' · ');

/**
 * Label of a list of sibling places: their level type when they share one ("Floor"), else
 * "Place". Pure.
 */
export function levelLabel(index, places) {
  const ids = new Set(places.map((p) => p.level_type_id));
  return ids.size === 1 ? (index.types.get([...ids][0])?.name ?? t('Place')) : t('Place');
}

/**
 * The places a picker offers under `parentId`: in use (or the one already chosen), and for a
 * picker limited to some places, only those that lead to one. Pure.
 * @param {object} index
 * @param {number | null} parentId
 * @param {{ selectable?: (place: object) => boolean, keep?: number | null }} [options]
 */
export function choicesUnder(index, parentId, { selectable = () => true, keep = null } = {}) {
  const leads = (place) =>
    selectable(place) || (index.children.get(place.id) ?? []).some((c) => c.is_active && leads(c));
  return (index.children.get(parentId) ?? []).filter(
    (p) => p.id === keep || (p.is_active && leads(p)),
  );
}

/**
 * Places matching every word of `text` in their full path, at most `limit`, in tree order.
 * Pure.
 */
export function searchPlaces(index, text, { selectable = () => true, limit = 30 } = {}) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const p of index.items) {
    if (!p.is_active || !selectable(p)) continue;
    const path = fullPath(index, p.id).toLowerCase();
    if (words.every((w) => path.includes(w))) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The place picker: one list per level, from the site (or below `scope`, a site) down, and
 * a search on the paths. Its value is the deepest place chosen when `selectable` accepts it,
 * NOT_LISTED for "Not in the list" (`notListed`), else null.
 * @param {object} options
 * @param {string} options.id id of the first list (the label of the form row points to it)
 * @param {object} options.index placeIndex of the cached tree
 * @param {number | null} [options.scope] a site: pick below it (the request form)
 * @param {(place: object) => boolean} [options.selectable] places that can be the answer
 * @param {boolean} [options.notListed] offer "Not in the list" at the deepest level
 * @param {boolean} [options.autoPick] choose a lone choice by itself (the request form)
 * @param {() => void} [options.onChange]
 */
export function placePicker({
  id,
  index,
  scope = null,
  selectable = () => true,
  notListed = false,
  autoPick = false,
  onChange = () => {},
}) {
  let chain = []; // chosen ids, from the top list down
  let unlisted = false;
  let disabled = false;
  const levels = h('div', { class: 'place-picker-fields' });
  const searchId = `${id}-search`;
  const search = h('input', {
    id: searchId,
    type: 'search',
    class: 'place-picker-search',
    autocomplete: 'off',
    placeholder: t('Search, e.g. “12.02” or “Tower A L3”'),
    'aria-controls': `${id}-results`,
  });
  const results = h('ul', { id: `${id}-results`, class: 'place-picker-results', hidden: true });
  const top = () => scope;

  const value = () => {
    if (unlisted) return NOT_LISTED;
    const last = chain.at(-1);
    if (last !== undefined) return selectable(index.byId.get(last)) ? last : null;
    return scope !== null && selectable(index.byId.get(scope)) ? scope : null;
  };

  /** Rebuilds the lists from level `from` down; the lists above keep their element. */
  function render(from = 0) {
    const fields = [...levels.children];
    fields.slice(from).forEach((f) => f.remove());
    let parentId = from === 0 ? top() : chain[from - 1];
    for (let level = from; ; level++) {
      const choices = choicesUnder(index, parentId, { selectable, keep: chain[level] ?? null });
      const deepest = !choices.some((c) => (index.children.get(c.id) ?? []).length);
      if (!choices.length) break;
      // A lone building or floor is chosen by itself; the last choice stays the user's.
      const lone = choices.length === 1 && (index.children.get(choices[0].id) ?? []).length;
      if (autoPick && chain[level] === undefined && lone && !unlisted) chain[level] = choices[0].id;
      const selectId = level === 0 ? id : `${id}-${level}`;
      const select = h('select', { id: selectId, 'data-level': String(level) });
      const blank =
        parentId === null || autoPick
          ? t('— Choose —')
          : t('— {value} itself —', { value: index.byId.get(parentId)?.name ?? '' });
      select.append(
        h('option', { value: '' }, blank),
        ...choices.map((c) =>
          h(
            'option',
            { value: String(c.id) },
            c.is_active ? c.name : t('{name} (not in use)', { name: c.name }),
          ),
        ),
      );
      if (notListed && deepest)
        select.append(h('option', { value: NOT_LISTED }, t('Not in the list')));
      select.value = unlisted && level === chain.length ? NOT_LISTED : String(chain[level] ?? '');
      select.disabled = disabled;
      select.addEventListener('change', () => {
        chain = chain.slice(0, level);
        unlisted = select.value === NOT_LISTED;
        if (select.value && !unlisted) chain.push(Number(select.value));
        render(level + 1);
        onChange();
      });
      const label = level === 0 && scope === null ? t('Site') : levelLabel(index, choices);
      levels.append(
        h(
          'div',
          { class: 'place-picker-field' },
          h('label', { for: selectId, class: 'place-picker-label' }, label),
          select,
        ),
      );
      if (chain[level] === undefined) break;
      parentId = chain[level];
    }
  }

  function showResults() {
    const found = searchPlaces(index, search.value, {
      selectable: (p) => selectable(p) && (scope === null || p.site_id === scope),
    });
    replaceChildren(
      results,
      found.map((p) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'place-picker-result',
              onClick: () => {
                set(p.id);
                search.value = '';
                results.hidden = true;
                onChange();
                levels.querySelector('select:last-of-type')?.focus();
              },
            },
            scope === null ? fullPath(index, p.id) : placeOf(index, p.id).place,
          ),
        ),
      ),
      search.value.trim() && !found.length
        ? h('li', { class: 'muted' }, t('No place found.'))
        : null,
    );
    results.hidden = !search.value.trim();
  }
  search.addEventListener('input', showResults);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !results.hidden) {
      event.stopPropagation();
      search.value = '';
      results.hidden = true;
    }
  });

  /** Chooses a place (null: nothing), or NOT_LISTED. */
  function set(placeId) {
    unlisted = placeId === NOT_LISTED;
    const below = (p) => scope === null || (p.id !== scope && p.site_id === scope);
    chain =
      placeId === null || unlisted
        ? []
        : chainOf(index, placeId)
            .filter(below)
            .map((p) => p.id);
    render(0);
  }

  const element = h(
    'div',
    { class: 'place-picker' },
    h(
      'div',
      { class: 'place-picker-find' },
      h('label', { for: searchId, class: 'place-picker-label' }, t('Find a place')),
      search,
      results,
    ),
    levels,
  );
  render(0);
  return {
    element,
    /** The first list, for the label of the row and the error display. */
    get input() {
      return levels.querySelector('select') ?? search;
    },
    value,
    set,
    /** The deepest place chosen, whatever its type, or null. */
    deepest: () => chain.at(-1) ?? null,
    /** Another site for a scoped picker; the choice starts again. */
    setScope(siteId) {
      scope = siteId;
      chain = [];
      unlisted = false;
      render(0);
    },
    setDisabled(next) {
      disabled = next;
      search.disabled = next;
      for (const select of levels.querySelectorAll('select')) select.disabled = next;
    },
    /** The lists of the picker as they are (tests). */
    lists: () => [...levels.querySelectorAll('select')],
  };
}

// --- Places page (/admin/locations) -------------------------------------------------------

/** Places page URL with its filters, or a panel (`id`, 'new', 'types'). Pure. */
export function placesUrl({ q, all, parent, panel } = {}) {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (all) query.set('all', '1');
  if (parent) query.set('parent', String(parent));
  const text = query.toString();
  return `/admin/locations${panel ? `/${panel}` : ''}${text ? `?${text}` : ''}`;
}

/** Filters of the Places page from the URL query (invalid values dropped). Pure. */
export function parsePlaceFilters(query) {
  const filters = {};
  const q = query.get('q')?.trim();
  if (q) filters.q = q.slice(0, 100);
  if (query.get('all') === '1') filters.all = true;
  const parent = Number(query.get('parent'));
  if (Number.isInteger(parent) && parent > 0) filters.parent = parent;
  return filters;
}

/** Checks of the place form (the server checks again). Pure. */
export function checkPlaceForm(values, { site }) {
  const errors = {};
  if (!values.name.trim()) errors.name = t('Required');
  else if (values.name.includes('›')) errors.name = t('The character › is not allowed');
  if (values.code && !/^[A-Z0-9]{1,10}$/.test(values.code)) {
    errors.code = t('Capitals and digits only, 1 to 10 characters');
  }
  if (!site && !values.level_type_id) errors.level_type_id = t('Required');
  return errors;
}

const activeBadge = (active) =>
  h(
    'span',
    { class: badgeClass('active', String(active), active ? 'success' : 'neutral') },
    active ? t('In use') : t('Not in use'),
  );

/** Places open in the tree, kept while the page is used (sites open by default). */
const opened = new Set();
const closedSites = new Set();
const isOpen = (place) =>
  place.parent_id === null ? !closedSites.has(place.id) : opened.has(place.id);

/**
 * The tree of the Places page: each place with its type, code and state, folding branches,
 * or the places matching the search with their path.
 * @param {HTMLElement} container
 * @param {{ index: object, filters: object, selectedId: number | null, canAddSite: boolean,
 *   onFilter: (filters: object) => void }} options
 */
export function renderPlaceTree(container, { index, filters, selectedId, canAddSite, onFilter }) {
  const search = h('input', {
    id: 'places-q',
    type: 'search',
    maxlength: '100',
    value: filters.q ?? '',
    placeholder: t('Name or path, e.g. “Tower A L12”'),
  });
  const all = h('input', { id: 'places-all', type: 'checkbox', class: 'checkbox' });
  all.checked = Boolean(filters.all);
  const read = () => ({ q: search.value.trim() || undefined, all: all.checked || undefined });
  search.addEventListener('change', () => onFilter(read()));
  all.addEventListener('change', () => onFilter(read()));
  const keep = (p) => filters.all || p.is_active;
  // The chosen place stays visible: its branch opens.
  for (const p of chainOf(index, selectedId).slice(0, -1)) {
    if (p.parent_id === null) closedSites.delete(p.id);
    else opened.add(p.id);
  }

  const link = (p, text) =>
    h(
      'a',
      {
        href: `/admin/locations/${p.id}${location.search}`,
        'data-link': true,
        'aria-current': p.id === selectedId ? 'true' : null,
      },
      text,
    );
  const meta = (p) =>
    h(
      'span',
      { class: 'place-meta' },
      index.types.get(p.level_type_id)?.name ?? '',
      p.code ? ` · ${p.code}` : '',
      p.is_active ? '' : ' · ',
      p.is_active ? null : activeBadge(false),
    );

  const branch = (parentId) => {
    const items = (index.children.get(parentId) ?? []).filter(keep);
    if (!items.length) return null;
    return h(
      'ul',
      { class: parentId === null ? 'place-tree' : 'place-branch' },
      items.map((p) => {
        const kids = (index.children.get(p.id) ?? []).filter(keep);
        const open = kids.length > 0 && isOpen(p);
        const toggle = kids.length
          ? h(
              'button',
              {
                type: 'button',
                class: 'place-toggle',
                'aria-expanded': String(open),
                'aria-label': `${open ? t('Fold') : t('Unfold')} ${p.name} (${kids.length})`,
                onClick: () => {
                  if (p.parent_id === null) {
                    if (open) closedSites.add(p.id);
                    else closedSites.delete(p.id);
                  } else if (open) opened.delete(p.id);
                  else opened.add(p.id);
                  renderPlaceTree(container, { index, filters, selectedId, canAddSite, onFilter });
                  container.querySelector(`[data-place="${p.id}"] .place-toggle`)?.focus();
                },
              },
              open ? '▾' : '▸',
            )
          : h('span', { class: 'place-toggle-space', 'aria-hidden': 'true' });
        return h(
          'li',
          { 'data-place': String(p.id), class: p.id === selectedId ? 'is-selected' : null },
          h('div', { class: 'place-line' }, toggle, link(p, p.name), meta(p)),
          open ? branch(p.id) : null,
        );
      }),
    );
  };

  const found = filters.q
    ? index.items.filter(
        (p) =>
          keep(p) &&
          filters.q
            .toLowerCase()
            .split(/\s+/)
            .every((w) => fullPath(index, p.id).toLowerCase().includes(w)),
      )
    : null;
  const count = index.items.filter(keep).length;

  replaceChildren(
    container,
    h('h2', { class: 'table-title visually-hidden', tabindex: '-1' }, t('Places')),
    h(
      'form',
      {
        class: 'filter-bar',
        role: 'search',
        'aria-label': t('Search places'),
        onSubmit: (event) => {
          event.preventDefault();
          onFilter(read());
        },
      },
      h(
        'div',
        { class: 'filter-field filter-search' },
        h('label', { for: 'places-q' }, t('Search')),
        search,
      ),
      h(
        'div',
        { class: 'filter-field filter-check' },
        all,
        h('label', { for: 'places-all' }, t('Show places not in use')),
      ),
    ),
    h(
      'div',
      { class: 'table-header' },
      h(
        'p',
        { class: 'table-count', role: 'status' },
        found
          ? tn(found.length, '{n} place matches', '{n} places match')
          : tn(count, '{n} place', '{n} places'),
      ),
      canAddSite
        ? h(
            'a',
            {
              href: placesUrl({ ...filters, panel: 'types' }),
              'data-link': true,
              class: 'button button-secondary',
            },
            t('Level types'),
          )
        : null,
      canAddSite
        ? h(
            'a',
            {
              href: placesUrl({ ...filters, panel: 'new' }),
              'data-link': true,
              class: 'button button-primary',
            },
            t('+ New site'),
          )
        : null,
    ),
    found
      ? found.length
        ? h(
            'ul',
            { class: 'place-tree place-found' },
            found
              .slice(0, 200)
              .map((p) =>
                h(
                  'li',
                  { 'data-place': String(p.id), class: p.id === selectedId ? 'is-selected' : null },
                  h('div', { class: 'place-line' }, link(p, fullPath(index, p.id)), meta(p)),
                ),
              ),
          )
        : h('p', { class: 'empty-state' }, t('No place matches this search.'))
      : (branch(null) ?? h('p', { class: 'empty-state' }, t('No place yet.'))),
  );
}

/** Fields of the place form: name, type (not for a site), code. */
function placeFields(index, place, { site }) {
  const name = h('input', { name: 'name', type: 'text', maxlength: '100', autocomplete: 'off' });
  name.value = place?.name ?? '';
  const code = h('input', {
    name: 'code',
    type: 'text',
    maxlength: '10',
    autocomplete: 'off',
    autocapitalize: 'characters',
  });
  code.value = place?.code ?? '';
  const type = site
    ? null
    : h(
        'select',
        { name: 'level_type_id' },
        h('option', { value: '' }, t('— Choose —')),
        [...index.types.values()]
          .filter(
            (type) => type.id !== SITE_TYPE && (type.is_active || type.id === place?.level_type_id),
          )
          .map((type) =>
            h(
              'option',
              { value: String(type.id) },
              type.is_active ? type.name : t('{name} (not in use)', { name: type.name }),
            ),
          ),
      );
  if (type) type.value = place ? String(place.level_type_id) : '';
  return {
    read: () => ({
      name: name.value.trim(),
      code: code.value.trim().toUpperCase() || null,
      ...(type && { level_type_id: type.value ? Number(type.value) : null }),
    }),
    elements: [
      formRow('pl-name', site ? t('Site') : t('Name'), name, {
        required: true,
        hint: site
          ? t('Records copy the site’s name: it can change only while nothing uses the site.')
          : t('The name people use, e.g. “Tower A”, “L12” or “Meeting room 12.02”.'),
      }),
      type ? formRow('pl-level_type_id', t('Level type'), type, { required: true }) : null,
      formRow('pl-code', t('Code'), code, {
        hint: t(
          'Optional, for asset codes: capitals and digits, e.g. “2” for Tower 2, “01” for the first basement.',
        ),
      }),
    ],
  };
}

/**
 * Creation form of a place under `parent`, or of a site when `parent` is null.
 * @param {HTMLElement} container
 * @param {{ index: object, parent: object | null, onClose: () => void,
 *   onCreate: (body: object, form: HTMLFormElement) => void }} options
 */
export function renderPlaceCreate(container, { index, parent, onClose, onCreate }) {
  const site = parent === null;
  const fields = placeFields(index, null, { site });
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = fields.read();
        const errors = checkPlaceForm(values, { site });
        if (Object.keys(errors).length) {
          return showErrors(form, errors, t('Check the highlighted fields.'));
        }
        onCreate({ parent_id: parent?.id ?? null, ...values }, form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h(
      'p',
      { class: 'form-help' },
      site
        ? t(
            'A site is the top of a branch: an office tower, a branch, a data center. Fields marked * are required.',
          )
        : t('In {fullPath}. Fields marked * are required.', {
            fullPath: fullPath(index, parent.id),
          }),
    ),
    fields.elements,
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        { type: 'submit', class: 'button button-primary online-only' },
        site ? t('Create site') : t('Create place'),
      ),
    ),
  );
  replaceChildren(container, panelHeader(site ? t('New site') : t('New place'), onClose), form);
}

/**
 * Panel of a place: its fields, where it is (Move, within its site), in use, and a link to
 * add a place under it. Sites are changed by admins only (BR-LOC6).
 * @param {HTMLElement} container
 * @param {{ index: object, place: object, canEdit: boolean, onClose: () => void,
 *   onSave: (body: object, form: HTMLFormElement) => void, addUrl: string }} options
 */
export function renderPlacePanel(container, { index, place, canEdit, onClose, onSave, addUrl }) {
  const site = place.parent_id === null;
  const fields = placeFields(index, place, { site });
  const below = new Set();
  const collect = (id) => {
    below.add(id);
    for (const c of index.children.get(id) ?? []) collect(c.id);
  };
  collect(place.id);
  // Move: any place of the same site in use, not in its own branch (BR-LOC4).
  const parent = site
    ? null
    : h(
        'select',
        { name: 'parent_id' },
        index.items
          .filter(
            (p) =>
              p.site_id === place.site_id &&
              !below.has(p.id) &&
              (p.is_active || p.id === place.parent_id),
          )
          .map((p) =>
            h(
              'option',
              { value: String(p.id) },
              `${' '.repeat(chainOf(index, p.id).length - 1)}${p.name}`,
            ),
          ),
      );
  if (parent) parent.value = String(place.parent_id);
  const active = h('input', { name: 'is_active', type: 'checkbox', class: 'checkbox' });
  active.checked = place.is_active;
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = { ...fields.read(), is_active: active.checked };
        if (parent) values.parent_id = Number(parent.value);
        const errors = checkPlaceForm(values, { site });
        if (Object.keys(errors).length) {
          return showErrors(form, errors, t('Check the highlighted fields.'));
        }
        onSave({ version: place.version, ...values }, form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    fields.elements,
    parent
      ? formRow('pl-parent_id', t('Inside'), parent, {
          hint: t('Move the place within its site: the records below follow, with their new path.'),
        })
      : null,
    formRow('pl-is_active', t('In use'), active, {
      hint: t('A place not in use is no longer offered, nor the places below it; records keep it.'),
    }),
    canEdit
      ? h(
          'div',
          { class: 'form-actions' },
          h('button', { type: 'submit', class: 'button button-primary online-only' }, t('Save')),
          h(
            'a',
            { href: addUrl, 'data-link': true, class: 'button button-secondary' },
            t('+ Add a place inside'),
          ),
        )
      : h(
          'div',
          { class: 'form-actions' },
          h(
            'a',
            { href: addUrl, 'data-link': true, class: 'button button-secondary' },
            t('+ Add a place inside'),
          ),
        ),
  );
  if (!canEdit) {
    for (const control of form.querySelectorAll('input, select')) control.disabled = true;
  }
  replaceChildren(
    container,
    panelHeader(place.name, onClose),
    h(
      'p',
      { class: 'muted user-meta' },
      activeBadge(place.is_active),
      ` · ${index.types.get(place.level_type_id)?.name ?? ''}`,
      t(' · Last changed {updated_at}', { updated_at: formatDateTime(place.updated_at) }),
    ),
    site ? null : h('p', { class: 'place-path' }, fullPath(index, place.id)),
    canEdit ? null : h('p', { class: 'form-help' }, t('Only administrators change sites.')),
    form,
  );
}

/**
 * Level types (admins): each one with its name, token, offered to staff and in use, and a
 * form for a new one.
 * @param {HTMLElement} container
 * @param {{ types: object[], onClose: () => void,
 *   onSave: (type: object | null, body: object, form: HTMLFormElement) => void }} options
 */
export function renderLevelTypes(container, { types, onClose, onSave }) {
  const typeForm = (type) => {
    const key = type ? `lt-${type.id}` : 'lt-new';
    const name = h('input', {
      name: 'name',
      type: 'text',
      maxlength: '50',
      value: type?.name ?? '',
    });
    const token = h('input', {
      name: 'token',
      type: 'text',
      maxlength: '20',
      autocapitalize: 'characters',
      value: type?.token ?? '',
    });
    const offered = h('input', { name: 'offered_to_staff', type: 'checkbox', class: 'checkbox' });
    offered.checked = Boolean(type?.offered_to_staff);
    const active = h('input', { name: 'is_active', type: 'checkbox', class: 'checkbox' });
    active.checked = type ? type.is_active : true;
    const isSite = type?.id === SITE_TYPE;
    token.disabled = isSite;
    offered.disabled = isSite;
    active.disabled = isSite || !type;
    const form = h(
      'form',
      {
        class: 'detail-form level-type-form',
        novalidate: true,
        onSubmit: (event) => {
          event.preventDefault();
          const values = { name: name.value.trim() };
          if (!isSite) {
            values.token = token.value.trim().toUpperCase();
            values.offered_to_staff = offered.checked;
          }
          if (type && !isSite) values.is_active = active.checked;
          const errors = {};
          if (!values.name) errors.name = t('Required');
          if (!isSite && !/^[A-Z][A-Z0-9_]{0,19}$/.test(values.token)) {
            errors.token = t('A capital letter, then capitals, digits or _');
          }
          if (Object.keys(errors).length) {
            return showErrors(form, errors, t('Check the highlighted fields.'));
          }
          onSave(type, type ? { version: type.version, ...values } : values, form);
        },
      },
      h('h3', { class: 'section-title' }, type ? type.name : t('New level type')),
      h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
      formRow(`${key}-name`, t('Name'), name, { required: true }),
      formRow(`${key}-token`, t('Token'), token, {
        required: true,
        hint: isSite
          ? t('The site type keeps its token.')
          : t('Its name in asset code patterns, e.g. BUILDING for {BUILDING}.'),
      }),
      formRow(`${key}-offered_to_staff`, t('Offered to staff'), offered, {
        hint: t('Staff can pick places of this type when they send a request.'),
      }),
      type ? formRow(`${key}-is_active`, t('In use'), active) : null,
      h(
        'div',
        { class: 'form-actions' },
        h(
          'button',
          { type: 'submit', class: 'button button-primary online-only' },
          type ? t('Save') : t('Add level type'),
        ),
      ),
    );
    return form;
  };
  replaceChildren(
    container,
    panelHeader(t('Level types'), onClose),
    h(
      'p',
      { class: 'form-help' },
      t(
        'The kinds of places: any type can sit under any place, so each site follows its own layout.',
      ),
    ),
    types.map(typeForm),
    typeForm(null),
  );
}
