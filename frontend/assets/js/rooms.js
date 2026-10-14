// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Rooms (D81): the room picker of the request form and the room list kept by supervisors and
// admins (/admin/rooms, online only).
import { formRow, panelHeader, showErrors } from './admin-users.js';
import { badgeClass, h, replaceChildren } from './dom.js';
import { formatDateTime } from './format.js';
import { debounce } from './save-modes.js';

/** Pause after the last key before the list follows the search, as in the other lists. */
const SEARCH_DELAY_MS = 350;
/** Value of the "Not in the list" choice of the room picker. */
export const NOT_LISTED = 'none';

/**
 * Rank of a floor: basements (`B2`, `B1`) under the ground floor (`L0`), then the levels up
 * (`L1`, `L2`, …, `L12`). Other names come after, in natural order. Pure.
 */
function floorRank(floor) {
  const match = /^([BL])(\d+)$/.exec(floor);
  if (!match) return null;
  return match[1] === 'B' ? -Number(match[2]) : Number(match[2]);
}

/** Floor order for the picker and the list. Pure. */
export function compareFloors(a, b) {
  const [ra, rb] = [floorRank(a), floorRank(b)];
  if (ra !== null && rb !== null) return ra - rb;
  if (ra !== null) return -1;
  if (rb !== null) return 1;
  return a.localeCompare(b, 'en', { numeric: true });
}

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const unique = (values) => [...new Set(values)];

/** Buildings of a site's rooms, in name order. Pure. */
export const buildingsOf = (rooms) => unique(rooms.map((r) => r.building)).sort(natural);

/** Floors of a building, lowest first. Pure. */
export const floorsOf = (rooms, building) =>
  unique(rooms.filter((r) => r.building === building).map((r) => r.floor)).sort(compareFloors);

/** Rooms of a floor, in name order (Meeting room 12.02 before 12.10). Pure. */
export const roomsOn = (rooms, building, floor) =>
  rooms
    .filter((r) => r.building === building && r.floor === floor)
    .sort((a, b) => natural(a.name, b.name));

/** Start of the place in words when the room is not in the list: "Tower A, L12, ". Pure. */
export function placePrefix(building, floor) {
  return [building, floor].filter(Boolean).join(', ') + (building ? ', ' : '');
}

/**
 * The room picker: building, floor, then room or "Not in the list". `onChange` tells which
 * room is chosen (its id, NOT_LISTED, or '' while the choice is not finished).
 * @param {{ onChange: (state: { roomId: string, building: string, floor: string }) => void }} options
 * @returns {{ element: HTMLElement, setRooms: (rooms: object[], keep?: object) => void,
 *   value: () => { roomId: string, building: string, floor: string } }}
 */
export function roomPicker({ onChange }) {
  const select = (name, label) => {
    const el = h('select', { id: `r-${name}`, name });
    const row = h(
      'div',
      { class: 'room-picker-field' },
      h('label', { for: el.id, class: 'room-picker-label' }, label),
      el,
    );
    return { el, row };
  };
  const building = select('building', 'Building');
  const floor = select('floor', 'Floor');
  const room = select('room_id', 'Room');
  let rooms = [];
  const options = (el, placeholder, values, extra = []) => {
    replaceChildren(
      el,
      h('option', { value: '' }, placeholder),
      values.map(([value, label]) => h('option', { value }, label)),
      extra.map(([value, label]) => h('option', { value }, label)),
    );
  };
  const state = () => ({
    roomId: room.el.value,
    building: building.el.value,
    floor: floor.el.value,
  });
  const fillFloors = () => {
    const floors = building.el.value ? floorsOf(rooms, building.el.value) : [];
    options(
      floor.el,
      '— Choose —',
      floors.map((f) => [f, f]),
    );
    floor.el.disabled = !building.el.value;
    if (floors.length === 1) floor.el.value = floors[0];
  };
  const fillRooms = () => {
    const list = floor.el.value ? roomsOn(rooms, building.el.value, floor.el.value) : [];
    options(
      room.el,
      '— Choose —',
      list.map((r) => [String(r.id), r.name]),
      [[NOT_LISTED, 'Not in the list']],
    );
  };
  building.el.addEventListener('change', () => {
    fillFloors();
    fillRooms();
    onChange(state());
  });
  floor.el.addEventListener('change', () => {
    fillRooms();
    onChange(state());
  });
  room.el.addEventListener('change', () => onChange(state()));

  const element = h(
    'div',
    { class: 'form-row room-picker', role: 'group', 'aria-labelledby': 'r-room-label' },
    h('span', { id: 'r-room-label', class: 'field-label' }, 'Room'),
    h(
      'div',
      { class: 'form-control' },
      h('div', { class: 'room-picker-fields' }, building.row, floor.row, room.row),
      h(
        'p',
        { class: 'field-hint' },
        'Not in the list? Choose “Not in the list” and say where it is below.',
      ),
    ),
  );
  // Shown once the site's rooms are known, and only if it has some.
  element.hidden = true;
  return {
    element,
    /** New list of rooms (a new site); `keep` restores a choice made before. */
    setRooms(list, keep = {}) {
      rooms = list;
      const buildings = buildingsOf(rooms);
      options(
        building.el,
        '— Choose —',
        buildings.map((b) => [b, b]),
      );
      building.el.value = buildings.includes(keep.building)
        ? keep.building
        : buildings.length === 1
          ? buildings[0]
          : '';
      fillFloors();
      if (keep.floor && [...floor.el.options].some((o) => o.value === keep.floor)) {
        floor.el.value = keep.floor;
      }
      fillRooms();
      if (keep.roomId && [...room.el.options].some((o) => o.value === keep.roomId)) {
        room.el.value = keep.roomId;
      }
      element.hidden = rooms.length === 0;
    },
    value: state,
  };
}

