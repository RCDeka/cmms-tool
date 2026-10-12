// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// SQL building blocks of the dashboard widgets (services/dashboard-widgets.js and
// services/dashboard-compliance.js): constant SQL text with bound values, never request text.
import { HttpError } from '../lib/http-error.js';
import { addInFilter } from '../lib/list-filter.js';

/** Unfinished work orders (alias `w`). */
export const UNFINISHED = "w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')";

export const badSegment = () =>
  new HttpError(400, 'Invalid query', { fields: { segment: 'Unknown segment' } });

/** Site and trade filters of a widget on a table alias (`w` work orders, `a` assets). */
export function scopeClause(alias, { sites, categories }) {
  const where = [];
  const params = {};
  addInFilter(where, params, `${alias}.site`, 'scope_site', sites);
  addInFilter(where, params, `${alias}.category`, 'scope_category', categories);
  return { where, params };
}

/** Joins clause parts ({ sql } or { where: [] }, with params) into one WHERE clause. */
export function combine(...parts) {
  const where = parts.flatMap((p) => p.where ?? (p.sql ? [p.sql] : []));
  const params = Object.assign({}, ...parts.map((p) => p.params ?? {}));
  return {
    sql: where.map((w) => `(${w})`).join(' AND ') || '1',
    clause: `WHERE ${where.map((w) => `(${w})`).join(' AND ') || '1'}`,
    params,
  };
}

/** Rows whose id is in a list computed in JavaScript (bound as one JSON parameter). */
export const idsIn = (ids, name = 'ids') => ({
  sql: `w.id IN (SELECT value FROM json_each(@${name}))`,
  params: { [name]: JSON.stringify([...ids]) },
});

/** "PRIORITY:bucket" or "kind:bucket" → [first, second], each checked against its list. */
export function splitSegment(segment, firsts, seconds) {
  const at = segment.indexOf(':');
  const first = at < 0 ? segment : segment.slice(0, at);
  const second = at < 0 ? null : segment.slice(at + 1);
  if (!firsts.includes(first) || (second !== null && !seconds.includes(second))) {
    throw badSegment();
  }
  return [first, second];
}
