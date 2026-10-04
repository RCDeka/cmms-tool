import { ASSET_STATUSES, CRITICALITIES } from '../rules/enums.js';
import {
  likePattern,
  orderByClause,
  pageOffset,
  pageResponse,
  rankExpression,
} from '../lib/pagination.js';
import { toBool, userRef, userRefColumns } from './mappers.js';
import { parseUpdate, versionedUpdate } from './writes.js';

const FIELDS = [
  'id',
  'code',
  'name',
  'site',
  'building',
  'floor',
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

/** @param {import('better-sqlite3').Database} db */
export function createAssetService(db) {
  const count = db.prepare('SELECT count(*) FROM assets').pluck();
  const byId = db.prepare(`${SELECT} WHERE a.id = ?`);
  const getById = (id) => {
    const row = byId.get(id);
    return row ? toAsset(row) : null;
  };

  return {
    /** Paginated list, complete records (D7). */
    list({ page, size, sort, order }) {
      const rows = db
        .prepare(`${SELECT} ${orderByClause(ASSET_SORTS, sort, order, 'a.id')} LIMIT ? OFFSET ?`)
        .all(size, pageOffset(page, size));
      return pageResponse({ total: count.get(), page, size, items: rows.map(toAsset) });
    },

    /** Asset or null. */
    getById,

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
      });
      return { ...result, item: getById(id), changes, version };
    },

    /**
     * Text search on code, name, brand, model and serial number (case-insensitive for
     * unaccented letters), combined with optional exact filters. Ordered by code.
     */
    search({ q, site, category, status, criticality, limit }) {
      // Fixed SQL fragments only; values are bound parameters.
      const where = [];
      const params = {};
      if (q) {
        where.push(
          `(a.code LIKE @q ESCAPE '\\' OR a.name LIKE @q ESCAPE '\\' OR a.brand LIKE @q ESCAPE '\\'
            OR a.model LIKE @q ESCAPE '\\' OR a.serial_number LIKE @q ESCAPE '\\')`,
        );
        params.q = likePattern(q);
      }
      for (const [key, value] of Object.entries({ site, category, status, criticality })) {
        if (value !== undefined) {
          where.push(`a.${key} = @${key}`);
          params[key] = value;
        }
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db.prepare(`SELECT count(*) FROM assets a ${clause}`).pluck().get(params);
      const rows = db
        .prepare(`${SELECT} ${clause} ORDER BY a.code LIMIT @limit`)
        .all({ ...params, limit });
      return { items: rows.map(toAsset), total };
    },
  };
}
