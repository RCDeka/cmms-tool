// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Maintenance plans (D48, docs/data-model.md → maintenance_plans): list, read, create, edit.
// Plans are never deleted: an inactive plan keeps its history and creates nothing.
import { z } from 'zod';
import { dateInZone } from '../lib/dates.js';
import { HttpError } from '../lib/http-error.js';
import { weekOfDate } from '../lib/iso-week.js';
import { addInFilter } from '../lib/list-filter.js';
import { orderByClause, pageOffset, pageResponse } from '../lib/pagination.js';
import { fieldErrors } from '../middleware/validate.js';
import { auditLabel, creationChanges, diffChanges } from '../rules/audit.js';
import { PLAN_FIELDS, WRITE_META } from '../rules/fields.js';
import {
  defaultTolerance,
  nextPlanCode,
  occurrenceWarnings,
  planProblems,
  planWarnings,
} from '../rules/planning.js';
import { recordAudit } from './audit.js';
import { toBool, userRef, userRefColumns } from './mappers.js';
import { generateOccurrences, recomputeOccurrences } from './occurrences.js';

/** POST /api/plans body: the series and the work are required, the rest has defaults. */
const createSchema = z.strictObject({
  ...Object.fromEntries(Object.entries(PLAN_FIELDS).map(([f, schema]) => [f, schema.optional()])),
  title: PLAN_FIELDS.title,
  type: PLAN_FIELDS.type,
  estimated_hours: PLAN_FIELDS.estimated_hours,
  frequency_weeks: PLAN_FIELDS.frequency_weeks,
  anchor_week: PLAN_FIELDS.anchor_week,
});

/** PUT /api/plans/:id body: any editable field, with the version the user saw. */
const updateSchema = z.strictObject({
  ...Object.fromEntries(Object.entries(PLAN_FIELDS).map(([f, schema]) => [f, schema.optional()])),
  version: WRITE_META.version,
});

/** Fields whose change replaces the planned visits (BR-P2). */
const SERIES_FIELDS = ['anchor_week', 'frequency_weeks', 'end_week', 'is_active'];

const COLUMNS = [
  'id',
  'code',
  'title',
  'description',
  'type',
  'category',
  'asset_id',
  'site',
  'building',
  'location',
  'estimated_hours',
  'frequency_weeks',
  'anchor_week',
  'end_week',
  'schedule_mode',
  'tolerance_weeks',
  'season_from_week',
  'season_to_week',
  'performed_by',
  'supplier',
  'is_active',
  'version',
  'created_at',
  'updated_at',
];

const SELECT = `SELECT ${COLUMNS.map((c) => `p.${c}`).join(', ')},
    a.code AS a__code, a.name AS a__name, ${userRefColumns('cb')}, ${userRefColumns('ub')},
    (SELECT min(o.week) FROM plan_occurrences o
      WHERE o.plan_id = p.id AND o.status <> 'SKIPPED' AND o.week >= @currentWeek) AS next_week
  FROM maintenance_plans p
  LEFT JOIN assets a ON a.id = p.asset_id
  LEFT JOIN users cb ON cb.id = p.created_by
  LEFT JOIN users ub ON ub.id = p.updated_by`;

/** Whitelisted sort keys of GET /api/plans. */
export const PLAN_SORTS = {
  code: 'p.code',
  title: 'p.title',
  site: 'p.site',
  category: 'p.category',
};

/** Stored row → API values (booleans as true/false), for diffs and the audit log. */
const toApiValues = (row) => ({ ...row, is_active: toBool(row.is_active) });

/** Escapes LIKE wildcards in user text (`\` is the escape character). */
const likeTerm = (word) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * WHERE clause of the plan filters, shared by the list and the year planner. `q`: each word
 * must appear in the code, title, site, building, location or supplier.
 * @returns {{ clause: string, params: object }}
 */
