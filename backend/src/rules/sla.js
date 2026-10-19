// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Service levels (docs/data-model.md → BR-SLA1 to BR-SLA5, D86, D88). Pure: the settings,
// holidays, history and "now" are given.
import { addDays, dateInZone, isoWeekday, zonedTime } from '../lib/dates.js';
import { PAUSING_HOLD_REASONS } from './enums.js';

/** Share of a target used when a work order becomes "at risk" (D86 section 12). */
export const RISK_SHARE = 0.75;

/** Days walked at most to find a deadline (a year without business hours gives none). */
const MAX_DAYS = 3700;

const HOUR_MS = 3_600_000;

/**
 * BR-SLA1: the work orders measured against targets: corrective (staff requests included),
 * reported since the SLA exists.
 * @param {{ type: string, reported_at: string }} workOrder
 * @param {{ measured_from: string }} settings
 */
export function inSlaScope(workOrder, settings) {
  return workOrder.type === 'CORRECTIVE' && workOrder.reported_at >= settings.measured_from;
}

/**
 * The moment the response clock stops (BR-SLA2): the first start, or the first assignment.
 * @param {{ first_started_at: string | null, first_assigned_at: string | null }} workOrder
 * @param {'START' | 'ASSIGNMENT'} responseStop
 */
export function responseMoment(workOrder, responseStop) {
  return responseStop === 'ASSIGNMENT' ? workOrder.first_assigned_at : workOrder.first_started_at;
}

/**
 * Paused spells (BR-SLA3): time on hold for a pausing reason, read from the status and hold
 * reason changes of the history in the order the server applied them, each at the time it was
 * made (`edited_at`, else `at`). A spell whose end comes before its start counts as zero; one
 * still going on ends at `now`.
 * @param {{ action: string, changes: object, at: string, edited_at?: string | null }[]} entries
 *   the work order's audit entries, by id
 * @param {string} now ISO datetime
 * @returns {{ spells: { from: string, to: string }[], pausedSince: string | null }}
 */
export function pausedSpells(entries, now) {
  let status = null;
  let reason = null;
  let since = null;
  const spells = [];
  for (const entry of entries) {
    if (entry.action === 'CONFLICT') continue;
    const { changes } = entry;
    if (changes.status) status = changes.status.to;
    if (changes.hold_reason) reason = changes.hold_reason.to;
    else if (status !== 'ON_HOLD') reason = null;
    const at = entry.edited_at ?? entry.at;
    const paused = status === 'ON_HOLD' && PAUSING_HOLD_REASONS.includes(reason);
    if (paused && since === null) since = at;
    else if (!paused && since !== null) {
      if (at > since) spells.push({ from: since, to: at });
      since = null;
    }
  }
  if (since !== null && now > since) spells.push({ from: since, to: now });
  return { spells, pausedSince: since };
}

