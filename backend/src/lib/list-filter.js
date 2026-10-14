// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from 'zod';

/**
 * Query filter that takes one value or several joined by a separator (`status=OPEN,ON_HOLD`).
 * Duplicates are dropped; an empty value means "no filter".
 * @template {z.ZodType} T
 * @param {T} item schema of one value
 * @param {{ separator?: string, max?: number }} [options]
 */
export function listFilter(item, { separator = ',', max = 50 } = {}) {
  return z
    .string()
    .optional()
    .transform((v) => (v ? [...new Set(v.split(separator))] : undefined))
    .pipe(z.array(item).min(1).max(max).optional());
}

/**
 * Adds `column IN (@key0, @key1, …)` to a WHERE list. The column is a constant, the values
 * are bound parameters. Does nothing without values.
 * @param {string[]} where
 * @param {object} params
 * @param {string} column
 * @param {string} key unique parameter prefix
 * @param {Array<string | number> | undefined} values
 */
export function addInFilter(where, params, column, key, values) {
  if (!values?.length) return;
  where.push(`${column} IN (${values.map((_, i) => `@${key}${i}`).join(', ')})`);
  values.forEach((v, i) => (params[`${key}${i}`] = v));
}

/** Query filter of places (`location=12,15`): ids of the location tree (D82). */
export const placeFilter = () => listFilter(z.coerce.number().int().positive(), { max: 20 });

/**
 * Adds "the record's place is one of these places or below one" to a WHERE list (BR-LOC10).
 * The column is a constant, the place ids bound parameters. Does nothing without places.
 * @param {string[]} where
 * @param {object} params
 * @param {string} column a `location_id` column
 * @param {string} key unique parameter prefix
 * @param {number[] | undefined} ids
 */
export function addPlaceFilter(where, params, column, key, ids) {
  if (!ids?.length) return;
  where.push(`${column} IN (WITH RECURSIVE below (id) AS (
      SELECT id FROM locations WHERE id IN (${ids.map((_, i) => `@${key}${i}`).join(', ')})
      UNION SELECT l.id FROM locations l JOIN below ON l.parent_id = below.id
    ) SELECT id FROM below)`);
  ids.forEach((v, i) => (params[`${key}${i}`] = v));
}
