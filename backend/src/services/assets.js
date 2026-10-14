// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors } from '../middleware/validate.js';
import {
  ASSET_CODE,
  deletionBlocker,
  nextAssetCode,
  normalizeAssetCode,
} from '../rules/asset-creation.js';
import { ASSET_STATUSES, CRITICALITIES } from '../rules/enums.js';
import { toFtsQuery } from '../rules/search.js';
import { ASSET_FIELDS } from '../rules/fields.js';
import { orderByClause, pageOffset, pageResponse, rankExpression } from '../lib/pagination.js';
import { toBool, userRef, userRefColumns } from './mappers.js';
import { auditLabel, creationChanges } from '../rules/audit.js';
import { snapshotToApi } from '../rules/conflict-diff.js';
import { addInFilter, addPlaceFilter } from '../lib/list-filter.js';
import { recordAudit } from './audit.js';
import { parseUpdate, resolveConflict, toColumns, versionedUpdate } from './writes.js';

/**
 * WHERE clause of the asset filters: full-text `q`, exact site, category, status and
 * criticality (each one value or a list), and places with everything below them (BR-LOC10).
 * Fixed SQL fragments only; values are bound parameters.
 * `extra`: the condition of a dashboard widget segment (`drill`, built by the widget service).
 * @returns {{ clause: string, params: object }}
 */
