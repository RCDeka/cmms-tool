// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Row → API shape conversions (docs/api-design.md → Shared shapes).
// Queries alias joined columns as `<prefix>__<column>` and these helpers rebuild the objects.

/** SQLite stores booleans as 0/1. */
export const toBool = (value) => value === 1;

/** SELECT list for a user reference joined as `alias`. */
export const userRefColumns = (alias) =>
  `${alias}.id AS ${alias}__id, ${alias}.last_name AS ${alias}__last_name, ${alias}.first_name AS ${alias}__first_name`;

/** `{ id, last_name, first_name }` or null when the join found no user. */
export function userRef(row, alias) {
  const id = row[`${alias}__id`];
  return id === null || id === undefined
    ? null
    : { id, last_name: row[`${alias}__last_name`], first_name: row[`${alias}__first_name`] };
}

/** SELECT list for a room reference joined as `alias` (D81). */
export const roomRefColumns = (alias) =>
  `${alias}.id AS ${alias}__id, ${alias}.building AS ${alias}__building, ${alias}.floor AS ${alias}__floor, ${alias}.name AS ${alias}__name`;

/** `{ id, building, floor, name }` or null when the record names no room. */
export function roomRef(row, alias) {
  const id = row[`${alias}__id`];
  return id === null || id === undefined
    ? null
    : {
        id,
        building: row[`${alias}__building`],
        floor: row[`${alias}__floor`],
        name: row[`${alias}__name`],
      };
}

/** Public user shape. Never includes password_hash. */
export function toUser(row) {
  return {
    id: row.id,
    last_name: row.last_name,
    first_name: row.first_name,
    username: row.username,
    role: row.role,
    site: row.site,
    specialty: row.specialty,
    power_user: toBool(row.power_user),
    ...(row.is_active !== undefined && { is_active: toBool(row.is_active) }),
  };
}
