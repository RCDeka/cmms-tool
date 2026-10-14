// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// The location tree (D82, docs/data-model.md → locations, BR-LOC1 to BR-LOC10, BR-LT1): places and
// level types. Supervisors and admins keep the places, admins the sites and the level types;
// every role reads the tree. Records store their place's site and path (`site`, `place`), which
// this service keeps up to date.
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors } from '../middleware/validate.js';
import {
  PATH_SEPARATOR,
  PLACE_CODE,
  SITE_LEVEL_TYPE,
  indexTree,
  placeOf,
  placementProblem,
  recordPlaceProblem,
  subtreeIds,
  treeOrder,
} from '../rules/locations.js';

const PLACE_COLUMNS =
  'id, parent_id, site_id, level_type_id, name, code, is_active, version, created_at, updated_at';
const TYPE_COLUMNS =
  'id, name, token, offered_to_staff, is_active, version, created_at, updated_at';

/** Tables whose rows store a place (`location_id`, `site`, `place`). */
const RECORD_TABLES = ['assets', 'work_orders', 'maintenance_plans'];

const name = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(100)
  .refine((v) => !v.includes(PATH_SEPARATOR.trim()), 'The character › is not allowed');
const code = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() || null : v),
  z.string().regex(PLACE_CODE, 'Capitals and digits only, 1 to 10 characters').nullable(),
);
const id = z.number().int().positive();

const placeCreateSchema = z.strictObject({
  parent_id: id.nullable(),
  // A site needs no type: it is always of the site type.
  level_type_id: id.optional(),
  name,
  code: code.optional(),
});
const placeUpdateSchema = z.strictObject({
  version: z.number().int().min(1),
  parent_id: id.optional(),
  level_type_id: id.optional(),
  name: name.optional(),
  code: code.optional(),
  is_active: z.boolean().optional(),
});

const token = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9_]{0,19}$/,
    'A capital letter, then capitals, digits or _, 20 characters at most',
  );
