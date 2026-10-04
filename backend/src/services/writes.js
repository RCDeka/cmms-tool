// Shared write logic for PUT on assets and work orders: body checks, permissions, and the
// versioned update with conflict detection (docs/data-model.md → BR-V1 to BR-V4).
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors } from '../middleware/validate.js';
import { BOOLEAN_FIELDS, EDITABLE_FIELDS, READ_ONLY_FIELDS, WRITE_META } from '../rules/fields.js';
import { canEditRecord, forbiddenFields } from '../rules/permissions.js';
import { decideWrite } from '../rules/versioning.js';

const forbidden = (fields, message = 'Your role does not allow changing these fields') =>
  new HttpError(403, message, { fields });

/**
 * Checks a PUT body in this order: unknown fields (400), read-only or role-forbidden fields
 * (403), then values (400). Returns the parsed changes and write metadata.
 * @param {'assets' | 'work_orders'} entity
 * @param {unknown} body
 * @param {{ role: string }} user
 * @returns {{ changes: object, version: number, editedAt: string | undefined }}
 */
export function parseUpdate(entity, body, user) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'The body must be a JSON object');
  }
  const editable = EDITABLE_FIELDS[entity];
  const readOnly = READ_ONLY_FIELDS[entity];
  const keys = Object.keys(body);

  const unknown = keys.filter(
    (k) => !(k in editable) && !(k in WRITE_META) && !readOnly.includes(k),
  );
  if (unknown.length) {
    throw new HttpError(400, 'Invalid body', {
      fields: Object.fromEntries(unknown.map((k) => [k, 'Unknown field'])),
    });
  }

  const fields = keys.filter((k) => !(k in WRITE_META));
  const notWritable = fields.filter((k) => readOnly.includes(k));
  if (notWritable.length) throw forbidden(notWritable, 'These fields cannot be changed');
  const notAllowed = forbiddenFields(entity, user.role, fields);
  if (notAllowed.length) throw forbidden(notAllowed);

  const meta = z.object(WRITE_META).safeParse({ version: body.version, edited_at: body.edited_at });
  if (!meta.success) throw new HttpError(400, 'Invalid body', fieldErrors(meta.error));
  if (!fields.length) throw new HttpError(400, 'No field to update');

  const schema = z.strictObject(Object.fromEntries(fields.map((k) => [k, editable[k]])));
  const parsed = schema.safeParse(Object.fromEntries(fields.map((k) => [k, body[k]])));
  if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));

  return { changes: parsed.data, version: meta.data.version, editedAt: meta.data.edited_at };
}

/** API values → column values (booleans as 0/1). */
export function toColumns(entity, changes) {
  const out = { ...changes };
  for (const f of BOOLEAN_FIELDS[entity]) if (f in out) out[f] = out[f] ? 1 : 0;
  return out;
}

/**
 * Versioned update in one IMMEDIATE transaction (one writer at a time, so the version read
 * here cannot change before the write).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} options
 * @param {'assets' | 'work_orders'} options.entity also the table name
 * @param {number} options.id
 * @param {object} options.changes parsed API changes
 * @param {number} options.version version the client edited from
 * @param {string | undefined} options.editedAt when the user made the edit
 * @param {{ id: number, role: string }} options.user
 * @param {string} options.now ISO datetime
 * @param {(current: object) => object} [options.prepare] checks business rules on the current
 *   row and returns the final changes (throw HttpError to refuse); runs only when applying
 * @returns {{ status: 'applied' } | { status: 'conflict' | 'locked', conflictId: number }}
 */
export function versionedUpdate(
  db,
  { entity, id, changes, version, editedAt, user, now, prepare },
) {
  // `entity` comes from code (never user input) and is also the table name.
  return db
    .transaction(() => {
      const current = db.prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id);
      if (!current) throw new HttpError(404, 'Record not found');
      if (!canEditRecord(entity, user, current)) {
        throw forbidden([], 'Technicians can only change work orders assigned to them');
      }

      const decision = decideWrite({
        storedVersion: current.version,
        sentVersion: version,
        hasConflict: current.has_conflict === 1,
      });

      if (decision === 'locked') {
        const conflictId = db
          .prepare(
            "SELECT id FROM conflicts WHERE entity_type = ? AND entity_id = ? AND status = 'OPEN'",
          )
          .pluck()
          .get(entity, id);
        return { status: 'locked', conflictId };
      }

      if (decision === 'conflict') {
        // BR-V3: keep both versions; the record keeps the server version and is flagged.
        const conflictId = Number(
          db
            .prepare(
              `INSERT INTO conflicts
                (entity_type, entity_id, base_version, server_version, server_snapshot,
                 client_changes, server_updated_by, server_updated_at, client_user_id,
                 client_edited_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              entity,
              id,
              version,
              current.version,
              JSON.stringify(current),
              JSON.stringify(changes),
              current.updated_by,
              current.updated_at,
              user.id,
              editedAt ?? now,
              now,
            ).lastInsertRowid,
        );
        db.prepare(`UPDATE ${entity} SET has_conflict = 1, updated_at = ? WHERE id = ?`).run(
          now,
          id,
        );
        return { status: 'conflict', conflictId };
      }

      const finalChanges = toColumns(entity, prepare ? prepare(current) : changes);
      // Column names come from the editable-field whitelist, never from the request as is.
      const sets = Object.keys(finalChanges).map((k) => `${k} = @${k}`);
      db.prepare(
        `UPDATE ${entity} SET ${sets.join(', ')}, version = version + 1, updated_by = @__user,
         updated_at = @__now WHERE id = @__id`,
      ).run({ ...finalChanges, __user: user.id, __now: now, __id: id });
      return { status: 'applied' };
    })
    .immediate();
}
