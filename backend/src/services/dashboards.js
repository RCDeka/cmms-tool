// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Personal dashboards of supervisors and admins (docs/spec-dashboards.md, BR-K1 to BR-K3).
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors } from '../middleware/validate.js';
import {
  DASHBOARD_NAME_MAX,
  DASHBOARD_PERIODS,
  MAX_DASHBOARDS,
  TEMPLATE_NAMES,
  WIDGET_KEYS,
  isSameSet,
  sameName,
  templateWidgets,
  widgetsProblem,
  withFilterDefaults,
} from '../rules/dashboards.js';
import { CATEGORIES } from '../rules/enums.js';

const name = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(DASHBOARD_NAME_MAX, `At most ${DASHBOARD_NAME_MAX} characters`);

const widgets = z
  .array(
    z.strictObject({
      key: z.string().max(60),
      // No widget has options yet (K8 filters are per dashboard); the shape is kept for later.
      options: z.strictObject({}).default({}),
    }),
  )
  .max(WIDGET_KEYS.length);

const unique = (values) => [...new Set(values)];
const filters = z.strictObject({
  period: z
    .number()
    .int()
    .refine((p) => DASHBOARD_PERIODS.includes(p), `One of ${DASHBOARD_PERIODS.join(', ')} days`)
    .optional(),
  sites: z.array(z.string().trim().min(1).max(200)).max(50).transform(unique).optional(),
  categories: z.array(z.enum(CATEGORIES)).transform(unique).optional(),
});

const createSchema = z.strictObject({
  name,
  template: z.enum(TEMPLATE_NAMES).optional(),
  copy_of: z.number().int().positive().optional(),
});

const updateSchema = z.strictObject({
  version: z.number().int().min(1),
  name: name.optional(),
  widgets: widgets.optional(),
  filters: filters.optional(),
});

const orderSchema = z.strictObject({ ids: z.array(z.number().int().positive()).min(1) });

const parse = (schema, body) => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new HttpError(400, 'Invalid body', fieldErrors(result.error));
  return result.data;
};

const checkWidgets = (list) => {
  const problem = widgetsProblem(list);
  if (problem) throw new HttpError(400, 'Invalid body', { fields: { widgets: problem } });
};

