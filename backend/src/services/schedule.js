// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Week scheduler and My week (D48, Phase 19; docs/data-model.md → BR-S1 to BR-S10): blocks of
// hours per person and day, capacity overrides, open weekends, and the week's tray.
import { z } from 'zod';
import { dateInZone } from '../lib/dates.js';
import { HttpError } from '../lib/http-error.js';
import { weekOfDate } from '../lib/iso-week.js';
import { fieldErrors } from '../middleware/validate.js';
import { diffChanges } from '../rules/audit.js';
import { ALLOCATION_KINDS, CAPACITY_REASONS } from '../rules/enums.js';
import { isoDate, WRITE_META } from '../rules/fields.js';
import {
  allocationBlocker,
  appointmentsOverlap,
  blockChangeBlocker,
  compareBlocks,
  datesOfWeek,
  dayCapacity,
  dayWarnings,
  hoursLeft,
  lockTimeProblem,
  roundUpToHalfHour,
  scheduleDays,
  scheduleTiles,
  trayGroup,
  TRAY_GROUPS,
  weekday,
} from '../rules/schedule.js';
import { recordAudit } from './audit.js';
import { refreshSla } from './sla.js';
import { userRef, userRefColumns } from './mappers.js';

const halfHours = (min, max) =>
  z.number().min(min).max(max).multipleOf(0.5, 'Use steps of half an hour');
const note = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((v) => v || null);
const personId = z.number().int().positive();

const blockSchema = z.strictObject({
  kind: z.enum(ALLOCATION_KINDS),
  work_order_id: z.number().int().positive().nullable().optional(),
  technician_id: personId,
  day: isoDate,
  // The longest block is a setting (3.5 h by default): checked against it as a rule (BR-S1).
  hours: halfHours(0.5, 8),
  note,
});
const createSchema = z.strictObject({ blocks: z.array(blockSchema).min(1).max(20) });
const updateSchema = z.strictObject({
  day: isoDate.optional(),
  technician_id: personId.optional(),
  hours: halfHours(0.5, 8).optional(),
  note,
  version: WRITE_META.version,
});
const lockSchema = z.strictObject({
  locked_start: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Expected a time as HH:MM')
    .nullable(),
  version: WRITE_META.version,
});
const dayOrderSchema = z.strictObject({
  technician_id: personId,
  day: isoDate,
  ids: z.array(z.number().int().positive()).max(50),
});
const capacitySchema = z.strictObject({
  technician_id: personId,
  day: isoDate,
  // null: back to the default hours of the day.
  hours: halfHours(0, 12).nullable(),
  reason: z.enum(CAPACITY_REASONS).optional(),
  note: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v || null),
});
const weekDaysSchema = z.strictObject({
  saturday_open: z.boolean(),
  sunday_open: z.boolean(),
});

const parse = (schema, body) => {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) throw new HttpError(400, 'Invalid body', fieldErrors(parsed.error));
  return parsed.data;
};
const ruleError = ({ rule, message }, status = 422) => new HttpError(status, message, { rule });

const KIND_LABELS = {
  WORK: 'Work',
  TRAVEL: 'Travel',
  PREPARATION: 'Preparation',
  OTHER: 'Other time',
};

const BLOCK_SELECT = `SELECT al.*, ${userRefColumns('lb')},
    w.number AS w__number, w.title AS w__title, w.site AS w__site, w.status AS w__status,
    w.priority AS w__priority, w.category AS w__category, w.type AS w__type,
    w.location AS w__location, w.estimated_hours AS w__estimated_hours,
    w.assignee_id AS w__assignee_id, w.place AS w__place
  FROM allocations al
  LEFT JOIN users lb ON lb.id = al.locked_by
  LEFT JOIN work_orders w ON w.id = al.work_order_id`;

