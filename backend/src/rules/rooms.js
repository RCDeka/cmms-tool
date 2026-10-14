// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Rooms (D81): the places staff pick from when they send a request. Pure rules.

/**
 * Why a request cannot name this room, or null (BR-RM4): it must be an active room of the
 * request's site. Pure.
 * @param {{ site: string, is_active: number } | undefined} room the room, undefined if unknown
 * @param {string} site the request's site
 * @returns {{ rule: string, message: string } | null}
 */
export function roomProblem(room, site) {
  if (!room || room.is_active !== 1) {
    return { rule: 'BR-RM4', message: 'This room is not in the room list any more.' };
  }
  if (room.site !== site) {
    return { rule: 'BR-RM4', message: 'This room is not on the site chosen.' };
  }
  return null;
}

/**
 * Where a request was sent from, in the BR-R1 sense: a room or a description of the place.
 * Returns the missing field, or null. Pure.
 * @param {{ room_id?: number | null, location?: string | null }} request
 */
export function missingPlace(request) {
  const hasRoom = request.room_id !== undefined && request.room_id !== null;
  return hasRoom || (request.location ?? '').trim() ? null : 'location';
}
