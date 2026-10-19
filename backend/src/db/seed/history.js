// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Demo history (D64): past plan visits and past weeks of the week scheduler, so the dashboard
// widgets that look back (preventive compliance, regulatory visits, schedule kept, contractors,
// response times, critical downtime) show figures on the demo data. Own random stream: the rest
// of the dataset is the same with or without it.
import { addDays } from '../../lib/dates.js';
import { addWeeks, mondayOf, weekOfDate } from '../../lib/iso-week.js';
import { auditLabel, creationChanges } from '../../rules/audit.js';
import { seriesWeeks } from '../../rules/planning.js';
import { recordAudit } from '../../services/audit.js';
import { createRandom } from './random.js';

const HISTORY_RANDOM_SEED = 20261012;
/** Weeks of visits before the current week (a 90-day period and the tolerances around it). */
export const HISTORY_WEEKS = 16;
/** Finished weeks of the week scheduler before the current week. */
const SCHEDULED_WEEKS = 6;
/** High and critical assets given a past breakdown, repaired since. */
const PAST_BREAKDOWNS = 10;

const SKIP_REASONS = [
  'Access refused by the branch (event in the lobby)',
  'Equipment replaced the week before',
  'Contractor did not come; visit planned again next cycle',
  'Building closed for works',
];

/**
 * Anchor of a plan with history: its first visit moved back by whole periods into the weeks
 * before the current one, never before the week after the plan was created. Future visits are
 * the same (same series), so the planner's peaks do not change. Only plans on a fixed calendar
 * and without season get history: closing a visit re-anchors a floating plan (BR-P5).
 * @param {{ anchor_week: string, frequency_weeks: number, schedule_mode: string,
 *   season_from_week: number | null, created_at: string }} plan
 * @param {string} currentWeek
 */
export function historyAnchor(plan, currentWeek) {
  if (plan.schedule_mode !== 'FIXED' || plan.season_from_week) return plan.anchor_week;
  const created = addWeeks(weekOfDate(plan.created_at.slice(0, 10)), 1);
  const window = addWeeks(currentWeek, -HISTORY_WEEKS);
  const earliest = created > window ? created : window;
  let anchor = plan.anchor_week;
  while (addWeeks(anchor, -plan.frequency_weeks) >= earliest) {
    anchor = addWeeks(anchor, -plan.frequency_weeks);
  }
  return anchor;
}

/** A weekday (Monday to Friday) of a week, never after `latest`. */
const weekday = (rng, week, latest) => {
  const day = addDays(mondayOf(week), rng.int(0, 4));
  return day > latest ? latest : day;
};

/** Hours on the half hour, at least half an hour. */
const halfHours = (hours) => Math.max(0.5, Math.round(hours * 2) / 2);

/**
 * Past visits of the plans with history, with their work orders, audit history and blocks.
 * @param {import('better-sqlite3').Database} db
 * @param {{ today: string, now: Date }} options
 * @returns {{ visits: number, workOrders: number, blocks: number }}
 */