/** Row → Block shape (docs/api-design.md → Block). */
function toBlock(row) {
  return {
    id: row.id,
    kind: row.kind,
    work_order_id: row.work_order_id,
    work_order:
      row.work_order_id === null
        ? null
        : {
            id: row.work_order_id,
            number: row.w__number,
            title: row.w__title,
            site: row.w__site,
            place: row.w__place,
            location: row.w__location,
            status: row.w__status,
            priority: row.w__priority,
            category: row.w__category,
            type: row.w__type,
            estimated_hours: row.w__estimated_hours,
            assignee_id: row.w__assignee_id,
          },
    technician_id: row.technician_id,
    day: row.day,
    hours: row.hours,
    locked_start: row.locked_start,
    locked_by: userRef(row, 'lb'),
    position: row.position,
    note: row.note,
    version: row.version,
    updated_at: row.updated_at,
  };
}

/** Values of a block as logged in the audit log. */
const LOGGED = ['kind', 'work_order_id', 'technician_id', 'day', 'hours', 'locked_start', 'note'];
const loggedValues = (row) => Object.fromEntries(LOGGED.map((k) => [k, row[k] ?? null]));

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ workOrders: ReturnType<import('./work-orders.js').createWorkOrderService>,
 *   planning: ReturnType<import('./planning.js').createPlanningService> }} deps
 */
