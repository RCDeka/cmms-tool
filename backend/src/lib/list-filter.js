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