// --- Room list (/admin/rooms) -------------------------------------------------------------

/** Room list URL with its filters, or a room's panel when `id` is given. Pure. */
export function roomsUrl({ q, site, active, page, id } = {}) {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (site) query.set('site', site);
  if (active) query.set('active', active);
  if (page > 1) query.set('page', String(page));
  const text = query.toString();
  return `/admin/rooms${id ? `/${id}` : ''}${text ? `?${text}` : ''}`;
}

/** Filters of the room list from the URL query (invalid values dropped). Pure. */
export function parseRoomFilters(query) {
  const filters = {};
  const q = query.get('q')?.trim();
  if (q) filters.q = q.slice(0, 100);
  const site = query.get('site')?.trim();
  if (site) filters.site = site.slice(0, 200);
  if (['true', 'false'].includes(query.get('active'))) filters.active = query.get('active');
  return filters;
}

/** Checks of the room form (the server checks again). Pure. */
export function checkRoomForm(values, { creating }) {
  const errors = {};
  const fields = creating ? ['site', 'building', 'floor', 'name'] : ['building', 'floor', 'name'];
  for (const field of fields) {
    if (!String(values[field] ?? '').trim()) errors[field] = 'Required';
  }
  return errors;
}

const activeBadge = (active) =>
  h(
    'span',
    { class: badgeClass('active', String(active), active ? 'success' : 'neutral') },
    active ? 'In use' : 'Not in use',
  );

/**
 * Room list with its filter row.
 * @param {HTMLElement} container
 * @param {{ data: object, filters: object, sites: string[], selectedId: number | null,
 *   onFilter: (filters: object, options?: { typing?: boolean }) => void,
 *   pagination: HTMLElement | null, paginationTop: HTMLElement | null }} options
 */
export function renderRoomList(
  container,
  { data, filters, sites, selectedId, onFilter, pagination, paginationTop },
) {
  const search = h('input', {
    id: 'rooms-q',
    type: 'search',
    maxlength: '100',
    value: filters.q ?? '',
    placeholder: 'Room, building or floor',
  });
  const site = h(
    'select',
    { id: 'rooms-site' },
    h('option', { value: '' }, 'Any'),
    sites.map((s) => h('option', { value: s }, s)),
  );
  site.value = filters.site ?? '';
  const active = h(
    'select',
    { id: 'rooms-active' },
    h('option', { value: '' }, 'Any'),
    h('option', { value: 'true' }, 'In use'),
    h('option', { value: 'false' }, 'Not in use'),
  );
  active.value = filters.active ?? '';
  const read = () => ({
    q: search.value.trim() || undefined,
    site: site.value || undefined,
    active: active.value || undefined,
  });
  const apply = () => onFilter(read());
  const typed = debounce(() => onFilter(read(), { typing: true }), SEARCH_DELAY_MS);
  search.addEventListener('input', () => {
    if ((search.value.trim() || undefined) !== filters.q) typed();
  });
  site.addEventListener('change', apply);
  active.addEventListener('change', apply);

  const rows = data.items.map((r) =>
    h(
      'tr',
      {
        class: `table-row${r.id === selectedId ? ' is-selected' : ''}`,
        'aria-current': r.id === selectedId ? 'true' : null,
        onClick: (event) => {
          if (!event.target.closest('a')) event.currentTarget.querySelector('a').click();
        },
      },
      h(
        'td',
        {},
        h('a', { href: `/admin/rooms/${r.id}${location.search}`, 'data-link': true }, r.name),
      ),
      h('td', {}, r.building),
      h('td', {}, r.floor),
      h('td', { class: 'col-secondary' }, r.site),
      h('td', {}, activeBadge(r.is_active)),
    ),
  );
  replaceChildren(
    container,
    h('h2', { class: 'table-title visually-hidden', tabindex: '-1' }, 'Rooms'),
    h(
      'form',
      {
        class: 'filter-bar',
        role: 'search',
        'aria-label': 'Search rooms',
        onSubmit: (event) => {
          event.preventDefault();
          apply();
        },
      },
      h(
        'div',
        { class: 'filter-field filter-search' },
        h('label', { for: 'rooms-q' }, 'Search'),
        search,
      ),
      h('div', { class: 'filter-field' }, h('label', { for: 'rooms-site' }, 'Site'), site),
      h('div', { class: 'filter-field' }, h('label', { for: 'rooms-active' }, 'Status'), active),
    ),
    h(
      'div',
      { class: 'table-header' },
      paginationTop,
      h(
        'p',
        { class: 'table-count', role: 'status' },
        `${data.total} ${data.total === 1 ? 'room' : 'rooms'}`,
      ),
      h(
        'a',
        {
          href: `/admin/rooms/new${location.search}`,
          'data-link': true,
          class: 'button button-primary',
        },
        '+ New room',
      ),
    ),
    data.items.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data-table rooms-table' },
            h('caption', { class: 'visually-hidden' }, `Rooms, page ${data.page} of ${data.pages}`),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ['Room', 'Building', 'Floor', 'Site', 'Status'].map((t) =>
                  h('th', { scope: 'col', class: t === 'Site' ? 'col-secondary' : null }, t),
                ),
              ),
            ),
            h('tbody', {}, rows),
          ),
        )
      : h('p', { class: 'empty-state' }, 'No room matches this search.'),
    pagination,
  );
}