export function createScheduleService(db, { workOrders, planning, timeZone }) {
  const blockById = db.prepare(`${BLOCK_SELECT} WHERE al.id = ?`);
  const blocksBetween = db.prepare(
    `${BLOCK_SELECT} WHERE al.day BETWEEN ? AND ? ORDER BY al.day, al.technician_id, al.id`,
  );
  const blocksOfWorkOrder = db.prepare(
    `${BLOCK_SELECT} WHERE al.work_order_id = ? AND al.day >= ? ORDER BY al.day, al.id`,
  );
  const blocksOfPerson = db.prepare(
    `${BLOCK_SELECT} WHERE al.technician_id = ? AND al.day BETWEEN ? AND ? ORDER BY al.day, al.id`,
  );
  const people = db.prepare(
    `SELECT id, first_name, last_name, role, specialty, site FROM users
     WHERE role IN ('TECHNICIAN', 'SUPERVISOR') AND is_active = 1
     ORDER BY role = 'SUPERVISOR', last_name, first_name, id`,
  );
  const personById = db.prepare(
    `SELECT id, first_name, last_name, role, is_active FROM users WHERE id = ?`,
  );
  const overridesBetween = db.prepare('SELECT * FROM capacity_overrides WHERE day BETWEEN ? AND ?');
  const weekRow = db.prepare('SELECT * FROM schedule_weeks WHERE week = ?');
  const workOrderRow = db.prepare('SELECT * FROM work_orders WHERE id = ?');

  const openDays = (week) => {
    const row = weekRow.get(week);
    return { saturday_open: row?.saturday_open === 1, sunday_open: row?.sunday_open === 1 };
  };

  /** Label of a block in the audit log: "WO-2026-00012 · Ada Lovelace · 2026-10-05". */
  function blockLabel(block) {
    const person = personById.get(block.technician_id);
    const what = block.work_order_id
      ? workOrderRow.get(block.work_order_id).number
      : KIND_LABELS[block.kind];
    return `${what} · ${person.first_name} ${person.last_name} · ${block.day}`;
  }

  /** An active technician or supervisor (P17), or 422. */
  function checkPerson(id) {
    const person = personById.get(id);
    if (!person || !person.is_active || !['TECHNICIAN', 'SUPERVISOR'].includes(person.role)) {
      throw ruleError({
        rule: 'BR-S3',
        message: 'Only active technicians and supervisors can be given time.',
      });
    }
    return person;
  }

  /** The longest block (BR-S1, a planning setting). */
  function checkLength(hours) {
    const max = planning.settings().max_block_hours;
    if (hours > max) {
      throw ruleError({
        rule: 'BR-S1',
        message: `A block lasts ${max} h at most: split longer work over several blocks.`,
      });
    }
  }

  /**
   * Days of one person in a week: capacity, total, sites and warnings of each day shown.
   * @param {object} person
   * @param {{ day: string, weekday: number, open: boolean }[]} days
   * @param {object[]} blocks the person's blocks of the week
   * @param {Map<string, object>} overrides by `${person}:${day}`
   */
  function personDays(person, days, blocks, overrides, settings) {
    return days.map(({ day, open }) => {
      const override = overrides.get(`${person.id}:${day}`) ?? null;
      const own = blocks.filter((b) => b.day === day);
      const total = own.reduce((sum, b) => sum + b.hours, 0);
      const capacity = open || override ? dayCapacity(day, override, settings) : 0;
      const sites = [
        ...new Set(own.filter((b) => b.kind === 'WORK').map((b) => b.work_order.site)),
      ].sort();
      return {
        day,
        capacity,
        total,
        override: override && {
          hours: override.hours,
          reason: override.reason,
          note: override.note,
        },
        sites,
        warnings: dayWarnings({
          total,
          capacity,
          open,
          absent: override?.hours === 0 && weekday(day) <= 5,
          sites,
        }),
      };
    });
  }

  /** Overrides of a week, by `${person}:${day}`. */
  function overridesOf(dates) {
    return new Map(
      overridesBetween.all(dates[0], dates[6]).map((o) => [`${o.technician_id}:${o.day}`, o]),
    );
  }

  /**
   * Work orders of the week's tray (spec §8): not finished, not waiting for a review (BR-S4),
   * planned this week, carried over from an earlier week (BR-S9) or without a week.
   */
  function tray(week, dates) {
    const rows = db
      .prepare(
        `SELECT w.id, w.number, w.title, w.type, w.status, w.priority, w.category, w.site,
           w.location, w.due_on, w.estimated_hours, w.planned_week, w.plan_id, w.version,
           w.place, ${userRefColumns('asg')},
           (SELECT coalesce(sum(hours), 0) FROM allocations x
             WHERE x.work_order_id = w.id AND x.kind = 'WORK') AS scheduled_hours,
           (SELECT coalesce(sum(hours), 0) FROM allocations x
             WHERE x.work_order_id = w.id AND x.kind = 'WORK'
               AND x.day BETWEEN @monday AND @sunday) AS week_hours
         FROM work_orders w
         LEFT JOIN users asg ON asg.id = w.assignee_id
         WHERE w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')
           AND w.review_status IS NOT 'PENDING'
           AND (w.planned_week IS NULL OR w.planned_week <= @week)`,
      )
      .all({ week, monday: dates[0], sunday: dates[6] });
    const priority = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    return rows
      .map((r) => {
        const group = trayGroup(r.planned_week, week);
        return {
          id: r.id,
          number: r.number,
          title: r.title,
          type: r.type,
          status: r.status,
          priority: r.priority,
          category: r.category,
          site: r.site,
          place: r.place,
          location: r.location,
          due_on: r.due_on,
          planned_week: r.planned_week,
          plan_id: r.plan_id,
          group,
          carried_from: group === 'CARRIED_OVER' ? r.planned_week : null,
          estimated_hours: r.estimated_hours,
          needed_hours: r.estimated_hours === null ? null : roundUpToHalfHour(r.estimated_hours),
          scheduled_hours: r.scheduled_hours,
          week_hours: r.week_hours,
          hours_left: hoursLeft(r.estimated_hours, r.scheduled_hours),
          assignee: userRef(r, 'asg'),
          version: r.version,
        };
      })
      .sort(
        (a, b) =>
          TRAY_GROUPS.indexOf(a.group) - TRAY_GROUPS.indexOf(b.group) ||
          priority[a.priority] - priority[b.priority] ||
          (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') ||
          a.number.localeCompare(b.number),
      );
  }

  /**
   * Writes the follow-up of new WORK blocks on their work order, in the caller's transaction:
   * a work order without a week takes the week of its first block, and one without an
   * assignee is assigned to the first person who gets a block (BR-S3). Logged; the version
   * increases, as for any change of the work order.
   */
  function followBlocks(workOrderId, block, user, stamp) {
    const current = workOrderRow.get(workOrderId);
    const changes = {};
    if (current.planned_week === null) changes.planned_week = weekOfDate(block.day);
    // A work order with an open conflict waits for its arbitration (D4): no assignment.
    if (current.assignee_id === null && !current.has_conflict) {
      changes.assignee_id = block.technician_id;
      // BR-W18: the first assignment (the response stop in ASSIGNMENT mode, BR-SLA2).
      if (!current.first_assigned_at) changes.first_assigned_at = stamp;
    }
    if (!Object.keys(changes).length) return;
    db.prepare(
      `UPDATE work_orders SET ${Object.keys(changes)
        .map((k) => `${k} = @${k}`)
        .join(', ')}, version = version + 1, updated_by = @__user, updated_at = @__now
       WHERE id = @__id`,
    ).run({ ...changes, __user: user.id, __now: stamp, __id: workOrderId });
    recordAudit(db, {
      entityType: 'work_orders',
      entityId: workOrderId,
      action: 'UPDATE',
      changes: diffChanges(current, changes),
      note: { schedule: true },
      label: `${current.number} — ${current.title}`,
      userId: user.id,
      version: current.version + 1,
      at: stamp,
    });
    refreshSla(db, workOrderId, { now: stamp, timeZone, before: current });
  }

  /**
   * Applies a change to one block in an IMMEDIATE transaction: 404, 409 when the version
   * differs, then `check` (throw to refuse; returns the column changes), the update and its
   * audit entry.
   */
  function writeBlock(id, version, user, now, check) {
    const stamp = now.toISOString();
    db.transaction(() => {
      const current = db.prepare('SELECT * FROM allocations WHERE id = ?').get(id);
      if (!current) throw new HttpError(404, 'Block not found');
      if (current.version !== version) {
        throw new HttpError(409, 'This block changed since you opened it. Reload and try again.', {
          rule: 'BR-V1',
        });
      }
      const workOrder = current.work_order_id ? workOrderRow.get(current.work_order_id) : null;
      const changes = check(current, workOrder);
      // The position only orders the day: not worth a log entry.
      const { position: _position, ...visible } = changes;
      const logged = diffChanges(current, visible);
      if (!Object.keys(logged).length) return;
      // Column names come from the callers below, never from the request as is.
      db.prepare(
        `UPDATE allocations SET ${Object.keys(changes)
          .map((k) => `${k} = @${k}`)
          .join(', ')}, version = version + 1, updated_by = @__user, updated_at = @__now
         WHERE id = @__id`,
      ).run({ ...changes, __user: user.id, __now: stamp, __id: id });
      recordAudit(db, {
        entityType: 'allocations',
        entityId: id,
        action: 'UPDATE',
        changes: logged,
        label: blockLabel({ ...current, ...changes }),
        userId: user.id,
        version: current.version + 1,
        at: stamp,
      });
    }).immediate();
    return toBlock(blockById.get(id));
  }

  /** Next position at the end of a person's day. */
  const nextPosition = db
    .prepare(
      'SELECT coalesce(max(position), 0) + 1 FROM allocations WHERE technician_id = ? AND day = ?',
    )
    .pluck();

  return {
    /**
     * GET /api/schedule: people × days of a week, their blocks, the tray and the tiles.
     * @param {string | undefined} week default: the current week
     */
    week(week, { now, timeZone }) {
      const currentWeek = weekOfDate(dateInZone(timeZone, now));
      const shown = week ?? currentWeek;
      const settings = planning.settings();
      const dates = datesOfWeek(shown);
      const blocks = blocksBetween.all(dates[0], dates[6]).map(toBlock);
      const open = openDays(shown);
      const days = scheduleDays(shown, open, new Set(blocks.map((b) => b.day)));
      const overrides = overridesOf(dates);

      const list = people.all();
      const ids = new Set(list.map((p) => p.id));
      // People deactivated since they got blocks this week stay visible with their blocks.
      for (const b of blocks) {
        if (!ids.has(b.technician_id)) {
          ids.add(b.technician_id);
          const p = personById.get(b.technician_id);
          list.push({ ...p, specialty: null, site: null, inactive: true });
        }
      }
      const rows = list.map((p) => {
        const own = blocks
          .filter((b) => b.technician_id === p.id)
          .sort((a, b) => a.day.localeCompare(b.day) || compareBlocks(a, b, { workFirst: true }));
        const personDaysList = personDays(p, days, own, overrides, settings);
        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          role: p.role,
          specialty: p.specialty,
          site: p.site,
          ...(p.inactive && { inactive: true }),
          week_total: personDaysList.reduce((sum, d) => sum + d.total, 0),
          week_capacity: personDaysList.reduce((sum, d) => sum + d.capacity, 0),
          days: personDaysList,
          blocks: own,
        };
      });
      const trayItems = tray(shown, dates);
      return {
        week: shown,
        current_week: currentWeek,
        days,
        saturday_open: open.saturday_open,
        sunday_open: open.sunday_open,
        settings: { daily_hours: settings.daily_hours, max_block_hours: settings.max_block_hours },
        people: rows,
        tray: trayItems,
        tiles: scheduleTiles(rows, blocks, trayItems),
      };
    },

    /**
     * GET /api/my-week: one person's days, blocks (appointments first, then their own order)
     * and the work orders of the blocks, complete, so My week opens them offline.
     */
    myWeek(week, user, { now, timeZone }) {
      const currentWeek = weekOfDate(dateInZone(timeZone, now));
      const shown = week ?? currentWeek;
      const settings = planning.settings();
      const dates = datesOfWeek(shown);
      const blocks = blocksOfPerson
        .all(user.id, dates[0], dates[6])
        .map(toBlock)
        .sort((a, b) => a.day.localeCompare(b.day) || compareBlocks(a, b));
      const open = openDays(shown);
      const days = scheduleDays(shown, open, new Set(blocks.map((b) => b.day)));
      const daysOut = personDays(user, days, blocks, overridesOf(dates), settings).map((d, i) => ({
        ...d,
        weekday: days[i].weekday,
        blocks: blocks.filter((b) => b.day === d.day),
      }));
      const workOrderIds = [...new Set(blocks.map((b) => b.work_order_id).filter(Boolean))];
      return {
        week: shown,
        current_week: currentWeek,
        generated_at: now.toISOString(),
        user: { id: user.id, first_name: user.first_name, last_name: user.last_name },
        days: daysOut,
        week_total: daysOut.reduce((sum, d) => sum + d.total, 0),
        week_capacity: daysOut.reduce((sum, d) => sum + d.capacity, 0),
        work_orders: workOrderIds.map((id) => workOrders.getById(id)),
      };
    },

    /**
     * GET /api/schedule/work-orders/:id: the blocks of a work order from today on, each with
     * its person, for the "Scheduled" line of the work order panel (M10).
     */
    workOrderBlocks(id, { now, timeZone }) {
      if (!workOrderRow.get(id)) throw new HttpError(404, 'Work order not found');
      const items = blocksOfWorkOrder
        .all(id, dateInZone(timeZone, now))
        .map(toBlock)
        .sort((a, b) => a.day.localeCompare(b.day) || compareBlocks(a, b));
      return {
        items: items.map((b) => {
          const person = personById.get(b.technician_id);
          return {
            ...b,
            technician: {
              id: person.id,
              first_name: person.first_name,
              last_name: person.last_name,
            },
          };
        }),
      };
    },

    /**
     * POST /api/schedule/allocations: one or several blocks in one transaction (a split).
     * @returns {object[]} the new blocks
     */
    createBlocks(body, user, { now }) {
      const { blocks } = parse(createSchema, body);
      const stamp = now.toISOString();
      blocks.forEach((b, i) => {
        if ((b.kind === 'WORK') !== Boolean(b.work_order_id)) {
          throw new HttpError(400, 'Invalid body', {
            fields: {
              [`blocks.${i}.work_order_id`]:
                b.kind === 'WORK'
                  ? 'A work block needs its work order'
                  : 'Only work blocks have a work order',
            },
          });
        }
      });
      const ids = db
        .transaction(() =>
          blocks.map((b) => {
            checkPerson(b.technician_id);
            checkLength(b.hours);
            if (b.work_order_id) {
              const wo = workOrderRow.get(b.work_order_id);
              if (!wo) {
                throw ruleError({ rule: 'BR-S4', message: 'This work order does not exist.' });
              }
              const blocker = allocationBlocker(wo);
              if (blocker) throw ruleError(blocker);
            }
            const row = {
              kind: b.kind,
              work_order_id: b.work_order_id ?? null,
              technician_id: b.technician_id,
              day: b.day,
              hours: b.hours,
              note: b.note ?? null,
              position: nextPosition.get(b.technician_id, b.day),
            };
            const id = Number(
              db
                .prepare(
                  `INSERT INTO allocations (kind, work_order_id, technician_id, day, hours, note,
                     position, created_by, updated_by, created_at, updated_at)
                   VALUES (@kind, @work_order_id, @technician_id, @day, @hours, @note, @position,
                     @user, @user, @stamp, @stamp)`,
                )
                .run({ ...row, user: user.id, stamp }).lastInsertRowid,
            );
            recordAudit(db, {
              entityType: 'allocations',
              entityId: id,
              action: 'CREATE',
              changes: diffChanges({}, loggedValues(row)),
              label: blockLabel(row),
              userId: user.id,
              version: 1,
              at: stamp,
            });
            if (row.work_order_id) followBlocks(row.work_order_id, row, user, stamp);
            return id;
          }),
        )
        .immediate();
      return ids.map((id) => toBlock(blockById.get(id)));
    },

    /** PUT /api/schedule/allocations/:id: day, person, length or note (supervisors, admins). */
    updateBlock(id, body, user, { now }) {
      const { version, ...sent } = parse(updateSchema, body);
      // Only the fields sent (a note left out is not a note removed).
      const change = Object.fromEntries(
        Object.keys(sent)
          .filter((k) => k in body)
          .map((k) => [k, sent[k]]),
      );
      if (!Object.keys(change).length) throw new HttpError(400, 'No field to update');
      return writeBlock(id, version, user, now, (current, workOrder) => {
        const blocker = blockChangeBlocker(current, workOrder, change);
        if (blocker) throw ruleError(blocker);
        if ('technician_id' in change && change.technician_id !== current.technician_id) {
          checkPerson(change.technician_id);
        }
        if ('hours' in change && change.hours !== current.hours) checkLength(change.hours);
        const moved =
          ('day' in change && change.day !== current.day) ||
          ('technician_id' in change && change.technician_id !== current.technician_id);
        return {
          ...change,
          // A block moved to another day or person goes to the end of that day.
          ...(moved && {
            position: nextPosition.get(
              change.technician_id ?? current.technician_id,
              change.day ?? current.day,
            ),
          }),
        };
      });
    },

    /** DELETE /api/schedule/allocations/:id?version=N: its hours go back to the tray. */
    deleteBlock(id, version, user, { now }) {
      const stamp = now.toISOString();
      db.transaction(() => {
        const current = db.prepare('SELECT * FROM allocations WHERE id = ?').get(id);
        if (!current) throw new HttpError(404, 'Block not found');
        if (current.version !== version) {
          throw new HttpError(
            409,
            'This block changed since you opened it. Reload and try again.',
            { rule: 'BR-V1' },
          );
        }
        const workOrder = current.work_order_id ? workOrderRow.get(current.work_order_id) : null;
        const blocker = blockChangeBlocker(current, workOrder, 'DELETE');
        if (blocker) throw ruleError(blocker);
        const label = blockLabel(current);
        db.prepare('DELETE FROM allocations WHERE id = ?').run(id);
        recordAudit(db, {
          entityType: 'allocations',
          entityId: id,
          action: 'DELETE',
          note: { snapshot: loggedValues(current) },
          label,
          userId: user.id,
          version: current.version,
          at: stamp,
        });
      }).immediate();
    },

    /**
     * PUT /api/schedule/allocations/:id/lock (BR-S6): sets or removes an appointment.
     * Supervisors and admins on any block, technicians on their own (BR-S7).
     */
    lockBlock(id, body, user, { now }) {
      const { locked_start: start, version } = parse(lockSchema, body);
      return writeBlock(id, version, user, now, (current) => {
        if (user.role === 'TECHNICIAN' && current.technician_id !== user.id) {
          throw new HttpError(403, 'You can only lock your own blocks.');
        }
        if (current.kind !== 'WORK') {
          throw ruleError({ rule: 'BR-S6', message: 'Only work blocks can be appointments.' });
        }
        if (start === null) return { locked_start: null, locked_by: null };
        const problem = lockTimeProblem(start, current.hours);
        if (problem)
          throw new HttpError(400, 'Invalid body', { fields: { locked_start: problem } });
        const others = db
          .prepare(
            `SELECT id, locked_start, hours FROM allocations
             WHERE technician_id = ? AND day = ? AND locked_start IS NOT NULL AND id <> ?`,
          )
          .all(current.technician_id, current.day, id);
        const clash = others.find((o) =>
          appointmentsOverlap(o, { locked_start: start, hours: current.hours }),
        );
        if (clash) {
          throw ruleError(
            {
              rule: 'BR-S6',
              message: `This time overlaps another appointment of the day, at ${clash.locked_start}.`,
            },
            409,
          );
        }
        return { locked_start: start, locked_by: user.id };
      });
    },

    /**
     * PUT /api/schedule/day-order (BR-S7): a person's own order of their day. The ids must
     * be exactly the blocks of that day. Not versioned and not logged: it only orders the day.
     */
    dayOrder(body, user) {
      const { technician_id: personIdValue, day, ids } = parse(dayOrderSchema, body);
      if (user.role === 'TECHNICIAN' && personIdValue !== user.id) {
        throw new HttpError(403, 'You can only order your own day.');
      }
      db.transaction(() => {
        const existing = db
          .prepare('SELECT id FROM allocations WHERE technician_id = ? AND day = ?')
          .pluck()
          .all(personIdValue, day);
        const same =
          existing.length === ids.length &&
          new Set(ids).size === ids.length &&
          ids.every((i) => existing.includes(i));
        if (!same) {
          throw new HttpError(409, 'This day changed since you opened it. Reload and try again.', {
            rule: 'BR-V1',
          });
        }
        const update = db.prepare('UPDATE allocations SET position = ? WHERE id = ?');
        ids.forEach((blockId, i) => update.run(i + 1, blockId));
      }).immediate();
      return {
        items: db
          .prepare(`${BLOCK_SELECT} WHERE al.technician_id = ? AND al.day = ?`)
          .all(personIdValue, day)
          .map(toBlock)
          .sort((a, b) => compareBlocks(a, b)),
      };
    },

    /**
     * PUT /api/schedule/capacity: a person's hours on one day (leave, part time, weekend
     * work), or back to the default with `hours: null`. Not logged (planning detail).
     */
    setCapacity(body, user, { now }) {
      const input = parse(capacitySchema, body);
      checkPerson(input.technician_id);
      if (input.hours === null) {
        db.prepare('DELETE FROM capacity_overrides WHERE technician_id = ? AND day = ?').run(
          input.technician_id,
          input.day,
        );
        return { technician_id: input.technician_id, day: input.day, override: null };
      }
      if (!input.reason) {
        throw new HttpError(400, 'Invalid body', {
          fields: { reason: 'Say why the hours change' },
        });
      }
      db.prepare(
        `INSERT INTO capacity_overrides (technician_id, day, hours, reason, note, updated_by, updated_at)
         VALUES (@technician_id, @day, @hours, @reason, @note, @user, @stamp)
         ON CONFLICT (technician_id, day) DO UPDATE SET hours = excluded.hours,
           reason = excluded.reason, note = excluded.note, updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      ).run({ ...input, user: user.id, stamp: now.toISOString() });
      return {
        technician_id: input.technician_id,
        day: input.day,
        override: { hours: input.hours, reason: input.reason, note: input.note },
      };
    },

    /** PUT /api/schedule/weeks/:week: opens or closes Saturday and Sunday (P11). */
    setWeekDays(week, body, user, { now }) {
      const { saturday_open: saturday, sunday_open: sunday } = parse(weekDaysSchema, body);
      db.prepare(
        `INSERT INTO schedule_weeks (week, saturday_open, sunday_open, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (week) DO UPDATE SET saturday_open = excluded.saturday_open,
           sunday_open = excluded.sunday_open, updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      ).run(week, saturday ? 1 : 0, sunday ? 1 : 0, user.id, now.toISOString());
      return { week, saturday_open: saturday, sunday_open: sunday };
    },
  };
}
