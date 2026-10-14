// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOT_LISTED,
  checkPlaceForm,
  choicesUnder,
  fullPath,
  parsePlaceFilters,
  placeIndex,
  placeOf,
  placePicker,
  placesUrl,
  renderPlaceTree,
  searchPlaces,
} from '../assets/js/places.js';
import {
  checkRequest,
  placePrefix,
  renderRequestForm,
  requestPayload,
  requestPlace,
} from '../assets/js/requests.js';
import { parseRoute } from '../assets/js/router.js';
import { TREE } from './fixtures/places.js';

const index = placeIndex(TREE);
const offered = (p) => Boolean(index.types.get(p.level_type_id)?.offered_to_staff);
const choose = (list, value) => {
  list.value = String(value);
  list.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('tree helpers', () => {
  it('gives the site and the path below it, as the server stores them', () => {
    expect(placeOf(index, 22)).toEqual({
      site: 'Paris HQ',
      place: 'Tower A › L12 › Meeting room 12.02',
    });
    expect(placeOf(index, 2)).toEqual({ site: 'Paris HQ', place: '' });
    expect(fullPath(index, 11)).toBe('Lyon Part-Dieu Branch › Main building › L-1');
    expect(placeOf(index, 999)).toEqual({ site: '', place: '' });
    expect(placeIndex(TREE)).toBe(index); // built once per tree
  });

  it('offers places in use, and for staff only the branches that lead to a room', () => {
    expect(choicesUnder(index, 13).map((p) => p.name)).toEqual(['Banking hall']);
    expect(choicesUnder(index, 13, { keep: 15 }).map((p) => p.name)).toEqual([
      'Banking hall',
      'Old archive',
    ]);
    // B1 holds no room: staff are not led there.
    expect(choicesUnder(index, 20, { selectable: offered }).map((p) => p.name)).toEqual(['L12']);
  });

  it('finds places by every word of their path', () => {
    expect(searchPlaces(index, 'tower 12.0').map((p) => p.id)).toEqual([22]);
    expect(searchPlaces(index, 'plant').map((p) => p.id)).toEqual([12, 25]);
    expect(searchPlaces(index, 'archive')).toEqual([]); // not in use
    expect(searchPlaces(index, '  ')).toEqual([]);
    expect(searchPlaces(index, 'plant', { selectable: offered }).map((p) => p.id)).toEqual([12]);
  });
});

describe('placePicker', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('goes down one list per level, each named after its level type', () => {
    const onChange = vi.fn();
    const picker = placePicker({ id: 'pp', index, onChange });
    document.body.append(picker.element);
    expect(picker.lists()).toHaveLength(1);
    expect(picker.value()).toBeNull();
    choose(picker.lists()[0], 2);
    expect(picker.value()).toBe(2); // the site itself
    choose(picker.lists()[1], 20);
    const labels = [...picker.element.querySelectorAll('.place-picker-field label')].map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(['Site', 'Building', 'Floor']);
    expect(picker.lists()[2].options[0].textContent).toBe('— Tower A itself —');
    choose(picker.lists()[2], 21);
    choose(picker.lists()[3], 23);
    expect(picker.value()).toBe(23);
    expect(onChange).toHaveBeenCalledTimes(4);
    // Back up a level: the lists below go.
    choose(picker.lists()[1], '');
    expect(picker.lists()).toHaveLength(2);
    expect(picker.value()).toBe(2);
  });

  it('shows the chain of a place it is given, a place not in use included', () => {
    const picker = placePicker({ id: 'pp', index });
    picker.set(15);
    expect(picker.lists().map((l) => l.value)).toEqual(['1', '10', '13', '15']);
    expect(picker.lists()[3].selectedOptions[0].textContent).toBe('Old archive (not in use)');
    picker.setDisabled(true);
    expect(picker.lists().every((l) => l.disabled)).toBe(true);
    picker.set(null);
    expect(picker.value()).toBeNull();
  });

  it('gives staff the rooms of a site, a lone building chosen by itself, and “Not in the list”', () => {
    const picker = placePicker({
      id: 'pp',
      index,
      scope: 1,
      selectable: offered,
      notListed: true,
      autoPick: true,
    });
    // Lyon has one building: it is chosen; the floors come next.
    expect(picker.lists().map((l) => l.value)).toEqual(['10', '']);
    expect(picker.value()).toBeNull();
    choose(picker.lists()[1], 13);
    const rooms = picker.lists()[2];
    expect([...rooms.options].map((o) => o.textContent)).toEqual([
      '— Choose —',
      'Banking hall',
      'Not in the list',
    ]);
    choose(rooms, 14);
    expect(picker.value()).toBe(14);
    choose(rooms, NOT_LISTED);
    expect(picker.value()).toBe(NOT_LISTED);
    expect(picker.deepest()).toBe(13);
    picker.setScope(2);
    expect(picker.lists()[0].value).toBe('20');
  });
});

