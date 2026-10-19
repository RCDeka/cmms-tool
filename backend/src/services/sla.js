// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Service levels (D86, D88, docs/data-model.md → BR-SLA1 to BR-SLA5): the targets and settings
// (GET /api/sla, PUT /api/sla, holidays), and the deadlines kept on each work order. The write
// functions run inside the caller's transaction.
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors } from '../middleware/validate.js';
import { auditLabel, diffChanges } from '../rules/audit.js';
import {
  SLA_HOURS_MODES,
  SLA_RESPONSE_STOPS,
  UNFINISHED_WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
} from '../rules/enums.js';
import { isoDate, WRITE_META } from '../rules/fields.js';
import { responseMoment, workOrderDeadlines } from '../rules/sla.js';
import { recordAudit } from './audit.js';
import { userRef, userRefColumns } from './mappers.js';

/** Priorities from the most urgent, the order of the targets in the API. */
const PRIORITIES_DOWN = [...WORK_ORDER_PRIORITIES].reverse();

const SLA_COLUMNS = [
  'response_due_at',
  'response_risk_at',
  'resolution_due_at',
  'resolution_risk_at',
  'sla_paused_at',
];

/**
 * The settings, targets and holidays the deadlines are computed with.
 * @param {import('better-sqlite3').Database} db
 */
export function loadSlaContext(db) {
  const settings = db.prepare('SELECT * FROM sla_settings WHERE id = 1').get();
  return {
    settings: { ...settings, business_days: settings.business_days.split(',').map(Number) },
    targets: new Map(
      db
        .prepare('SELECT priority, response_hours, resolution_hours FROM sla_targets')
        .all()
        .map((t) => [t.priority, t]),
    ),
    holidays: new Set(db.prepare('SELECT day FROM sla_holidays').pluck().all()),
  };
}

/** Writes the deadlines of one work order, from its row and history. */
function store(db, row, context, { now, timeZone, keep }) {
  const entries = db
    .prepare(
      `SELECT action, changes, at, edited_at FROM audit_log
       WHERE entity_type = 'work_orders' AND entity_id = ? ORDER BY id`,
    )
    .all(row.id)
    .map((e) => ({ ...e, changes: JSON.parse(e.changes) }));
  const columns = workOrderDeadlines(row, { ...context, entries, now, timeZone, keep });
  if (SLA_COLUMNS.every((c) => columns[c] === row[c])) return;
  db.prepare(
    `UPDATE work_orders SET ${SLA_COLUMNS.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`,
  ).run({ ...columns, id: row.id });
}

/**
 * BR-SLA4: recomputes the deadlines of a work order after a write. A clock that had stopped
 * before the write keeps its deadline (BR-SLA5: the priority in force when it stopped).
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {{ now: string, timeZone: string, before?: object | null }} options `before`: the
 *   row before the write (none for a creation)
 */
export function refreshSla(db, id, { now, timeZone, before = null }) {
  const row = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
  const context = loadSlaContext(db);
  const keep = {
    response: Boolean(before && responseMoment(before, context.settings.response_stop)),
    resolution: Boolean(before?.completed_at),
  };
  store(db, row, context, { now, timeZone, keep });
}

/**
 * BR-SLA4: recomputes every unfinished work order (targets, settings or holidays changed), or
 * every work order (`all`, the mock data), from scratch.
 * @param {import('better-sqlite3').Database} db
 * @param {{ now: string, timeZone: string, all?: boolean }} options
 */
export function recomputeSla(db, { now, timeZone, all = false }) {
  const context = loadSlaContext(db);
  const rows = all
    ? db.prepare('SELECT * FROM work_orders').all()
    : db
        .prepare(
          `SELECT * FROM work_orders WHERE status IN (${UNFINISHED_WORK_ORDER_STATUSES.map(() => '?').join(', ')})`,
        )
        .all(...UNFINISHED_WORK_ORDER_STATUSES);
  for (const row of rows) store(db, row, context, { now, timeZone, keep: {} });
}

const hours = z.number().positive().max(10_000).nullable();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM');

/** PUT /api/sla body: targets and settings in one, at the version of the settings (D88). */
const updateSchema = z
  .strictObject({
    version: WRITE_META.version,
    targets: z
      .array(
        z
          .strictObject({
            priority: z.enum(WORK_ORDER_PRIORITIES),
            response_hours: hours,
            resolution_hours: hours,
          })
          .refine(
            (t) =>
              t.response_hours === null ||
              t.resolution_hours === null ||
              t.resolution_hours >= t.response_hours,
            {
              message: 'The resolution target cannot be shorter than the response target',
              path: ['resolution_hours'],
            },
          ),
      )
      .refine((list) => new Set(list.map((t) => t.priority)).size === list.length, {
        message: 'Each priority once',
      })
      .optional(),
    response_stop: z.enum(SLA_RESPONSE_STOPS).optional(),
    hours_mode: z.enum(SLA_HOURS_MODES).optional(),
    business_days: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Choose at least one day')
      .refine((days) => new Set(days).size === days.length, 'Each day once')
      .optional(),
    business_start: time.optional(),
    business_end: time.optional(),
  })
  .refine((b) => !b.business_start || !b.business_end || b.business_start < b.business_end, {
    message: 'The opening comes before the closing',
    path: ['business_end'],
  });

const holidaySchema = z.strictObject({
  day: isoDate,
  name: z.string().trim().min(1, 'Required').max(100),
});