export function insertPastWork(db, { today, now }) {
  const rng = createRandom(HISTORY_RANDOM_SEED);
  const currentWeek = weekOfDate(today);
  const yesterday = addDays(today, -1);
  const latest = new Date(now.getTime() - 60_000);
  /** An instant on a day, at a working hour, never after now. */
  const at = (day, hour = rng.int(7, 17)) => {
    const t = new Date(
      `${day}T${String(hour).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}:00.000Z`,
    );
    return (t > latest ? latest : t).toISOString();
  };

  const users = db.prepare('SELECT id, username, role, specialty FROM users').all();
  const id = (username) => users.find((u) => u.username === username).id;
  const supervisor = id('supervisor1');
  const workers = users.filter((u) => ['TECHNICIAN', 'SUPERVISOR'].includes(u.role));
  /** The person doing an internal visit: someone of the trade, else a technician. */
  const workerFor = (category) =>
    rng.pick(
      workers.filter((u) => u.specialty === category).length
        ? workers.filter((u) => u.specialty === category)
        : workers.filter((u) => u.role === 'TECHNICIAN'),
    );

  const plans = db
    .prepare(
      `SELECT * FROM maintenance_plans WHERE is_active = 1 AND schedule_mode = 'FIXED'
         AND season_from_week IS NULL AND anchor_week < ? ORDER BY id`,
    )
    .all(currentWeek);

  const highest = new Map();
  const numberFor = (createdOn) => {
    const year = createdOn.slice(0, 4);
    if (!highest.has(year)) {
      const max = db
        .prepare("SELECT max(number) FROM work_orders WHERE number LIKE 'WO-' || ? || '-%'")
        .pluck()
        .get(year);
      highest.set(year, max ? Number(max.slice(8)) : 0);
    }
    highest.set(year, highest.get(year) + 1);
    return `WO-${year}-${String(highest.get(year)).padStart(5, '0')}`;
  };

  const insertWorkOrder = db.prepare(`INSERT INTO work_orders
    (number, type, status, priority, title, description, asset_id, site, location_id, place,
     location, category,
     assignee_id, supervisor_id, created_on, due_on, started_on, completed_on, closed_on,
     estimated_hours, actual_hours, work_report, plan_id, planned_week, reported_at,
     completed_at, created_by, updated_by, created_at, updated_at)
    VALUES (@number, @type, @status, 'NORMAL', @title, @description, @asset_id, @site,
     @location_id, @place, NULL,
     @category, @assignee_id, @supervisor_id, @created_on, @due_on, @started_on, @closed_on,
     @closed_on, @estimated_hours, @actual_hours, @work_report, @plan_id, @planned_week,
     @created_at, @completed_at, @created_by, @updated_by, @created_at, @updated_at)`);
  const insertVisit = db.prepare(`INSERT INTO plan_occurrences
    (plan_id, due_week, week, status, work_order_id, skip_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertBlock = db.prepare(`INSERT INTO allocations
    (kind, work_order_id, technician_id, day, hours, position, created_by, updated_by,
     created_at, updated_at)
    VALUES ('WORK', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const firstScheduled = addWeeks(currentWeek, -SCHEDULED_WEEKS);
  // One regulatory visit is always late and still going on, so the dashboards have a
  // regulatory visit to flag: the latest one due two weeks ago or earlier.
  const lateTarget = plans
    .filter((p) => p.type === 'REGULATORY')
    .flatMap((p) =>
      seriesWeeks(p, p.anchor_week, addWeeks(currentWeek, -2)).map((week) => ({
        plan: p.id,
        week,
      })),
    )
    .sort((a, b) => b.week.localeCompare(a.week) || a.plan - b.plan)[0];
  const positions = new Map();
  let visits = 0;
  let workOrders = 0;
  let blocks = 0;

  for (const plan of plans) {
    for (const week of seriesWeeks(plan, plan.anchor_week, addWeeks(currentWeek, -1))) {
      visits += 1;
      const monday = mondayOf(week);
      const label = `${plan.code} · ${week}`;
      const forcedLate = lateTarget?.plan === plan.id && lateTarget.week === week;
      // A few visits are skipped, with the reason.
      if (rng.chance(0.06) && !forcedLate) {
        const stamp = at(addDays(monday, -rng.int(1, 6)));
        const visitId = Number(
          insertVisit.run(
            plan.id,
            week,
            week,
            'SKIPPED',
            null,
            rng.pick(SKIP_REASONS),
            stamp,
            stamp,
          ).lastInsertRowid,
        );
        recordAudit(db, {
          entityType: 'plan_occurrences',
          entityId: visitId,
          action: 'UPDATE',
          changes: { status: { from: 'PLANNED', to: 'SKIPPED' } },
          label,
          userId: supervisor,
          at: stamp,
        });
        continue;
      }

      // Released 4 weeks ahead (never before the plan existed), done in its week mostly.
      const planCreated = plan.created_at.slice(0, 10);
      const released = addDays(monday, -28) > planCreated ? addDays(monday, -28) : planCreated;
      const deadline = addDays(
        mondayOf(plan.type === 'REGULATORY' ? week : addWeeks(week, plan.tolerance_weeks)),
        6,
      );
      const late = rng.chance(plan.type === 'REGULATORY' ? 0.18 : 0.14);
      let closedOn = late ? addDays(deadline, rng.int(1, 12)) : weekday(rng, week, yesterday);
      if (closedOn < released) closedOn = released;
      // Not done yet when its day is still to come: in progress (late once its deadline passed).
      const open = forcedLate || closedOn > yesterday;
      const contractor = plan.performed_by === 'CONTRACTOR';
      const worker = contractor ? null : workerFor(plan.category);
      const startedOn = open ? (monday <= yesterday ? monday : null) : closedOn;
      const wo = {
        number: numberFor(released),
        type: plan.type,
        status: open ? (startedOn ? 'IN_PROGRESS' : 'OPEN') : 'CLOSED',
        title: `${plan.title.slice(0, 186)} – ${week}`,
        description: plan.description,
        asset_id: plan.asset_id,
        site: plan.site,
        location_id: plan.location_id,
        place: plan.place,
        category: plan.category,
        assignee_id: worker?.id ?? null,
        supervisor_id: supervisor,
        created_on: released,
        due_on: addDays(monday, 4) < released ? released : addDays(monday, 4),
        started_on: startedOn,
        closed_on: open ? null : closedOn,
        estimated_hours: plan.estimated_hours,
        actual_hours: open ? null : halfHours(plan.estimated_hours * (0.8 + rng.next() * 0.7)),
        work_report: open
          ? null
          : contractor
            ? `Visit by ${plan.supplier}; report received and filed.`
            : 'Visit done following the maintenance checklist; no anomaly left open.',
        plan_id: plan.id,
        planned_week: week,
        created_by: plan.created_by,
        updated_by: worker?.id ?? supervisor,
        created_at: at(released, 5),
        updated_at: null,
      };
      wo.updated_at = open ? at(startedOn ?? released, 16) : at(closedOn, rng.int(14, 18));
      if (wo.updated_at < wo.created_at) wo.updated_at = wo.created_at;
      // Technically done, then closed by the supervisor the same day (D86).
      wo.completed_at = open ? null : wo.updated_at;
      const woId = Number(insertWorkOrder.run(wo).lastInsertRowid);
      workOrders += 1;
      const visitId = Number(
        insertVisit.run(plan.id, week, week, 'RELEASED', woId, null, wo.created_at, wo.created_at)
          .lastInsertRowid,
      );

      // History: the release, then the work order's creation, start and closing (BR-L4).
      recordAudit(db, {
        entityType: 'plan_occurrences',
        entityId: visitId,
        action: 'UPDATE',
        changes: {
          status: { from: 'PLANNED', to: 'RELEASED' },
          work_order_id: { from: null, to: woId },
        },
        label,
        userId: plan.created_by,
        at: wo.created_at,
      });
      const woLabel = auditLabel('work_orders', wo);
      const entry = (changes, userId, when) =>
        recordAudit(db, {
          entityType: 'work_orders',
          entityId: woId,
          action: changes === null ? 'CREATE' : 'UPDATE',
          changes:
            changes ??
            creationChanges({
              number: wo.number,
              type: wo.type,
              status: 'OPEN',
              priority: 'NORMAL',
              title: wo.title,
              description: wo.description,
              asset_id: wo.asset_id,
              site: wo.site,
              category: wo.category,
              created_on: wo.created_on,
              due_on: wo.due_on,
              estimated_hours: wo.estimated_hours,
              plan_id: wo.plan_id,
              planned_week: wo.planned_week,
            }),
          label: woLabel,
          userId,
          version: 1,
          at: when,
        });
      entry(null, plan.created_by, wo.created_at);
      if (startedOn) {
        const startedAt = at(startedOn, 8);
        entry(
          {
            status: { from: 'OPEN', to: 'IN_PROGRESS' },
            started_on: { from: null, to: startedOn },
            ...(worker ? { assignee_id: { from: null, to: worker.id } } : {}),
          },
          worker?.id ?? supervisor,
          startedAt < wo.created_at ? wo.created_at : startedAt,
        );
      }
      if (!open) {
        entry(
          {
            status: { from: 'IN_PROGRESS', to: 'COMPLETED' },
            completed_on: { from: null, to: closedOn },
            completed_at: { from: null, to: wo.completed_at },
            actual_hours: { from: null, to: wo.actual_hours },
            work_report: { from: null, to: wo.work_report },
          },
          worker?.id ?? supervisor,
          wo.completed_at,
        );
        entry(
          {
            status: { from: 'COMPLETED', to: 'CLOSED' },
            closed_on: { from: null, to: closedOn },
          },
          supervisor,
          wo.updated_at,
        );
      }

      // The last finished weeks were planned in the week scheduler: the internal visits got
      // blocks, mostly booked the Thursday before, some once the week had started.
      if (!contractor && week >= firstScheduled) {
        const day =
          !open && closedOn <= addDays(monday, 4) ? closedOn : addDays(monday, rng.int(0, 2));
        const breakIn = rng.chance(0.2);
        const booked = at(breakIn ? addDays(monday, rng.int(0, 1)) : addDays(monday, -4), 9);
        let left = halfHours(plan.estimated_hours);
        let blockDay = day;
        while (left > 0 && blockDay <= addDays(monday, 4)) {
          const hours = Math.min(3.5, left);
          const key = `${worker.id}:${blockDay}`;
          positions.set(key, (positions.get(key) ?? 0) + 1);
          const blockId = Number(
            insertBlock.run(
              woId,
              worker.id,
              blockDay,
              hours,
              positions.get(key),
              supervisor,
              supervisor,
              booked,
              booked,
            ).lastInsertRowid,
          );
          recordAudit(db, {
            entityType: 'allocations',
            entityId: blockId,
            action: 'CREATE',
            changes: creationChanges({
              kind: 'WORK',
              work_order_id: woId,
              technician_id: worker.id,
              day: blockDay,
              hours,
            }),
            label: `${wo.number} · ${blockDay}`,
            userId: supervisor,
            version: 1,
            at: booked,
          });
          blocks += 1;
          left -= hours;
          blockDay = addDays(blockDay, 1);
        }
      }
    }
  }

  // Past breakdowns of high and critical assets, repaired since (critical downtime).
  const assets = db
    .prepare(
      `SELECT * FROM assets WHERE status = 'IN_SERVICE' AND criticality IN ('HIGH', 'CRITICAL')
       ORDER BY id`,
    )
    .all();
  for (const asset of rng.shuffle(assets).slice(0, PAST_BREAKDOWNS)) {
    const broke = addDays(today, -rng.int(10, 85));
    const fixed = addDays(broke, rng.int(0, 6));
    const label = auditLabel('assets', asset);
    for (const [day, from, to] of [
      [broke, 'IN_SERVICE', 'BROKEN_DOWN'],
      [fixed, 'BROKEN_DOWN', 'IN_SERVICE'],
    ]) {
      recordAudit(db, {
        entityType: 'assets',
        entityId: asset.id,
        action: 'UPDATE',
        changes: { status: { from, to } },
        label,
        userId: rng.pick(workers).id,
        at: at(day),
      });
    }
  }

  renumberWorkOrders(db);
  return { visits, workOrders, blocks };
}

/**
 * Numbers follow creation order, with a sequence per year (BR-W10): the visits of the history
 * were created before many generated work orders, so every number is given again in order of
 * `created_at`, and the audit labels and creation entries follow.
 * @param {import('better-sqlite3').Database} db
 */
function renumberWorkOrders(db) {
  const rows = db
    .prepare('SELECT id, number, created_on FROM work_orders ORDER BY created_at, id')
    .all();
  const sequence = new Map();
  const renamed = [];
  for (const row of rows) {
    const year = row.created_on.slice(0, 4);
    const n = (sequence.get(year) ?? 0) + 1;
    sequence.set(year, n);
    const number = `WO-${year}-${String(n).padStart(5, '0')}`;
    if (number !== row.number) renamed.push({ ...row, to: number });
  }
  // Two steps, numbers being unique: first a number of the year 9999 (never used), then the new one.
  const park = db.prepare(
    "UPDATE work_orders SET number = 'WO-9999-' || printf('%05d', id) WHERE id = ?",
  );
  const set = db.prepare('UPDATE work_orders SET number = ? WHERE id = ?');
  const labels = db.prepare(
    `UPDATE audit_log SET label = @to || substr(label, length(@from) + 1)
     WHERE (entity_type = 'work_orders' AND entity_id = @id)
        OR (entity_type = 'allocations' AND label LIKE @from || ' ·%')`,
  );
  const created = db.prepare(
    `UPDATE audit_log SET changes = json_set(changes, '$.number.to', @to)
     WHERE entity_type = 'work_orders' AND entity_id = @id AND action = 'CREATE'
       AND json_extract(changes, '$.number.to') IS NOT NULL`,
  );
  for (const r of renamed) park.run(r.id);
  for (const r of renamed) {
    set.run(r.to, r.id);
    labels.run({ id: r.id, from: r.number, to: r.to });
    created.run({ id: r.id, to: r.to });
  }
}
