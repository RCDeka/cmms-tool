// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { HttpError } from '../lib/http-error.js';

/**
 * Turns zod issues into `{ fields: { <path>: <message> } }` (docs/api-design.md → error body).
 * @param {import('zod').ZodError} error
 */
export function fieldErrors(error) {
  const fields = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) fields[key] = 'Unknown field';
    } else {
      fields[issue.path.join('.') || '_'] = issue.message;
    }
  }
  return { fields };
}

/**
 * Validates request parts with zod schemas and stores the parsed values in `req.valid`
 * (Express 5 makes `req.query` read-only). Invalid input → 400 with per-field details.
 * @param {{ query?: import('zod').ZodType, params?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        return next(new HttpError(400, `Invalid ${part}`, fieldErrors(result.error)));
      }
      req.valid[part] = result.data;
    }
    next();
  };
}
