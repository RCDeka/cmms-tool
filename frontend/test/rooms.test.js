// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from 'vitest';
import { renderValue, roomLabel } from '../assets/js/format.js';
import {
  checkRequest,
  renderRequestForm,
  requestPayload,
  requestPlace,
} from '../assets/js/requests.js';
import {
  NOT_LISTED,
  buildingsOf,
  checkRoomForm,
  compareFloors,
  floorsOf,
  parseRoomFilters,
  placePrefix,
  roomPicker,
  roomsOn,
  roomsUrl,
} from '../assets/js/rooms.js';
import { parseRoute } from '../assets/js/router.js';

const ROOMS = [
  { id: 1, building: 'Tower B', floor: 'L1', name: 'Kitchen 1' },
  { id: 2, building: 'Tower A', floor: 'L12', name: 'Meeting room 12.10' },
  { id: 3, building: 'Tower A', floor: 'L12', name: 'Meeting room 12.02' },
  { id: 4, building: 'Tower A', floor: 'L2', name: 'Open space 2 West' },
  { id: 5, building: 'Tower A', floor: 'B1', name: 'Archive room' },
  { id: 6, building: 'Tower A', floor: 'L0', name: 'Lobby' },
];

describe('room picker logic (D81)', () => {
  it('orders floors from the lowest basement up, then other names', () => {
    expect(['L12', 'Roof', 'L2', 'B1', 'L0', 'B2', 'Mezzanine'].sort(compareFloors)).toEqual([
      'B2',
      'B1',
      'L0',
      'L2',
      'L12',
      'Mezzanine',
      'Roof',
    ]);
  });

  it('lists buildings, then the floors of one, then the rooms of a floor in natural order', () => {
    expect(buildingsOf(ROOMS)).toEqual(['Tower A', 'Tower B']);
    expect(floorsOf(ROOMS, 'Tower A')).toEqual(['B1', 'L0', 'L2', 'L12']);
    expect(roomsOn(ROOMS, 'Tower A', 'L12').map((r) => r.id)).toEqual([3, 2]);
  });

  it('starts the place in words with the building and floor already chosen', () => {
    expect(placePrefix('Tower A', 'L12')).toBe('Tower A, L12, ');
    expect(placePrefix('Tower A', '')).toBe('Tower A, ');
    expect(placePrefix('', '')).toBe('');
  });

  it('labels a room in one line', () => {
    expect(roomLabel(ROOMS[2])).toBe('Tower A, L12, Meeting room 12.02');
    expect(renderValue('room', { type: 'room' }, ROOMS[2])).toBe(
      'Tower A, L12, Meeting room 12.02',
    );
  });

  it('goes building → floor → room, choosing a lone building or floor by itself', () => {
    const onChange = vi.fn();
    const picker = roomPicker({ onChange });
    expect(picker.element.hidden).toBe(true);
    picker.setRooms(ROOMS.filter((r) => r.building === 'Tower B'));
    expect(picker.element.hidden).toBe(false);
    expect(picker.value()).toEqual({ roomId: '', building: 'Tower B', floor: 'L1' });
    const room = picker.element.querySelector('[name="room_id"]');
    expect([...room.options].map((o) => o.textContent)).toEqual([
      '— Choose —',
      'Kitchen 1',
      'Not in the list',
    ]);
    room.value = NOT_LISTED;
    room.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith({
      roomId: NOT_LISTED,
      building: 'Tower B',
      floor: 'L1',
    });

    picker.setRooms(ROOMS, { building: 'Tower A', floor: 'L12', roomId: '2' });
    expect(picker.value()).toEqual({ roomId: '2', building: 'Tower A', floor: 'L12' });
    const building = picker.element.querySelector('[name="building"]');
    building.value = 'Tower B';
    building.dispatchEvent(new Event('change'));
    expect(picker.value()).toEqual({ roomId: '', building: 'Tower B', floor: 'L1' });
    picker.setRooms([]);
    expect(picker.element.hidden).toBe(true);
  });
});

