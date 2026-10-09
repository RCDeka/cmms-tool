// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Conflict console data (docs/api-design.md → Conflicts).
import { divergentFields, snapshotToApi } from '../rules/conflict-diff.js';
import { EDITABLE_FIELDS } from '../rules/fields.js';
import { userRef, userRefColumns } from './mappers.js';

const SELECT = `SELECT c.*,
    ${userRefColumns('su')}, ${userRefColumns('cu')}, ${userRefColumns('rb')},
    CASE c.entity_type
      WHEN 'assets' THEN (SELECT code || ' — ' || name FROM assets WHERE id = c.entity_id)
      ELSE (SELECT number || ' — ' || title FROM work_orders WHERE id = c.entity_id)
    END AS label
  FROM conflicts c
  LEFT JOIN users su ON su.id = c.server_updated_by
  LEFT JOIN users cu ON cu.id = c.client_user_id
  LEFT JOIN users rb ON rb.id = c.resolved_by`;

function toListItem(row) {
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    label: row.label,
    status: row.status,
    server_updated_at: row.server_updated_at,
    server_updated_by: userRef(row, 'su'),
    client_edited_at: row.client_edited_at,
    client_user: userRef(row, 'cu'),
    created_at: row.created_at,
    resolution: row.resolution,
    resolved_by: userRef(row, 'rb'),
    resolved_at: row.resolved_at,
  };
}

/** Version A: the server record when the conflict happened, editable fields only. */
function versionA(entityType, snapshot) {
  const api = snapshotToApi(entityType, snapshot);
  return Object.fromEntries(
    Object.keys(EDITABLE_FIELDS[entityType]).map((f) => [f, api[f] ?? null]),
  );
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ assets: object, workOrders: object }} services to load the current record
 */
export function createConflictService(db, { assets, workOrders }) {
  const byStatus = db.prepare(`${SELECT} WHERE c.status = ? ORDER BY c.created_at DESC, c.id DESC`);
  const byId = db.prepare(`${SELECT} WHERE c.id = ?`);

  return {
    /** Conflicts with the given status, newest first. */
    list(status) {
      return { items: byStatus.all(status).map(toListItem) };
    },

    /** One conflict with both versions, the current record and the divergent fields. */
    get(id) {
      const row = byId.get(id);
      if (!row) return null;
      const a = versionA(row.entity_type, JSON.parse(row.server_snapshot));
      const b = JSON.parse(row.client_changes);
      const current =
        row.entity_type === 'assets'
          ? assets.getById(row.entity_id)
          : workOrders.getById(row.entity_id);
      return {
        ...toListItem(row),
        base_version: row.base_version,
        server_version: row.server_version,
        version_a: a,
        version_b: b,
        current,
        divergent_fields: divergentFields(a, b),
      };
    },
  };
}
