// Writing and reading the audit log. Writes happen inside the caller's transaction, so a
// change and its log entry are saved together or not at all.
import { orderByClause, pageOffset, pageResponse } from '../lib/pagination.js';
import { userRef, userRefColumns } from './mappers.js';

/**
 * Appends one entry. Call inside the transaction of the change it describes.
 * @param {import('better-sqlite3').Database} db
 * @param {{ entityType: string, entityId: number, action: string, changes?: object,
 *   note?: object, label: string, userId: number | null, version?: number | null, at: string }} entry
 */
export function recordAudit(db, entry) {
  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action, changes, note, label, user_id, version, at)
     VALUES (@entityType, @entityId, @action, @changes, @note, @label, @userId, @version, @at)`,
  ).run({
    ...entry,
    changes: JSON.stringify(entry.changes ?? {}),
    note: entry.note ? JSON.stringify(entry.note) : null,
    version: entry.version ?? null,
  });
}

const SELECT = `SELECT l.*, ${userRefColumns('u')} FROM audit_log l LEFT JOIN users u ON u.id = l.user_id`;

function toEntry(row) {
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    changes: JSON.parse(row.changes),
    note: row.note ? JSON.parse(row.note) : null,
    label: row.label,
    user: userRef(row, 'u'),
    version: row.version,
    at: row.at,
  };
}

/** Fields whose values are user ids: their names are sent along (`people`). */
const PERSON_FIELDS = ['assignee_id', 'supervisor_id'];

/** @param {import('better-sqlite3').Database} db */
export function createAuditService(db) {
  /**
   * Names of the people referenced in the changes, so every reader (technicians included,
   * who cannot list users) sees names instead of ids. Only first and last names.
   */
  function peopleOf(entries) {
    const ids = new Set();
    for (const e of entries) {
      for (const f of PERSON_FIELDS) {
        for (const v of [e.changes[f]?.from, e.changes[f]?.to]) if (Number.isInteger(v)) ids.add(v);
      }
    }
    if (!ids.size) return {};
    const rows = db
      .prepare(
        `SELECT id, first_name, last_name FROM users WHERE id IN (${[...ids].map(() => '?').join(', ')})`,
      )
      .all(...ids);
    return Object.fromEntries(
      rows.map((r) => [r.id, { id: r.id, first_name: r.first_name, last_name: r.last_name }]),
    );
  }

  const forRecord = db.prepare(
    `${SELECT} WHERE l.entity_type = ? AND l.entity_id = ? ORDER BY l.at DESC, l.id DESC`,
  );
  return {
    /** History of one record, newest first, with the names of the people it mentions. */
    history(entityType, entityId) {
      const items = forRecord.all(entityType, entityId).map(toEntry);
      return { items, people: peopleOf(items) };
    },

    /** Global log, newest first, optionally for one entity type; user accounts on request. */
    list({ page, size, entity_type: entityType, includeUsers = false }) {
      const where = entityType
        ? 'WHERE l.entity_type = @entityType'
        : includeUsers
          ? ''
          : "WHERE l.entity_type <> 'users'";
      const total = db
        .prepare(`SELECT count(*) FROM audit_log l ${where}`)
        .pluck()
        .get({ entityType });
      const rows = db
        .prepare(
          `${SELECT} ${where} ${orderByClause({ at: 'l.at' }, 'at', 'desc', 'l.id')} LIMIT @size OFFSET @offset`,
        )
        .all({ entityType, size, offset: pageOffset(page, size) });
      const items = rows.map(toEntry);
      return { ...pageResponse({ total, page, size, items }), people: peopleOf(items) };
    },
  };
}
