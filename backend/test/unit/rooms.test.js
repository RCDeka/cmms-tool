// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { missingPlace, roomProblem } from '../../src/rules/rooms.js';

describe('roomProblem (BR-RM4)', () => {
  const room = { site: 'Lyon', is_active: 1 };

  it('accepts an active room of the same site', () => {
    expect(roomProblem(room, 'Lyon')).toBeNull();
  });

  it('refuses an unknown or inactive room, or one of another site', () => {
    expect(roomProblem(undefined, 'Lyon')).toMatchObject({ rule: 'BR-RM4' });
    expect(roomProblem({ ...room, is_active: 0 }, 'Lyon')?.message).toMatch(/not in the room list/);
    expect(roomProblem(room, 'Lille')?.message).toMatch(/not on the site/);
  });
});

describe('missingPlace (BR-R1)', () => {
  it('needs a room or a description of the place', () => {
    expect(missingPlace({ room_id: 3 })).toBeNull();
    expect(missingPlace({ room_id: 3, location: 'Near the window' })).toBeNull();
    expect(missingPlace({ location: 'Tower A, floor 12' })).toBeNull();
    expect(missingPlace({})).toBe('location');
    expect(missingPlace({ room_id: null, location: '  ' })).toBe('location');
  });
});