describe('requests from a room (BR-R1, D81)', () => {
  const values = {
    title: 'Leak',
    site: 'A',
    location: '',
    category: '',
    priority: '',
    description: '',
    has_rooms: true,
  };

  it('needs a room, or the place in words', () => {
    expect(checkRequest({ ...values, room_id: '3' })).toEqual({});
    expect(checkRequest({ ...values, room_id: NOT_LISTED }).location).toMatch(/pick a room/);
    expect(checkRequest({ ...values, room_id: NOT_LISTED, location: 'Hall' })).toEqual({});
  });

  it('sends the room id, and the words only when there are some', () => {
    expect(requestPayload({ ...values, room_id: '3' }, 'c1')).toEqual({
      client_id: 'c1',
      title: 'Leak',
      site: 'A',
      room_id: 3,
    });
    expect(
      requestPayload({ ...values, room_id: NOT_LISTED, location: ' Tower A, L1, hall ' }, 'c1'),
    ).toEqual({ client_id: 'c1', title: 'Leak', site: 'A', location: 'Tower A, L1, hall' });
  });

  it('shows the room, then the words about the place', () => {
    expect(requestPlace({ room: ROOMS[2], location: 'By the window' })).toBe(
      'Tower A, L12, Meeting room 12.02 — By the window',
    );
    expect(requestPlace({ room: null, location: 'Garage door' })).toBe('Garage door');
  });

  it('loads the rooms of the site and makes the place optional once a room is picked', async () => {
    const container = document.createElement('div');
    const loadRooms = vi.fn().mockResolvedValue(ROOMS);
    const onSubmit = vi.fn().mockResolvedValue(true);
    renderRequestForm(container, { sites: ['A', 'B'], defaultSite: 'A', loadRooms, onSubmit });
    await vi.waitFor(() => expect(container.querySelector('.room-picker').hidden).toBe(false));
    expect(loadRooms).toHaveBeenCalledWith('A');
    const pick = (name, value) => {
      const el = container.querySelector(`[name="${name}"]`);
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    pick('building', 'Tower A');
    pick('floor', 'L12');
    const location = container.querySelector('[name="location"]');
    expect(location.hasAttribute('aria-required')).toBe(true);
    pick('room_id', '3');
    expect(location.hasAttribute('aria-required')).toBe(false);
    pick('room_id', NOT_LISTED);
    expect(location.value).toBe('Tower A, L12, ');
    pick('room_id', '3');
    location.value = '';
    container.querySelector('[name="title"]').value = 'Leak';
    container.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ site: 'A', room_id: 3 });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('location');
  });

  it('keeps the place in words when the rooms cannot be loaded (offline)', async () => {
    const container = document.createElement('div');
    const loadRooms = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 0 }));
    renderRequestForm(container, { sites: ['A'], defaultSite: 'A', loadRooms, onSubmit: vi.fn() });
    await vi.waitFor(() => expect(loadRooms).toHaveBeenCalled());
    expect(container.querySelector('.room-picker').hidden).toBe(true);
    expect(container.querySelector('[name="location"]').hasAttribute('aria-required')).toBe(true);
  });
});

describe('room list (/admin/rooms)', () => {
  it('reads and writes its filters in the URL', () => {
    const filters = parseRoomFilters(new URLSearchParams('q=+12.0+&site=Lyon&active=maybe'));
    expect(filters).toEqual({ q: '12.0', site: 'Lyon' });
    expect(roomsUrl({ ...filters, active: 'false', page: 2 })).toBe(
      '/admin/rooms?q=12.0&site=Lyon&active=false&page=2',
    );
    expect(roomsUrl({ id: 7 })).toBe('/admin/rooms/7');
  });

  it('routes the list, the creation form and a room', () => {
    expect(parseRoute('/admin/rooms', '?site=Lyon')).toMatchObject({
      name: 'rooms',
      filters: { site: 'Lyon' },
    });
    expect(parseRoute('/admin/rooms/new').name).toBe('roomCreate');
    expect(parseRoute('/admin/rooms/12')).toMatchObject({ name: 'room', id: 12 });
    expect(parseRoute('/admin/rooms/x').name).toBe('notFound');
  });

  it('requires the site only when creating', () => {
    const room = { building: 'Tower A', floor: 'L1', name: 'Hall' };
    expect(checkRoomForm(room, { creating: false })).toEqual({});
    expect(checkRoomForm(room, { creating: true })).toEqual({ site: 'Required' });
    expect(checkRoomForm({ ...room, name: ' ' }, { creating: false })).toEqual({
      name: 'Required',
    });
  });
});