/** Text fields of the room form. */
function roomFields(room) {
  const text = (name, max, value) =>
    h('input', {
      name,
      type: 'text',
      maxlength: String(max),
      autocomplete: 'off',
      value: value ?? '',
    });
  const building = text('building', 100, room?.building);
  const floor = text('floor', 50, room?.floor);
  const name = text('name', 100, room?.name);
  return {
    controls: { building, floor, name },
    elements: [
      formRow('rm-building', 'Building', building, { required: true, hint: 'e.g. “Tower A”.' }),
      formRow('rm-floor', 'Floor', floor, {
        required: true,
        hint: 'As on the assets: B1 for the first basement, L0 for the ground floor, L12…',
      }),
      formRow('rm-name', 'Room', name, {
        required: true,
        hint: 'The name people use, e.g. “Meeting room 12.02”.',
      }),
    ],
  };
}

/** Creation form of a room. */
export function renderRoomCreate(container, { sites, site: chosen, onClose, onCreate }) {
  const site = h(
    'select',
    { name: 'site' },
    h('option', { value: '' }, '— Choose —'),
    sites.map((s) => h('option', { value: s }, s)),
  );
  site.value = sites.includes(chosen) ? chosen : '';
  const { controls, elements } = roomFields(null);
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = {
          site: site.value,
          ...Object.fromEntries(Object.entries(controls).map(([k, el]) => [k, el.value.trim()])),
        };
        const errors = checkRoomForm(values, { creating: true });
        if (Object.keys(errors).length) {
          return showErrors(form, errors, 'Check the highlighted fields.');
        }
        onCreate(values, form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h(
      'p',
      { class: 'form-help' },
      'Staff pick rooms from this list when they send a request. Fields marked * are required.',
    ),
    formRow('rm-site', 'Site', site, {
      required: true,
      hint: 'Cannot be changed later: a room of another site is a new room.',
    }),
    elements,
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'submit', class: 'button button-primary online-only' }, 'Create room'),
    ),
  );
  replaceChildren(container, panelHeader('New room', onClose), form);
}

/** Panel of one room: building, floor, name and whether it is offered to staff. */
export function renderRoomPanel(container, { room, onClose, onSave }) {
  const { controls, elements } = roomFields(room);
  const active = h('input', { name: 'is_active', type: 'checkbox', class: 'checkbox' });
  active.checked = room.is_active;
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = {
          ...Object.fromEntries(Object.entries(controls).map(([k, el]) => [k, el.value.trim()])),
          is_active: active.checked,
        };
        const errors = checkRoomForm(values, { creating: false });
        if (Object.keys(errors).length) {
          return showErrors(form, errors, 'Check the highlighted fields.');
        }
        onSave(values, form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h(
      'div',
      { class: 'form-row is-readonly' },
      h('span', { class: 'field-label' }, 'Site'),
      h('div', { class: 'field-value' }, room.site),
    ),
    elements,
    formRow('rm-is_active', 'In use', active, {
      hint: 'Rooms not in use are no longer offered to staff; requests sent from them keep them.',
    }),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'submit', class: 'button button-primary online-only' }, 'Save'),
    ),
  );
  replaceChildren(
    container,
    panelHeader(room.name, onClose),
    h(
      'p',
      { class: 'muted user-meta' },
      activeBadge(room.is_active),
      ` · Last changed ${formatDateTime(room.updated_at)}`,
    ),
    form,
  );
}