export function planFilters({ q, site, building, category, type, performed_by: by, active }) {
  const where = [];
  const params = {};
  (q ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .forEach((word, i) => {
      where.push(
        `(${['code', 'title', 'site', 'building', 'location', 'supplier']
          .map((c) => `p.${c} LIKE @q${i} ESCAPE '\\'`)
          .join(' OR ')})`,
      );
      params[`q${i}`] = likeTerm(word);
    });
  addInFilter(where, params, 'p.site', 'site', site);
  addInFilter(where, params, 'p.building', 'building', building);
  addInFilter(where, params, 'p.category', 'category', category);
  addInFilter(where, params, 'p.type', 'type', type);
  addInFilter(where, params, 'p.performed_by', 'by', by);
  if (active !== undefined) {
    where.push('p.is_active = @active');
    params.active = active ? 1 : 0;
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const ruleError = (message, fields) => new HttpError(422, message, { rule: 'BR-P9', fields });

/** @param {import('better-sqlite3').Database} db */
export function createPlanService(db) {
  const settingsStmt = db.prepare('SELECT * FROM planning_settings WHERE id = 1');
  const assetById = db.prepare('SELECT id, site, building, category FROM assets WHERE id = ?');
  const byId = db.prepare(`${SELECT} WHERE p.id = @id`);
  const highestCode = db
    .prepare(
      `SELECT max(CAST(substr(code, 4) AS INTEGER)) FROM maintenance_plans
       WHERE code GLOB 'PM-[0-9]*' AND substr(code, 4) NOT GLOB '*[^0-9]*'`,
    )
    .pluck();
  const blockedIn = db.prepare('SELECT week, site FROM blocked_weeks WHERE week = ?');
  const upcoming = db.prepare(
    `SELECT o.id, o.due_week, o.week, o.status, o.skip_reason, o.work_order_id, o.version,
       o.moved_at, w.number AS wo_number, w.status AS wo_status
     FROM plan_occurrences o LEFT JOIN work_orders w ON w.id = o.work_order_id
     WHERE o.plan_id = ? AND o.week >= ? ORDER BY o.week, o.id LIMIT 8`,
  );

  /** Row → Plan shape, with its warnings (BR-P8). */
  function toPlan(row, settings) {
    const plan = {};
    for (const c of COLUMNS) plan[c] = row[c];
    plan.is_active = toBool(row.is_active);
    plan.asset =
      row.asset_id === null ? null : { id: row.asset_id, code: row.a__code, name: row.a__name };
    plan.created_by = userRef(row, 'cb');
    plan.updated_by = userRef(row, 'ub');
    plan.next_week = row.next_week;
    plan.warnings = planWarnings(plan, settings);
    return plan;
  }

  const currentWeekOf = ({ timeZone, now }) => weekOfDate(dateInZone(timeZone, now));

  function getById(id, context) {
    const row = byId.get({ id, currentWeek: currentWeekOf(context) });
    if (!row) return null;
    const plan = toPlan(row, settingsStmt.get());
    plan.occurrences = upcoming.all(id, currentWeekOf(context)).map((o) => ({
      id: o.id,
      due_week: o.due_week,
      week: o.week,
      status: o.status,
      skip_reason: o.skip_reason,
      work_order:
        o.work_order_id === null
          ? null
          : { id: o.work_order_id, number: o.wo_number, status: o.wo_status },
      moved_at: o.moved_at,
      version: o.version,
      warnings: occurrenceWarnings(plan, o.week, blockedIn.all(o.week)),
    }));
    return plan;
  }

  /**
   * BR-P9: with an asset, the site and building are the asset's (sending others → 422), and
   * the trade defaults to the asset's. Returns the derived values.
   */
  function assetValues(plan, sent) {
    if (plan.asset_id === null || plan.asset_id === undefined) return {};
    const asset = assetById.get(plan.asset_id);
    if (!asset) throw ruleError('This asset does not exist.', { asset_id: 'Unknown asset' });
    for (const field of ['site', 'building']) {
      if (field in sent && (sent[field] ?? null) !== asset[field]) {
        throw ruleError(`The ${field} must be the asset's ${field}.`, {
          [field]: `The asset is in ${asset[field] ?? 'no building'}`,
        });
      }
    }
    return {
      site: asset.site,
      building: asset.building,
      ...(!plan.category && { category: asset.category }),
    };
  }

  function checkPlan(plan) {
    const missing = {};
    if (!plan.site) missing.site = 'Choose an asset or a site';
    if (!plan.category) missing.category = 'Required without an asset';
    const problems = { ...missing, ...planProblems(plan) };
    if (Object.keys(problems).length)
      throw new HttpError(400, 'Invalid body', { fields: problems });
  }

  return {
    getById,

    /** GET /api/plans: paginated, with the filters of the year planner. */
    list({ page, size, sort, order, ...filters }, context) {
      const { clause, params } = planFilters(filters);
      const total = db
        .prepare(`SELECT count(*) FROM maintenance_plans p ${clause}`)
        .pluck()
        .get(params);
      const settings = settingsStmt.get();
      const items = db
        .prepare(
          `${SELECT} ${clause} ${orderByClause(PLAN_SORTS, sort, order, 'p.id')} LIMIT @limit OFFSET @offset`,
        )
        .all({
          ...params,
          currentWeek: currentWeekOf(context),
          limit: size,
          offset: pageOffset(page, size),
        })
        .map((row) => toPlan(row, settings));
      return pageResponse({ total, page, size, items });
    },

    /** POST /api/plans: automatic code, occurrences generated up to the horizon (BR-P1). */
    create(body, user, context) {
      const parsed = createSchema.safeParse(body ?? {});
      if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
      const input = parsed.data;
      const stamp = context.now.toISOString();
      const id = db
        .transaction(() => {
          const plan = {
            description: null,
            asset_id: null,
            site: null,
            building: null,
            location: null,
            category: null,
            end_week: null,
            schedule_mode: 'FIXED',
            tolerance_weeks: defaultTolerance(input.frequency_weeks),
            season_from_week: null,
            season_to_week: null,
            performed_by: 'INTERNAL',
            supplier: null,
            ...input,
            is_active: true,
          };
          Object.assign(plan, assetValues(plan, input));
          checkPlan(plan);
          plan.code = nextPlanCode(highestCode.get());
          const values = { ...plan, is_active: 1, created_by: user.id, updated_by: user.id };
          const newId = Number(
            db
              .prepare(
                `INSERT INTO maintenance_plans (${Object.keys(values).join(', ')}, created_at, updated_at)
                 VALUES (${Object.keys(values)
                   .map((k) => `@${k}`)
                   .join(', ')}, @__stamp, @__stamp)`,
              )
              .run({ ...values, __stamp: stamp }).lastInsertRowid,
          );
          recordAudit(db, {
            entityType: 'maintenance_plans',
            entityId: newId,
            action: 'CREATE',
            changes: creationChanges(plan),
            label: auditLabel('maintenance_plans', plan),
            userId: user.id,
            version: 1,
            at: stamp,
          });
          generateOccurrences(
            db,
            { ...values, id: newId },
            { currentWeek: currentWeekOf(context), stamp },
          );
          return newId;
        })
        .immediate();
      return getById(id, context);
    },

    /**
     * PUT /api/plans/:id at the version the user saw (409 otherwise; plans have no conflict
     * console). A change of the series replaces the planned visits (BR-P2).
     * @returns {{ updated: boolean, item: object }}
     */
    update(id, body, user, context) {
      const parsed = updateSchema.safeParse(body ?? {});
      if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
      const { version, ...changes } = parsed.data;
      if (!Object.keys(changes).length) throw new HttpError(400, 'No field to update');
      const stamp = context.now.toISOString();

      const updated = db
        .transaction(() => {
          const current = db.prepare('SELECT * FROM maintenance_plans WHERE id = ?').get(id);
          if (!current) throw new HttpError(404, 'Plan not found');
          if (current.version !== version) {
            throw new HttpError(
              409,
              'This plan changed since you opened it. Reload it and try again.',
              {
                rule: 'BR-V1',
              },
            );
          }
          const before = toApiValues(current);
          const after = { ...before, ...changes };
          Object.assign(changes, assetValues(after, changes));
          checkPlan({ ...after, ...changes });
          const logged = diffChanges(before, changes);
          if (!Object.keys(logged).length) return false;

          const columns = Object.fromEntries(
            Object.keys(logged).map((f) => [
              f,
              f === 'is_active' ? (changes[f] ? 1 : 0) : changes[f],
            ]),
          );
          // Column names come from the PLAN_FIELDS whitelist, never from the request as is.
          db.prepare(
            `UPDATE maintenance_plans SET ${Object.keys(columns)
              .map((k) => `${k} = @${k}`)
              .join(', ')}, version = version + 1, updated_by = @__user, updated_at = @__now
             WHERE id = @__id`,
          ).run({ ...columns, __user: user.id, __now: stamp, __id: id });
          recordAudit(db, {
            entityType: 'maintenance_plans',
            entityId: id,
            action: 'UPDATE',
            changes: logged,
            label: auditLabel('maintenance_plans', { ...before, ...changes }),
            userId: user.id,
            version: current.version + 1,
            at: stamp,
          });
          if (SERIES_FIELDS.some((f) => f in logged)) {
            recomputeOccurrences(
              db,
              { ...current, ...columns },
              { currentWeek: currentWeekOf(context), stamp },
              current,
            );
          }
          return true;
        })
        .immediate();
      return { updated, item: getById(id, context) };
    },
  };
}
