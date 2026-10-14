// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Rooms (docs/data-model.md → rooms, D81, BR-RM1 to BR-RM4). Supervisors and admins keep
// the list; staff pick from the active rooms of a site.
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { pageOffset, pageQueryFields, pageResponse, textFilter } from '../lib/pagination.js';
import { fieldErrors } from '../middleware/validate.js';

const COLUMNS = 'id, site, building, floor, name, is_active, created_at, updated_at';
const text = (max) => z.string().trim().min(1, 'Required').max(max);

const ROOM_FIELDS = {
  building: text(100),
  floor: text(50),
  name: text(100),
  is_active: z.boolean(),
};

const createSchema = z.strictObject({
  site: text(200),
  building: ROOM_FIELDS.building,
  floor: ROOM_FIELDS.floor,
  name: ROOM_FIELDS.name,
});

// The site never changes (BR-RM2): it is not part of the update body.
const updateSchema = z
  .strictObject(Object.fromEntries(Object.entries(ROOM_FIELDS).map(([k, v]) => [k, v.optional()])))
  .refine((body) => Object.keys(body).length > 0, 'No field to update');

const adminListQuery = z.strictObject({
  ...pageQueryFields,
  q: textFilter,
  site: z.string().trim().min(1).max(200).optional(),
  is_active: z.enum(['true', 'false']).optional(),
});

const siteQuery = z.strictObject({ site: text(200) });

const parse = (schema, value, message = 'Invalid body') => {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new HttpError(400, message, fieldErrors(result.error));
  return result.data;
};

/** Escapes LIKE wildcards. */
const likeText = (value) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Floors in building order: basements (B2, B1), then L0, L1 … L12, then other names. */
const FLOOR_ORDER = `CASE WHEN floor GLOB 'B[0-9]*' THEN -CAST(substr(floor, 2) AS INTEGER)
  WHEN floor GLOB 'L[0-9]*' THEN CAST(substr(floor, 2) AS INTEGER) ELSE 1000000 END, floor`;

const toRoom = (row) => ({ ...row, is_active: row.is_active === 1 });

const duplicate = () =>
  new HttpError(409, 'This room already exists on this floor.', {
    rule: 'BR-RM1',
    fields: { name: 'Already in the list for this building and floor' },
  });

/** @param {import('better-sqlite3').Database} db */
export function createRoomService(db) {
  const byId = db.prepare(`SELECT ${COLUMNS} FROM rooms WHERE id = ?`);
  const activeOfSite = db.prepare(
    `SELECT id, building, floor, name FROM rooms WHERE site = ? AND is_active = 1
     ORDER BY building, ${FLOOR_ORDER}, name, id`,
  );
  const samePlace = db
    .prepare(
      `SELECT id FROM rooms WHERE site = @site AND building = @building COLLATE NOCASE
       AND floor = @floor COLLATE NOCASE AND name = @name COLLATE NOCASE AND id IS NOT @id`,
    )
    .pluck();
  const insert = db.prepare(
    `INSERT INTO rooms (site, building, floor, name, created_by, updated_by, created_at, updated_at)
     VALUES (@site, @building, @floor, @name, @user, @user, @now, @now)`,
  );
  const getById = (id) => {
    const row = byId.get(id);
    return row ? toRoom(row) : null;
  };

  return {
    getById,

    /** The room row as stored (is_active 0/1), for the request checks; undefined if none. */
    row(id) {
      return byId.get(id);
    },

    /** GET /api/rooms?site=: the active rooms of a site, for the request form. */
    listForSite(query) {
      const { site } = parse(siteQuery, query, 'Invalid query');
      return { items: activeOfSite.all(site) };
    },

    /** GET /api/admin/rooms: every room, inactive included, with search and filters. */
    listAdmin(query) {
      const {
        page,
        size,
        q,
        site,
        is_active: active,
      } = parse(adminListQuery, query, 'Invalid query');
      const where = [];
      const params = {};
      if (q) {
        where.push(
          "(name LIKE @q ESCAPE '\\' OR building LIKE @q ESCAPE '\\' OR floor LIKE @q ESCAPE '\\')",
        );
        params.q = likeText(q);
      }
      if (site) {
        where.push('site = @site');
        params.site = site;
      }
      if (active) {
        where.push('is_active = @active');
        params.active = active === 'true' ? 1 : 0;
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db.prepare(`SELECT count(*) FROM rooms ${clause}`).pluck().get(params);
      const items = db
        .prepare(
          `SELECT ${COLUMNS} FROM rooms ${clause}
           ORDER BY site, building, ${FLOOR_ORDER}, name, id LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: size, offset: pageOffset(page, size) })
        .map(toRoom);
      return pageResponse({ total, page, size, items });
    },

    /** POST /api/admin/rooms (BR-RM1). */
    create(body, user, { now }) {
      const input = parse(createSchema, body);
      return db
        .transaction(() => {
          if (samePlace.get({ ...input, id: null })) throw duplicate();
          const id = insert.run({
            ...input,
            user: user.id,
            now: now.toISOString(),
          }).lastInsertRowid;
          return getById(id);
        })
        .immediate();
    },

    /**
     * PUT /api/admin/rooms/:id: building, floor, name, active (BR-RM1 to BR-RM3).
     * @returns {{ updated: boolean, item: object }}
     */
    update(id, body, user, { now }) {
      const changes = parse(updateSchema, body);
      return db
        .transaction(() => {
          const current = getById(id);
          if (!current) throw new HttpError(404, 'Room not found');
          const next = { ...current, ...changes };
          const changed = Object.keys(changes).filter((f) => changes[f] !== current[f]);
          if (!changed.length) return { updated: false, item: current };
          if (samePlace.get({ ...next, id })) throw duplicate();
          const set = changed.map((f) => `${f} = @${f}`).join(', ');
          db.prepare(
            `UPDATE rooms SET ${set}, updated_by = @user, updated_at = @now WHERE id = @id`,
          ).run({
            ...Object.fromEntries(
              changed.map((f) => [f, f === 'is_active' ? Number(next[f]) : next[f]]),
            ),
            user: user.id,
            now: now.toISOString(),
            id,
          });
          return { updated: true, item: getById(id) };
        })
        .immediate();
    },
  };
}