const typeCreateSchema = z.strictObject({
  name: z.string().trim().min(1, 'Required').max(50),
  token,
  offered_to_staff: z.boolean().optional(),
});
const typeUpdateSchema = z.strictObject({
  version: z.number().int().min(1),
  name: typeCreateSchema.shape.name.optional(),
  token: token.optional(),
  offered_to_staff: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const parse = (schema, value) => {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new HttpError(400, 'Invalid body', fieldErrors(result.error));
  return result.data;
};

const ruleError = (problem, fields) =>
  new HttpError(422, problem.message, { rule: problem.rule, ...(fields && { fields }) });

const stale = (what) =>
  new HttpError(409, `This ${what} changed since you opened it. Reload it and try again.`, {
    rule: 'BR-V1',
  });

const toType = (row) => ({
  ...row,
  offered_to_staff: row.offered_to_staff === 1,
  is_active: row.is_active === 1,
});

/** @param {import('better-sqlite3').Database} db */
export function createLocationService(db) {
  const allPlaces = db.prepare(`SELECT ${PLACE_COLUMNS} FROM locations`);
  const placeRow = db.prepare(
    `SELECT l.${PLACE_COLUMNS.split(', ').join(', l.')}, t.offered_to_staff, t.is_active AS type_active
     FROM locations l JOIN level_types t ON t.id = l.level_type_id WHERE l.id = ?`,
  );
  const allTypes = db.prepare(`SELECT ${TYPE_COLUMNS} FROM level_types ORDER BY id`);
  const typeRow = db.prepare(`SELECT ${TYPE_COLUMNS} FROM level_types WHERE id = ?`);
  const siteByName = db.prepare(
    `SELECT ${PLACE_COLUMNS} FROM locations WHERE parent_id IS NULL AND name = ?`,
  );
  const sibling = db.prepare(
    `SELECT id, name, code FROM locations WHERE coalesce(parent_id, 0) = coalesce(@parent, 0)
     AND id IS NOT @id AND (name = @name COLLATE NOCASE OR code = @code)`,
  );
  const typeClash = db.prepare(
    `SELECT name, token FROM level_types WHERE id IS NOT @id
     AND (name = @name COLLATE NOCASE OR token = @token)`,
  );
  const nextSiteId = db.prepare('SELECT coalesce(max(id), 0) + 1 FROM locations').pluck();
  // Rows that copy a site's name (BR-LOC6).
  const siteUses = db
    .prepare(
      `SELECT (SELECT count(*) FROM assets WHERE site = @name)
         + (SELECT count(*) FROM work_orders WHERE site = @name)
         + (SELECT count(*) FROM maintenance_plans WHERE site = @name)
         + (SELECT count(*) FROM users WHERE site = @name)
         + (SELECT count(*) FROM blocked_weeks WHERE site = @name)
         + (SELECT count(*) FROM dashboards d, json_each(d.filters, '$.sites') s
            WHERE s.value = @name)`,
    )
    .pluck();

  const tree = () => indexTree(allPlaces.all());

  /** The place as records store it: `{ location_id, site, place }`. */
  function columnsOf(locationId, index = tree()) {
    const { site, place } = placeOf(index.byId, locationId);
    return { location_id: locationId, site, place };
  }

  /** Location shape of the admin endpoints: the row with its site and path. */
  function getById(placeId) {
    const index = tree();
    const row = index.byId.get(placeId);
    if (!row) return null;
    return { ...row, is_active: row.is_active === 1, ...placeOf(index.byId, placeId) };
  }

  /** Refuses a name or a code a sibling already has (BR-LOC2). */
  function checkSiblings({ parentId, placeId = null, name: wanted, code: wantedCode }) {
    const clash = sibling.get({ parent: parentId, id: placeId, name: wanted, code: wantedCode });
    if (!clash) return;
    const sameName = clash.name.toLowerCase() === wanted.toLowerCase();
    throw new HttpError(
      409,
      sameName
        ? `There is already a place named ${clash.name} here.`
        : `The code ${clash.code} is already used here.`,
      {
        rule: 'BR-LOC2',
        fields: sameName ? { name: 'Already used here' } : { code: 'Already used here' },
      },
    );
  }

  /** The level type of a new or changed place (BR-LOC1, BR-LT1). */
  function checkType(levelTypeId, { unchanged = false } = {}) {
    const type = typeRow.get(levelTypeId);
    if (!type)
      throw ruleError(
        { rule: 'BR-LOC1', message: 'This level type does not exist.' },
        { level_type_id: 'Unknown' },
      );
    if (levelTypeId === SITE_LEVEL_TYPE) {
      throw ruleError(
        { rule: 'BR-LOC1', message: 'Only a site is of the type Site.' },
        { level_type_id: 'Choose another type' },
      );
    }
    if (!type.is_active && !unchanged) {
      throw ruleError(
        { rule: 'BR-LT1', message: 'This level type is not in use any more.' },
        { level_type_id: 'Not in use' },
      );
    }
  }

  /** Writes the new path of every record of the subtree of `placeId` (rename or move). */
  function refreshPaths(placeId) {
    const index = tree();
    for (const nodeId of subtreeIds(index.children, placeId)) {
      const { site, place } = placeOf(index.byId, nodeId);
      for (const table of RECORD_TABLES) {
        // Table names come from the constant above; the record keeps its version and date.
        db.prepare(
          `UPDATE ${table} SET site = @site, place = @place
           WHERE location_id = @id AND (site IS NOT @site OR place IS NOT @place)`,
        ).run({ site, place, id: nodeId });
      }
    }
  }

  return {
    columnsOf,
    getById,

    /** A place with its level type's flags, as stored, or undefined. */
    row: (placeId) => placeRow.get(placeId),

    /**
     * GET /api/locations: the level types and every place in tree order. Staff get the places
     * in use, without codes (BR-LOC9).
     * @param {{ role: string }} user
     */
    list(user) {
      const staff = user.role === 'STAFF';
      const types = allTypes.all().map(toType);
      let rows = treeOrder(allPlaces.all());
      if (staff) {
        rows = rows
          .filter((r) => r.is_active === 1)
          .map(({ code: _code, version: _version, ...r }) => r);
      }
      return {
        level_types: staff
          ? types
              .filter((t) => t.is_active)
              .map(({ id: typeId, name: typeName, offered_to_staff: offered }) => ({
                id: typeId,
                name: typeName,
                offered_to_staff: offered,
              }))
          : types,
        items: rows.map((r) => ({ ...r, is_active: r.is_active === 1 })),
      };
    },

    /**
     * The place a write names, as the columns to store, or null when the write leaves the
     * place as it is (BR-LOC5, BR-LOC7). `sent` holds the fields of the body; `current` the stored
     * row (null at creation). `site` alone means the site itself.
     * @returns {{ location_id: number, site: string, place: string } | null}
     */
    derive(sent, current = null) {
      if ('location_id' in sent) {
        if (current && sent.location_id === current.location_id) {
          const columns = columnsOf(sent.location_id);
          if ('site' in sent && sent.site !== columns.site) {
            throw ruleError(
              { rule: 'BR-LOC7', message: "The site must be the place's site." },
              { site: `The place is on ${columns.site}` },
            );
          }
          return null;
        }
        const problem = recordPlaceProblem(placeRow.get(sent.location_id));
        if (problem) throw ruleError(problem, { location_id: problem.message });
        const columns = columnsOf(sent.location_id);
        if ('site' in sent && sent.site !== columns.site) {
          throw ruleError(
            { rule: 'BR-LOC7', message: "The site must be the place's site." },
            { site: `The place is on ${columns.site}` },
          );
        }
        return columns;
      }
      if ('site' in sent) {
        if (current && current.site === sent.site) return null;
        const site = siteByName.get(sent.site);
        if (!site) {
          throw ruleError(
            { rule: 'BR-LOC7', message: 'This site is not in the list of places.' },
            { site: 'Unknown site' },
          );
        }
        const problem = recordPlaceProblem(site);
        if (problem) throw ruleError(problem, { site: problem.message });
        return { location_id: site.id, site: site.name, place: '' };
      }
      return null;
    },

    /** Every site by name, in use or not (the reference data of the filters). */
    siteNames() {
      return db
        .prepare('SELECT name FROM locations WHERE parent_id IS NULL ORDER BY name')
        .pluck()
        .all();
    },

    /**
     * Where a request is: `{ location_id }` or `{ site }` as sent; a place of its site whose
     * type is offered to staff, or the site itself (BR-LOC9). Returns the columns to store.
     */
    forRequest({ site, location_id: locationId }) {
      const siteRow = siteByName.get(site);
      if (!siteRow) {
        throw ruleError(
          { rule: 'BR-LOC7', message: 'This site is not in the list of places.' },
          { site: 'Choose a site of the list' },
        );
      }
      const siteProblem = recordPlaceProblem(siteRow);
      if (siteProblem) throw ruleError(siteProblem, { site: siteProblem.message });
      if (locationId === undefined || locationId === null) return columnsOf(siteRow.id);
      const place = placeRow.get(locationId);
      const problem = recordPlaceProblem(place, {
        staff: true,
        offered: place?.offered_to_staff === 1 && place?.type_active === 1,
        siteId: siteRow.id,
      });
      if (problem) throw ruleError(problem, { location_id: problem.message });
      return columnsOf(locationId);
    },

    /** POST /api/admin/locations (BR-LOC1 to BR-LOC3, BR-LOC6). */
    create(body, user, { now }) {
      // A site: refused for the role first, whatever the rest of the body (BR-LOC6).
      if (body?.parent_id === null && user.role !== 'ADMIN') {
        throw new HttpError(403, 'Only administrators create sites.', { rule: 'BR-LOC6' });
      }
      const input = parse(placeCreateSchema, body);
      const stamp = now.toISOString();
      return db
        .transaction(() => {
          let row;
          if (input.parent_id === null) {
            if (input.level_type_id !== undefined && input.level_type_id !== SITE_LEVEL_TYPE) {
              throw ruleError(
                { rule: 'BR-LOC1', message: 'A place without a parent is a site.' },
                { level_type_id: 'Must be Site' },
              );
            }
            const siteId = nextSiteId.get();
            row = { id: siteId, parent_id: null, site_id: siteId, level_type_id: SITE_LEVEL_TYPE };
          } else {
            const index = tree();
            const parent = index.byId.get(input.parent_id);
            if (!parent)
              throw ruleError(
                { rule: 'BR-LOC1', message: 'This parent place does not exist.' },
                { parent_id: 'Unknown place' },
              );
            if (input.level_type_id === undefined) {
              throw new HttpError(400, 'Invalid body', { fields: { level_type_id: 'Required' } });
            }
            checkType(input.level_type_id);
            const problem = placementProblem(index, { parentId: input.parent_id });
            if (problem) throw ruleError(problem, { parent_id: problem.message });
            row = {
              id: null,
              parent_id: parent.id,
              site_id: parent.site_id,
              level_type_id: input.level_type_id,
            };
          }
          checkSiblings({ parentId: row.parent_id, name: input.name, code: input.code ?? null });
          const newId = Number(
            db
              .prepare(
                `INSERT INTO locations (id, parent_id, site_id, level_type_id, name, code,
                   created_by, updated_by, created_at, updated_at)
                 VALUES (@id, @parent_id, @site_id, @level_type_id, @name, @code, @user, @user,
                   @stamp, @stamp)`,
              )
              .run({ ...row, name: input.name, code: input.code ?? null, user: user.id, stamp })
              .lastInsertRowid,
          );
          return getById(newId);
        })
        .immediate();
    },

    /**
     * PUT /api/admin/locations/:id at the version the user saw: name, type, code, parent
     * (a move within the site), in use (BR-LOC1 to BR-LOC6). Records below follow: their path
     * changes, their version and dates do not.
     * @returns {{ updated: boolean, item: object }}
     */
    update(placeId, body, user, { now }) {
      const { version, ...changes } = parse(placeUpdateSchema, body);
      if (!Object.keys(changes).length) throw new HttpError(400, 'No field to update');
      return db
        .transaction(() => {
          const index = tree();
          const current = index.byId.get(placeId);
          if (!current) throw new HttpError(404, 'Place not found');
          const isSite = current.parent_id === null;
          if (isSite && user.role !== 'ADMIN') {
            throw new HttpError(403, 'Only administrators change sites.', { rule: 'BR-LOC6' });
          }
          if (current.version !== version) throw stale('place');
          const changed = Object.fromEntries(
            Object.entries(changes).filter(([f, v]) =>
              f === 'is_active' ? v !== (current.is_active === 1) : v !== current[f],
            ),
          );
          if (!Object.keys(changed).length) return { updated: false, item: getById(placeId) };

          if (isSite) {
            if ('parent_id' in changed) {
              throw ruleError(
                { rule: 'BR-LOC4', message: 'A site cannot move.' },
                { parent_id: 'A site has no parent' },
              );
            }
            if ('level_type_id' in changed) {
              throw ruleError(
                { rule: 'BR-LOC1', message: 'A site is always of the type Site.' },
                { level_type_id: 'Must be Site' },
              );
            }
            // Records copy the site's name: once one does, the name is fixed (BR-LOC6).
            if ('name' in changed && siteUses.get({ name: current.name })) {
              throw new HttpError(
                409,
                'This site is already used by records: its name cannot change any more.',
                {
                  rule: 'BR-LOC6',
                  fields: { name: 'Used by records' },
                },
              );
            }
          } else {
            if ('level_type_id' in changed) checkType(changed.level_type_id);
            if ('parent_id' in changed) {
              if (!index.byId.has(changed.parent_id)) {
                throw ruleError(
                  { rule: 'BR-LOC4', message: 'This parent place does not exist.' },
                  { parent_id: 'Unknown place' },
                );
              }
              const problem = placementProblem(index, { id: placeId, parentId: changed.parent_id });
              if (problem) throw ruleError(problem, { parent_id: problem.message });
            }
          }
          const parentId = changed.parent_id ?? current.parent_id;
          if (
            changed.is_active === true &&
            parentId !== null &&
            index.byId.get(parentId).is_active !== 1
          ) {
            throw ruleError(
              { rule: 'BR-LOC5', message: 'Put the place above it back in use first.' },
              { is_active: 'The place above is not in use' },
            );
          }
          if ('name' in changed || 'code' in changed || 'parent_id' in changed) {
            checkSiblings({
              parentId,
              placeId,
              name: changed.name ?? current.name,
              code: 'code' in changed ? changed.code : current.code,
            });
          }

          const stamp = now.toISOString();
          const columns = { ...changed };
          if ('is_active' in columns) columns.is_active = columns.is_active ? 1 : 0;
          // Column names come from the update schema, never from the request as is.
          db.prepare(
            `UPDATE locations SET ${Object.keys(columns)
              .map((k) => `${k} = @${k}`)
              .join(', ')}, version = version + 1, updated_by = @__user, updated_at = @__now
             WHERE id = @__id`,
          ).run({ ...columns, __user: user.id, __now: stamp, __id: placeId });
          // Out of use: the whole subtree with it (BR-LOC5).
          if (changed.is_active === false) {
            const below = subtreeIds(index.children, placeId).slice(1);
            const off = db.prepare(
              'UPDATE locations SET is_active = 0, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND is_active = 1',
            );
            for (const nodeId of below) off.run(user.id, stamp, nodeId);
          }
          if ('name' in changed || 'parent_id' in changed) refreshPaths(placeId);
          return { updated: true, item: getById(placeId) };
        })
        .immediate();
    },

    /** GET /api/admin/level-types: every level type, in use or not. */
    listTypes() {
      return { items: allTypes.all().map(toType) };
    },

    /** POST /api/admin/level-types. */
    createType(body, user, { now }) {
      const input = parse(typeCreateSchema, body);
      const stamp = now.toISOString();
      return db
        .transaction(() => {
          const clash = typeClash.get({ id: null, name: input.name, token: input.token });
          if (clash) throw typeTaken(clash, input);
          const newId = db
            .prepare(
              `INSERT INTO level_types (name, token, offered_to_staff, updated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              input.name,
              input.token,
              input.offered_to_staff ? 1 : 0,
              user.id,
              stamp,
              stamp,
            ).lastInsertRowid;
          return toType(typeRow.get(newId));
        })
        .immediate();
    },

    /**
     * PUT /api/admin/level-types/:id at the version the user saw (BR-LT1). The site type keeps
     * its token and stays in use; only its name may change.
     * @returns {{ updated: boolean, item: object }}
     */
    updateType(typeId, body, user, { now }) {
      const { version, ...changes } = parse(typeUpdateSchema, body);
      if (!Object.keys(changes).length) throw new HttpError(400, 'No field to update');
      return db
        .transaction(() => {
          const current = typeRow.get(typeId);
          if (!current) throw new HttpError(404, 'Level type not found');
          if (current.version !== version) throw stale('level type');
          const changed = Object.fromEntries(
            Object.entries(changes).filter(([f, v]) =>
              typeof v === 'boolean' ? v !== (current[f] === 1) : v !== current[f],
            ),
          );
          if (!Object.keys(changed).length) return { updated: false, item: toType(current) };
          if (typeId === SITE_LEVEL_TYPE && Object.keys(changed).some((f) => f !== 'name')) {
            throw ruleError({
              rule: 'BR-LT1',
              message: 'Only the name of the site type can change.',
            });
          }
          const next = { ...current, ...changed };
          const clash = typeClash.get({ id: typeId, name: next.name, token: next.token });
          if (clash) throw typeTaken(clash, next);
          const columns = Object.fromEntries(
            Object.entries(changed).map(([f, v]) => [f, typeof v === 'boolean' ? Number(v) : v]),
          );
          db.prepare(
            `UPDATE level_types SET ${Object.keys(columns)
              .map((k) => `${k} = @${k}`)
              .join(', ')}, version = version + 1, updated_by = @__user, updated_at = @__now
             WHERE id = @__id`,
          ).run({ ...columns, __user: user.id, __now: now.toISOString(), __id: typeId });
          return { updated: true, item: toType(typeRow.get(typeId)) };
        })
        .immediate();
    },
  };
}

/** 409 for a level type name or token already used (BR-LT1). */
function typeTaken(clash, wanted) {
  const sameName = clash.name.toLowerCase() === wanted.name.toLowerCase();
  return new HttpError(
    409,
    sameName
      ? `There is already a level type named ${clash.name}.`
      : `The token ${clash.token} is already used.`,
    { rule: 'BR-LT1', fields: sameName ? { name: 'Already used' } : { token: 'Already used' } },
  );
}