const parse = (schema, body) => {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
  return parsed.data;
};

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ timeZone: string }} options
 */
export function createSlaService(db, { timeZone }) {
  const settingsRow = db.prepare(
    `SELECT s.*, ${userRefColumns('u')} FROM sla_settings s LEFT JOIN users u ON u.id = s.updated_by
     WHERE s.id = 1`,
  );

  /** GET /api/sla shape. */
  function get() {
    const s = settingsRow.get();
    const targets = new Map(
      db
        .prepare('SELECT priority, response_hours, resolution_hours FROM sla_targets')
        .all()
        .map((t) => [t.priority, t]),
    );
    return {
      targets: PRIORITIES_DOWN.map(
        (priority) =>
          targets.get(priority) ?? { priority, response_hours: null, resolution_hours: null },
      ),
      response_stop: s.response_stop,
      hours_mode: s.hours_mode,
      business_days: s.business_days.split(',').map(Number),
      business_start: s.business_start,
      business_end: s.business_end,
      measured_from: s.measured_from,
      version: s.version,
      updated_by: userRef(s, 'u'),
      updated_at: s.updated_at,
      holidays: db.prepare('SELECT id, day, name FROM sla_holidays ORDER BY day').all(),
    };
  }

  /** One audit entry on the settings, then every unfinished work order recomputed. */
  function logAndRecompute(user, stamp, { changes, note, version }) {
    recordAudit(db, {
      entityType: 'sla_settings',
      entityId: 1,
      action: 'UPDATE',
      changes,
      note,
      label: auditLabel('sla_settings', {}),
      userId: user.id,
      version,
      at: stamp,
    });
    recomputeSla(db, { now: stamp, timeZone });
  }

  return {
    get,

    /** PUT /api/sla (admins): 409 when the settings changed since `version` (D88). */
    update(body, user, { now }) {
      const { version, targets, ...fields } = parse(updateSchema, body);
      const stamp = now.toISOString();
      db.transaction(() => {
        const current = db.prepare('SELECT * FROM sla_settings WHERE id = 1').get();
        if (current.version !== version) {
          throw new HttpError(
            409,
            'The service levels changed since you opened them. Reload and try again.',
            { rule: 'BR-V1' },
          );
        }
        const settings = {
          ...fields,
          ...(fields.business_days && {
            business_days: [...fields.business_days].sort().join(','),
          }),
        };
        const after = { ...current, ...settings };
        if (after.business_start >= after.business_end) {
          throw new HttpError(400, 'Invalid body', {
            fields: { business_end: 'The opening comes before the closing' },
          });
        }
        const changes = diffChanges(current, settings);
        for (const target of targets ?? []) {
          const stored = db
            .prepare('SELECT * FROM sla_targets WHERE priority = ?')
            .get(target.priority);
          for (const key of ['response_hours', 'resolution_hours']) {
            if ((stored?.[key] ?? null) !== target[key]) {
              changes[`${target.priority}.${key}`] = {
                from: stored?.[key] ?? null,
                to: target[key],
              };
            }
          }
          db.prepare(
            `INSERT INTO sla_targets (priority, response_hours, resolution_hours, updated_by,
               updated_at) VALUES (@priority, @response_hours, @resolution_hours, @user, @stamp)
             ON CONFLICT (priority) DO UPDATE SET response_hours = excluded.response_hours,
               resolution_hours = excluded.resolution_hours, updated_by = excluded.updated_by,
               updated_at = excluded.updated_at`,
          ).run({ ...target, user: user.id, stamp });
        }
        if (!Object.keys(changes).length) return;
        // Column names come from the schema above, never from the request as is.
        const sets = Object.keys(settings).map((k) => `${k} = @${k}`);
        db.prepare(
          `UPDATE sla_settings SET ${[...sets, ''].join(', ')}version = version + 1,
             updated_by = @__user, updated_at = @__now WHERE id = 1`,
        ).run({ ...settings, __user: user.id, __now: stamp });
        logAndRecompute(user, stamp, { changes, version: current.version + 1 });
      }).immediate();
      return get();
    },

    /** POST /api/sla/holidays (admins): a day without business hours, for every site. */
    addHoliday(body, user, { now }) {
      const { day, name } = parse(holidaySchema, body);
      const stamp = now.toISOString();
      db.transaction(() => {
        if (db.prepare('SELECT 1 FROM sla_holidays WHERE day = ?').get(day)) {
          throw new HttpError(409, 'This day is already a holiday.', {
            fields: { day: 'Already a holiday' },
          });
        }
        db.prepare(
          'INSERT INTO sla_holidays (day, name, created_by, created_at) VALUES (?, ?, ?, ?)',
        ).run(day, name, user.id, stamp);
        logAndRecompute(user, stamp, {
          changes: { holiday: { from: null, to: day } },
          note: { holiday: name },
        });
      }).immediate();
      return get();
    },

    /** DELETE /api/sla/holidays/:id (admins). */
    removeHoliday(id, user, { now }) {
      const stamp = now.toISOString();
      db.transaction(() => {
        const holiday = db.prepare('SELECT * FROM sla_holidays WHERE id = ?').get(id);
        if (!holiday) throw new HttpError(404, 'Holiday not found');
        db.prepare('DELETE FROM sla_holidays WHERE id = ?').run(id);
        logAndRecompute(user, stamp, {
          changes: { holiday: { from: holiday.day, to: null } },
          note: { holiday: holiday.name },
        });
      }).immediate();
      return get();
    },
  };
}