describe('request form (BR-L9)', () => {
  const values = {
    title: 'Leak',
    site: 'Paris HQ',
    location: '',
    category: '',
    priority: '',
    description: '',
    has_places: true,
  };

  it('needs a place of the list, or the place in words', () => {
    expect(checkRequest({ ...values, location_id: 22 })).toEqual({});
    expect(checkRequest({ ...values, location_id: NOT_LISTED }).location).toMatch(/pick a room/);
    expect(checkRequest({ ...values, location_id: null, location: 'Hall' })).toEqual({});
  });

  it('sends the place id, and the words only when there are some', () => {
    expect(requestPayload({ ...values, location_id: 22 }, 'c1')).toEqual({
      client_id: 'c1',
      title: 'Leak',
      site: 'Paris HQ',
      location_id: 22,
    });
    expect(
      requestPayload({ ...values, location_id: NOT_LISTED, location: ' Tower A, L1 ' }, 'c1'),
    ).toEqual({ client_id: 'c1', title: 'Leak', site: 'Paris HQ', location: 'Tower A, L1' });
  });

  it('shows the place, then the words about it', () => {
    expect(
      requestPlace({ place: 'Tower A › L12 › Meeting room 12.02', location: 'By the window' }),
    ).toBe('Tower A › L12 › Meeting room 12.02 — By the window');
    expect(requestPlace({ place: '', location: 'Garage door' })).toBe('Garage door');
    expect(placePrefix('Tower A › L12')).toBe('Tower A, L12, ');
    expect(placePrefix('')).toBe('');
  });

  it('offers the rooms of the site from the cached tree, offline too', async () => {
    const container = document.createElement('div');
    const onSubmit = vi.fn().mockResolvedValue(true);
    renderRequestForm(container, {
      sites: ['Lyon Part-Dieu Branch', 'Paris HQ'],
      defaultSite: 'Paris HQ',
      places: TREE,
      onSubmit,
    });
    const row = container.querySelector('.place-row');
    expect(row.hidden).toBe(false);
    const lists = () => [...row.querySelectorAll('.place-picker-fields select')];
    // One building, one floor leading to rooms: both chosen by themselves.
    expect(lists().map((l) => l.value)).toEqual(['20', '21', '']);
    const location = container.querySelector('[name="location"]');
    expect(location.hasAttribute('aria-required')).toBe(true);
    choose(lists()[2], 22);
    expect(location.hasAttribute('aria-required')).toBe(false);
    choose(lists()[2], NOT_LISTED);
    expect(location.value).toBe('Tower A, L12, ');
    choose(lists()[2], 22);
    location.value = '';
    container.querySelector('[name="title"]').value = 'Leak';
    container.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ site: 'Paris HQ', location_id: 22 });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('location');
  });

  it('asks for words alone on a site without rooms, or without a cached tree', () => {
    const container = document.createElement('div');
    renderRequestForm(container, {
      sites: ['A'],
      defaultSite: 'A',
      places: null,
      onSubmit: vi.fn(),
    });
    expect(container.querySelector('.place-row').hidden).toBe(true);
    expect(container.querySelector('[name="location"]').hasAttribute('aria-required')).toBe(true);
  });
});

describe('Places page (/admin/locations)', () => {
  it('reads and writes its filters in the URL', () => {
    const filters = parsePlaceFilters(new URLSearchParams('q=+12.0+&all=1&parent=x'));
    expect(filters).toEqual({ q: '12.0', all: true });
    expect(placesUrl({ ...filters, panel: 7 })).toBe('/admin/locations/7?q=12.0&all=1');
    expect(placesUrl({ parent: 20, panel: 'new' })).toBe('/admin/locations/new?parent=20');
    expect(placesUrl()).toBe('/admin/locations');
  });

  it('routes the tree, a place, the creation form and the level types', () => {
    expect(parseRoute('/admin/locations', '?q=tower')).toMatchObject({
      name: 'places',
      filters: { q: 'tower' },
    });
    expect(parseRoute('/admin/locations/new', '?parent=20')).toMatchObject({
      name: 'placeCreate',
      filters: { parent: 20 },
    });
    expect(parseRoute('/admin/locations/types').name).toBe('levelTypes');
    expect(parseRoute('/admin/locations/12')).toMatchObject({ name: 'place', id: 12 });
    expect(parseRoute('/admin/locations/x').name).toBe('notFound');
  });

  it('checks the place form', () => {
    expect(checkPlaceForm({ name: 'L3', code: '13', level_type_id: 3 }, { site: false })).toEqual(
      {},
    );
    expect(
      checkPlaceForm({ name: ' ', code: 'a-1', level_type_id: null }, { site: false }),
    ).toEqual({
      name: 'Required',
      code: 'Capitals and digits only, 1 to 10 characters',
      level_type_id: 'Required',
    });
    expect(checkPlaceForm({ name: 'A › B', code: null }, { site: true })).toEqual({
      name: 'The character › is not allowed',
    });
  });

  it('shows the tree with folding branches, and the search as paths', () => {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const onFilter = vi.fn();
    const draw = (filters = {}, selectedId = null) =>
      renderPlaceTree(container, { index, filters, selectedId, canAddSite: true, onFilter });
    draw();
    // Sites are open: their buildings show; deeper branches are folded.
    const names = () => [...container.querySelectorAll('.place-line a')].map((a) => a.textContent);
    expect(names()).toEqual(['Lyon Part-Dieu Branch', 'Main building', 'Paris HQ', 'Tower A']);
    const toggle = container.querySelector('[data-place="20"] .place-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(names()).toContain('L12');
    expect(
      container.querySelector('[data-place="20"] .place-toggle').getAttribute('aria-expanded'),
    ).toBe('true');
    // The chosen place shows, its branch open; places not in use only on demand.
    draw({}, 15);
    expect(names()).not.toContain('Old archive');
    draw({ all: true }, 15);
    expect(container.querySelector('[aria-current="true"]').textContent).toBe('Old archive');
    draw({ q: 'meeting' });
    expect(names()).toEqual([
      'Paris HQ › Tower A › L12 › Meeting room 12.02',
      'Paris HQ › Tower A › L12 › Meeting room 12.10',
    ]);
    expect(container.querySelector('.table-count').textContent).toBe('2 places match');
  });
});
