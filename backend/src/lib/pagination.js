import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** Query fields shared by every paginated list (docs/api-design.md → Conventions). */
export const pageQueryFields = {
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

/** Route parameter `:id`: a positive integer written in plain decimal digits. */
export const idParams = z.strictObject({
  id: z
    .string()
    .regex(/^[1-9]\d{0,15}$/, 'Must be a positive integer')
    .transform(Number),
});

/** Number of pages; at least 1, so an empty list still reads "page 1 of 1". */
export function pageCount(total, size) {
  return Math.max(1, Math.ceil(total / size));
}

/** Row offset of a page. */
export function pageOffset(page, size) {
  return (page - 1) * size;
}

/** Builds the paginated response `{ total, page, pages, items }`. */
export function pageResponse({ total, page, size, items }) {
  return { total, page, pages: pageCount(total, size), items };
}

/**
 * SQL expression ranking an enum column in business order (e.g. priority LOW < URGENT)
 * instead of alphabetical order.
 * @param {string} column qualified column name (a constant, never user input)
 * @param {string[]} values enum values in ascending order
 */
export function rankExpression(column, values) {
  if (!values.every((v) => /^[A-Z_]+$/.test(v))) throw new Error('Enum values must be codes');
  const whens = values.map((v, i) => `WHEN '${v}' THEN ${i}`).join(' ');
  return `CASE ${column} ${whens} END`;
}

/**
 * ORDER BY clause from a whitelisted sort key. The id tiebreaker keeps pages stable when
 * many rows share a value.
 * @param {Record<string, string>} columns sort key → SQL expression (constants only)
 * @param {string} sort a key of `columns` (validated beforehand)
 * @param {'asc' | 'desc'} order
 * @param {string} idColumn qualified id column for the tiebreaker
 */
export function orderByClause(columns, sort, order, idColumn) {
  const expression = columns[sort];
  if (!expression) throw new Error(`Unknown sort key: ${sort}`);
  const direction = order === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${expression} ${direction}, ${idColumn} ${direction}`;
}

/** zod fields for `sort` and `order`, restricted to the whitelist. */
export function sortQueryFields(columns, defaultSort, defaultOrder) {
  return {
    sort: z.enum(Object.keys(columns)).default(defaultSort),
    order: z.enum(['asc', 'desc']).default(defaultOrder),
  };
}

/** Escapes LIKE wildcards so user text matches literally (used with ESCAPE '\'). */
export function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