/** Spells sorted and merged, as [start, end] in ms. */
function mergeSpells(spells) {
  const sorted = spells
    .map((s) => [Date.parse(s.from), Date.parse(s.to)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of sorted) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/**
 * The windows SLA time runs in, from the local day of `startMs` on: one endless window in
 * calendar hours (real elapsed time); the opening hours of each business day in business hours
 * (`business_days`, from `business_start` included to `business_end` excluded, holidays
 * left out), in `timeZone`.
 */
function* windows(startMs, settings, holidays, timeZone) {
  if (settings.hours_mode === 'CALENDAR') {
    yield [startMs, Infinity];
    return;
  }
  let day = dateInZone(timeZone, new Date(startMs));
  for (let i = 0; i < MAX_DAYS; i++, day = addDays(day, 1)) {
    if (!settings.business_days.includes(isoWeekday(day)) || holidays.has(day)) continue;
    const open = zonedTime(day, settings.business_start, timeZone).getTime();
    const close = zonedTime(day, settings.business_end, timeZone).getTime();
    if (close > startMs) yield [Math.max(open, startMs), close];
  }
}

/**
 * BR-SLA4: a deadline computed from scratch: from `reportedAt`, `hours` of SLA time (BR-SLA3)
 * not counting the paused spells, giving the moment the target is used up (`due_at`) and the
 * moment RISK_SHARE of it is (`risk_at`), in UTC. Work reported outside business hours starts
 * its clock at the next opening.
 * @param {string} reportedAt ISO datetime
 * @param {number | null} hours target, null for none
 * @param {{ from: string, to: string }[]} spells paused spells
 * @param {{ hours_mode: 'CALENDAR' | 'BUSINESS', business_days: number[],
 *   business_start: string, business_end: string }} settings
 * @param {Set<string>} holidays days without business hours ('YYYY-MM-DD')
 * @param {string} timeZone APP_TIMEZONE
 * @returns {{ due_at: string | null, risk_at: string | null }}
 */
export function slaDeadline(reportedAt, hours, spells, settings, holidays, timeZone) {
  if (hours === null || hours === undefined) return { due_at: null, risk_at: null };
  const goals = { risk_at: hours * RISK_SHARE * HOUR_MS, due_at: hours * HOUR_MS };
  const found = { due_at: null, risk_at: null };
  const pauses = mergeSpells(spells);
  let counted = 0;
  /** Counts the segment [a, b), recording the moments the goals are reached in it. */
  const count = (a, b) => {
    for (const key of ['risk_at', 'due_at']) {
      if (found[key] === null && counted + (b - a) >= goals[key]) {
        found[key] = new Date(a + (goals[key] - counted)).toISOString();
      }
    }
    counted += b - a;
    return found.due_at !== null;
  };
  for (const [start, end] of windows(Date.parse(reportedAt), settings, holidays, timeZone)) {
    let cursor = start;
    for (const [from, to] of pauses) {
      if (to <= cursor) continue;
      if (from >= end) break;
      if (from > cursor && count(cursor, from)) return found;
      cursor = Math.max(cursor, to);
      if (cursor >= end) break;
    }
    if (cursor < end && count(cursor, end)) return found;
  }
  return found;
}

/**
 * Deadlines of one work order (BR-SLA1 to BR-SLA5): both clocks from scratch, except a clock
 * stopped before (`keep`), which keeps its stored deadline. Pauses after a clock stopped do not
 * count for it.
 * @param {object} workOrder stored row (after the write)
 * @param {object} context
 * @param {object} context.settings sla_settings, `business_days` as numbers
 * @param {Map<string, { response_hours: number | null, resolution_hours: number | null }>}
 *   context.targets by priority
 * @param {Set<string>} context.holidays
 * @param {object[]} context.entries the work order's audit entries, by id
 * @param {string} context.now ISO datetime
 * @param {string} context.timeZone
 * @param {{ response?: boolean, resolution?: boolean }} [context.keep]
 * @returns {{ response_due_at, response_risk_at, resolution_due_at, resolution_risk_at,
 *   sla_paused_at }} the columns to store
 */
export function workOrderDeadlines(workOrder, context) {
  const { settings, targets, holidays, entries, now, timeZone, keep = {} } = context;
  const target = targets.get(workOrder.priority);
  const none = {
    response_due_at: null,
    response_risk_at: null,
    resolution_due_at: null,
    resolution_risk_at: null,
    sla_paused_at: null,
  };
  if (!inSlaScope(workOrder, settings) || !target) return none;
  const { spells, pausedSince } = pausedSpells(entries, now);
  const until = (moment) =>
    moment
      ? spells
          .filter((s) => s.from < moment)
          .map((s) => ({ from: s.from, to: s.to < moment ? s.to : moment }))
      : spells;
  const clock = (hours, moment) =>
    slaDeadline(workOrder.reported_at, hours, until(moment), settings, holidays, timeZone);
  const response =
    keep.response && workOrder.response_due_at
      ? { due_at: workOrder.response_due_at, risk_at: workOrder.response_risk_at }
      : clock(target.response_hours, responseMoment(workOrder, settings.response_stop));
  const resolution =
    keep.resolution && workOrder.resolution_due_at
      ? { due_at: workOrder.resolution_due_at, risk_at: workOrder.resolution_risk_at }
      : clock(target.resolution_hours, workOrder.completed_at);
  const unfinished = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(workOrder.status);
  return {
    response_due_at: response.due_at,
    response_risk_at: response.risk_at,
    resolution_due_at: resolution.due_at,
    resolution_risk_at: resolution.risk_at,
    sla_paused_at: unfinished ? pausedSince : null,
  };
}

/**
 * The SLA of a work order in the API (BR-SLA2): per clock its deadline, the moment it is at
 * risk, the moment it stopped and whether that was in time (null while running, and for a
 * cancelled work order); `paused` while on a pausing hold. Null outside BR-SLA1.
 * @param {object} row stored row
 * @param {'START' | 'ASSIGNMENT'} responseStop
 */
export function slaOf(row, responseStop) {
  if (row.response_due_at === null && row.resolution_due_at === null) return null;
  const counted = row.status !== 'CANCELLED';
  const clock = (due, risk, at) => ({
    due_at: due,
    risk_at: risk,
    at,
    met: counted && due && at ? at <= due : null,
  });
  return {
    response: clock(row.response_due_at, row.response_risk_at, responseMoment(row, responseStop)),
    resolution: clock(row.resolution_due_at, row.resolution_risk_at, row.completed_at),
    paused: row.sla_paused_at !== null,
    paused_at: row.sla_paused_at,
  };
}

/**
 * Is this clock late (BR-SLA4, `sla=late`)? Stopped after its deadline, or still running past
 * it; while paused, only when the deadline passed before the pause. Pure.
 * @param {{ due_at: string | null, at: string | null }} clock
 * @param {{ status: string, sla_paused_at: string | null }} workOrder
 * @param {string} now
 */
export function isLate(clock, workOrder, now) {
  if (!clock.due_at || workOrder.status === 'CANCELLED') return false;
  if (clock.at) return clock.at > clock.due_at;
  if (!['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(workOrder.status)) return false;
  return clock.due_at < (workOrder.sla_paused_at ?? now);
}

/**
 * How one clock of a work order counts in the SLA compliance of a period (D86 section 7):
 * `met` or `missed` when it stopped in the period, `missed` when it is still running and
 * already late (BR-SLA4), else null (not counted: no deadline, cancelled, running in time,
 * or stopped outside the period).
 * @param {{ due_at: string | null, at: string | null }} clock
 * @param {{ status: string, sla_paused_at: string | null }} workOrder
 * @param {{ from: string, to: string, now: string, timeZone: string }} period days
 *   'YYYY-MM-DD' in `timeZone`
 * @returns {'met' | 'missed' | null}
 */
export function clockOutcome(clock, workOrder, { from, to, now, timeZone }) {
  if (!clock.due_at || workOrder.status === 'CANCELLED') return null;
  if (clock.at) {
    const day = dateInZone(timeZone, new Date(clock.at));
    if (day < from || day > to) return null;
    return clock.at <= clock.due_at ? 'met' : 'missed';
  }
  return isLate(clock, workOrder, now) ? 'missed' : null;
}