export function assetFilters({ q, site, location, category, status, criticality }, extra) {
  const where = [];
  const params = {};
  if (q !== undefined) {
    const fts = toFtsQuery(q);
    if (fts === null)
      where.push('0'); // no letter or digit: nothing can match
    else {
      where.push('a.id IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH @fts)');
      params.fts = fts;
    }
  }
  addInFilter(where, params, 'a.site', 'site', site);
  addPlaceFilter(where, params, 'a.location_id', 'location', location);
  addInFilter(where, params, 'a.category', 'category', category);
  addInFilter(where, params, 'a.status', 'status', status);
  addInFilter(where, params, 'a.criticality', 'criticality', criticality);
  if (extra) {
    where.push(`(${extra.sql})`);
    Object.assign(params, extra.params);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/**
 * POST /api/assets body: required fields as in the table, the rest optional (BR-A4). The place
 * is a `location_id`, or a `site` alone for the site itself (BR-LOC7).
 */
const createSchema = z.strictObject({
  code: z
    .string()
    .transform(normalizeAssetCode)
    .pipe(z.string().regex(ASSET_CODE, 'Capitals, digits and hyphens only, 2 to 50 characters'))
    .optional(),
  ...ASSET_FIELDS,
  status: ASSET_FIELDS.status.default('IN_SERVICE'),
  maintenance_contract: ASSET_FIELDS.maintenance_contract.default(false),
  ...Object.fromEntries(
    Object.entries(ASSET_FIELDS)
      .filter(
        ([f]) => !['name', 'category', 'criticality', 'status', 'maintenance_contract'].includes(f),
      )
      .map(([f, schema]) => [f, schema.optional()]),
  ),
});

const FIELDS = [
  'id',
  'code',
  'name',
  'site',
  'location_id',
  'place',
  'category',
  'subcategory',
  'criticality',
  'status',
  'brand',
  'model',
  'serial_number',
  'commissioned_on',
  'last_serviced_on',
  'supplier',
  'maintenance_contract',
  'responsible_technician',
  'exact_location',
  'comment',
  'version',
  'has_conflict',
  'created_at',
  'updated_at',
];

const SELECT = `SELECT ${FIELDS.map((f) => `a.${f}`).join(', ')}, ${userRefColumns('ub')}
  FROM assets a
  LEFT JOIN users ub ON ub.id = a.updated_by`;

/** Whitelisted sort keys (docs/api-design.md → GET /api/assets). */
export const ASSET_SORTS = {
  code: 'a.code',
  name: 'a.name',
  site: 'a.site',
  category: 'a.category',
  criticality: rankExpression('a.criticality', CRITICALITIES),
  status: rankExpression('a.status', ASSET_STATUSES),
  updated_at: 'a.updated_at',
};

/** Row → Asset shape. */
export function toAsset(row) {
  const asset = {};
  for (const f of FIELDS) asset[f] = row[f];
  asset.maintenance_contract = toBool(row.maintenance_contract);
  asset.has_conflict = toBool(row.has_conflict);
  asset.updated_by = userRef(row, 'ub');
  return asset;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ locations: ReturnType<import('./locations.js').createLocationService> }} deps
 */
export function createAssetService(db, { locations }) {
  const byId = db.prepare(`${SELECT} WHERE a.id = ?`);
  const getById = (id) => {
    const row = byId.get(id);
    return row ? toAsset(row) : null;
  };

  const codeExists = db.prepare('SELECT 1 FROM assets WHERE code = ?').pluck();
  const highestNumber = db
    .prepare(
      "SELECT max(CAST(substr(code, 5) AS INTEGER)) FROM assets WHERE code GLOB 'AST-[0-9]*'",
    )
    .pluck();
  const workOrderCount = db.prepare('SELECT count(*) FROM work_orders WHERE asset_id = ?').pluck();
  // BR-LOC8: the asset's open work orders and its plans are where the asset is. Their version
  // stays (nobody edited them), their date changes so devices fetch them again.
  const followers = [
    db.prepare(
      `UPDATE work_orders SET location_id = @location_id, site = @site, place = @place,
         updated_at = @now
       WHERE asset_id = @id AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')`,
    ),
    db.prepare(
      `UPDATE maintenance_plans SET location_id = @location_id, site = @site, place = @place,
         updated_at = @now
       WHERE asset_id = @id`,
    ),
  ];

  /** BR-LOC5, BR-LOC7: the place of a change, with its site and path. */
  const placeChanges = (current, changes) => ({
    ...changes,
    ...locations.derive(changes, current),
  });
  /** BR-LOC8: the asset moved, its open work orders and plans follow (same transaction). */
  const follow = (now) => (current, changes) => {
    if (!('location_id' in changes) || changes.location_id === current.location_id) return;
    for (const stmt of followers) {
      stmt.run({ ...locations.columnsOf(changes.location_id), id: current.id, now });
    }
  };

  return {
    /** Paginated list, complete records (D7). */
    list({ page, size, sort, order, ...filters }, extra) {
      const { clause, params } = assetFilters(filters, extra);
      const total = db.prepare(`SELECT count(*) FROM assets a ${clause}`).pluck().get(params);
      const rows = db
        .prepare(
          `${SELECT} ${clause} ${orderByClause(ASSET_SORTS, sort, order, 'a.id')} LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: size, offset: pageOffset(page, size) });
      return pageResponse({ total, page, size, items: rows.map(toAsset) });
    },

    /** Asset or null. */
    getById,

    /**
     * Assets matching a WHERE clause built by the dashboard widgets (constant SQL on the alias
     * `a`, values bound in `params`), by code.
     */
    selectWhere(clause, params, limit) {
      return db
        .prepare(`${SELECT} ${clause} ORDER BY a.code LIMIT @__limit`)
        .all({ ...params, __limit: limit })
        .map(toAsset);
    },

    /**
     * PUT /api/assets/:id (BR-V1 to BR-V4, permission matrix).
     * @returns {{ status: 'applied' | 'conflict' | 'locked', conflictId?: number, item: object }}
     */
    update(id, body, user, { now }) {
      const { changes, version, editedAt } = parseUpdate('assets', body, user);
      const result = versionedUpdate(db, {
        entity: 'assets',
        id,
        changes,
        version,
        editedAt,
        user,
        now: now.toISOString(),
        prepare: (current) => placeChanges(current, changes),
        afterWrite: follow(now.toISOString()),
      });
      return { ...result, item: getById(id), changes, version };
    },

    /**
     * POST /api/assets (BR-A4): the code is generated when left out, refused when taken.
     * @returns {object} the new asset
     */
    create(body, user, { now }) {
      const parsed = createSchema.safeParse(body ?? {});
      if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
      const { code, ...fields } = parsed.data;
      if (fields.location_id === undefined && fields.site === undefined) {
        const message = 'Choose the place of the asset';
        throw new HttpError(400, 'Invalid body', {
          fields: { location_id: message, site: message },
        });
      }
      const id = db
        .transaction(() => {
          if (code && codeExists.get(code)) {
            throw new HttpError(409, `The code ${code} is already used`, {
              rule: 'BR-A1',
              fields: { code: 'Already used' },
            });
          }
          Object.assign(fields, locations.derive(fields));
          const row = {
            code: code ?? nextAssetCode(highestNumber.get()),
            ...toColumns('assets', fields),
            updated_by: user.id,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          };
          const columns = Object.keys(row);
          // Column names come from the schema above, never from the request as is.
          const newId = Number(
            db
              .prepare(
                `INSERT INTO assets (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
              )
              .run(row).lastInsertRowid,
          );
          const values = { code: row.code, ...fields };
          recordAudit(db, {
            entityType: 'assets',
            entityId: newId,
            action: 'CREATE',
            changes: creationChanges(values),
            label: auditLabel('assets', values),
            userId: user.id,
            version: 1,
            at: row.created_at,
          });
          return newId;
        })
        .immediate();
      return getById(id);
    },

    /**
     * DELETE /api/assets/:id?version=N (BR-A3): only assets without work orders, at the
     * version the user saw. Resolved conflicts of the asset go with it.
     */
    remove(id, version, user, { now }) {
      db.transaction(() => {
        const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
        if (!row) throw new HttpError(404, 'Asset not found');
        const blocker = deletionBlocker(row, { version, workOrders: workOrderCount.get(id) });
        if (blocker) throw new HttpError(409, blocker.message, { rule: blocker.rule });
        db.prepare("DELETE FROM conflicts WHERE entity_type = 'assets' AND entity_id = ?").run(id);
        db.prepare('DELETE FROM assets WHERE id = ?').run(id);
        // The entry keeps the last values, so the log still says what was deleted.
        const last = snapshotToApi('assets', row);
        recordAudit(db, {
          entityType: 'assets',
          entityId: id,
          action: 'DELETE',
          note: { snapshot: last },
          label: auditLabel('assets', last),
          userId: user.id,
          version: row.version,
          at: now.toISOString(),
        });
      }).immediate();
    },

    /** PUT /api/assets/:id/resolve-conflict (BR-V5). */
    resolveConflict(id, body, user, { now }) {
      resolveConflict(db, {
        entity: 'assets',
        id,
        body,
        user,
        now: now.toISOString(),
        prepare: placeChanges,
        afterWrite: follow(now.toISOString()),
      });
      return getById(id);
    },

    /** Search with the list filters (full-text `q`), ordered by code, at most `limit`. */
    search({ limit, ...filters }) {
      const { clause, params } = assetFilters(filters);
      const total = db.prepare(`SELECT count(*) FROM assets a ${clause}`).pluck().get(params);
      const rows = db
        .prepare(`${SELECT} ${clause} ORDER BY a.code LIMIT @limit`)
        .all({ ...params, limit });
      return { items: rows.map(toAsset), total };
    },
  };
}