const toDashboard = (row) => ({
  id: row.id,
  name: row.name,
  position: row.position,
  widgets: JSON.parse(row.widgets),
  filters: withFilterDefaults(JSON.parse(row.filters)),
  version: row.version,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/** @param {import('better-sqlite3').Database} db */
export function createDashboardsService(db) {
  const mine = db.prepare('SELECT * FROM dashboards WHERE user_id = ? ORDER BY position, id');
  const one = db.prepare('SELECT * FROM dashboards WHERE id = ? AND user_id = ?');
  const insert = db.prepare(
    `INSERT INTO dashboards (user_id, name, position, widgets, filters, created_at, updated_at)
     VALUES (@user_id, @name, @position, @widgets, @filters, @now, @now)`,
  );
  const setPosition = db.prepare('UPDATE dashboards SET position = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM dashboards WHERE id = ?');

  /** BR-K1: the user's own dashboard, or 404 (another user's is not revealed). */
  const owned = (id, user) => {
    const row = one.get(id, user.id);
    if (!row) throw new HttpError(404, 'Dashboard not found');
    return row;
  };
  const nameTaken = (user, wanted, exceptId) => {
    if (mine.all(user.id).some((d) => d.id !== exceptId && sameName(d.name, wanted))) {
      throw new HttpError(409, `You already have a dashboard named "${wanted}"`, {
        rule: 'BR-K2',
        fields: { name: 'Already used' },
      });
    }
  };
  const add = (user, values, now) => {
    const rows = mine.all(user.id);
    if (rows.length >= MAX_DASHBOARDS) {
      throw new HttpError(409, `You can have at most ${MAX_DASHBOARDS} dashboards`, {
        rule: 'BR-K2',
      });
    }
    nameTaken(user, values.name);
    const id = Number(
      insert.run({
        user_id: user.id,
        name: values.name,
        position: rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0,
        widgets: JSON.stringify(values.widgets),
        filters: JSON.stringify(values.filters),
        now: now.toISOString(),
      }).lastInsertRowid,
    );
    return toDashboard(one.get(id, user.id));
  };

  return {
    /** GET /api/dashboards: mine in order; "Overview" is created for a user without any (K2). */
    list(user, { now }) {
      let rows = mine.all(user.id);
      if (!rows.length) {
        db.transaction(() => {
          if (!mine.all(user.id).length) {
            add(user, { name: 'Overview', widgets: templateWidgets('OVERVIEW'), filters: {} }, now);
          }
        }).immediate();
        rows = mine.all(user.id);
      }
      return { items: rows.map(toDashboard) };
    },

    /** GET /api/dashboards/:id */
    get(id, user) {
      return toDashboard(owned(id, user));
    },

    /** POST /api/dashboards: from a template (empty by default) or as a copy of one of mine. */
    create(body, user, { now }) {
      const input = parse(createSchema, body);
      return db
        .transaction(() => {
          if (input.copy_of !== undefined) {
            const source = owned(input.copy_of, user);
            return add(
              user,
              {
                name: input.name,
                widgets: JSON.parse(source.widgets),
                filters: JSON.parse(source.filters),
              },
              now,
            );
          }
          const widgets = templateWidgets(input.template ?? 'EMPTY');
          return add(user, { name: input.name, widgets, filters: {} }, now);
        })
        .immediate();
    },

    /** PUT /api/dashboards/:id at the version the user saw (409 otherwise). */
    update(id, body, user, { now }) {
      const { version, ...changes } = parse(updateSchema, body);
      if (!Object.keys(changes).length) throw new HttpError(400, 'No field to update');
      if (changes.widgets) checkWidgets(changes.widgets);
      return db
        .transaction(() => {
          const current = owned(id, user);
          if (current.version !== version) {
            throw new HttpError(
              409,
              'This dashboard changed since you opened it. Reload it and try again.',
              { rule: 'BR-V1' },
            );
          }
          if (changes.name !== undefined) nameTaken(user, changes.name, id);
          const columns = {
            name: changes.name ?? current.name,
            widgets: changes.widgets ? JSON.stringify(changes.widgets) : current.widgets,
            filters: changes.filters
              ? JSON.stringify(withFilterDefaults(changes.filters))
              : current.filters,
          };
          db.prepare(
            `UPDATE dashboards SET name = @name, widgets = @widgets, filters = @filters,
               version = version + 1, updated_at = @now WHERE id = @id`,
          ).run({ ...columns, now: now.toISOString(), id });
          return toDashboard(one.get(id, user.id));
        })
        .immediate();
    },

    /** PUT /api/dashboards/order: the new order of all my dashboards. */
    reorder(body, user) {
      const { ids } = parse(orderSchema, body);
      db.transaction(() => {
        const current = mine.all(user.id).map((d) => d.id);
        if (!isSameSet(current, ids)) {
          throw new HttpError(400, 'Invalid body', {
            fields: { ids: 'Give each of your dashboards once' },
          });
        }
        ids.forEach((id, position) => setPosition.run(position, id));
      }).immediate();
    },

    /** DELETE /api/dashboards/:id?version=N; the last one stays (BR-K2). */
    remove(id, version, user) {
      db.transaction(() => {
        const current = owned(id, user);
        if (current.version !== version) {
          throw new HttpError(
            409,
            'This dashboard changed since you opened it. Reload it and try again.',
            { rule: 'BR-V1' },
          );
        }
        if (mine.all(user.id).length === 1) {
          throw new HttpError(409, 'Your last dashboard cannot be deleted', { rule: 'BR-K2' });
        }
        remove.run(id);
      }).immediate();
    },
  };
}
