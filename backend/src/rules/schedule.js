// Week scheduler rules that need no database (docs/data-model.md → BR-S1 to BR-S10): days of
// a week, daily capacity, hours left on a work order, warnings, appointments and the tray.
import { addDays } from '../lib/dates.js';
import { mondayOf } from '../lib/iso-week.js';
import { TERMINAL_WORK_ORDER_STATUSES } from './enums.js';

/** Last minute of a day: an appointment ends at 24:00 at the latest. */
const DAY_MINUTES = 24 * 60;

/** Day of the week of a date, Monday = 1 … Sunday = 7. */
export function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

/** The seven dates of a week, Monday first. */
export function datesOfWeek(week) {
  const monday = mondayOf(week);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Days shown for a week (P11, BR-S8): Monday to Friday, and Saturday or Sunday when opened,
 * or when they hold blocks (so no block is ever hidden).
 * @param {string} week
 * @param {{ saturday_open: boolean, sunday_open: boolean }} open
 * @param {Set<string>} [daysWithBlocks]
 * @returns {{ day: string, weekday: number, open: boolean }[]}
 */
export function scheduleDays(week, open, daysWithBlocks = new Set()) {
  return datesOfWeek(week)
    .map((day, i) => {
      const n = i + 1;
      const isOpen = n <= 5 || (n === 6 ? open.saturday_open : open.sunday_open);
      return { day, weekday: n, open: isOpen };
    })
    .filter((d) => d.open || daysWithBlocks.has(d.day));
}

/**
 * Hours a person can work on a day (P5, P11): the override when there is one, otherwise the
 * daily hours Monday to Friday and nothing on weekends.
 * @param {string} day
 * @param {{ hours: number } | null | undefined} override
 * @param {{ daily_hours: number }} settings
 */
export function dayCapacity(day, override, settings) {
  if (override) return override.hours;
  return weekday(day) <= 5 ? settings.daily_hours : 0;
}

/** Hours rounded up to the next half hour (P4). */
export function roundUpToHalfHour(hours) {
  return Math.ceil(hours * 2 - 1e-9) / 2;
}

/**
 * Hours still to schedule on a work order (BR-S2): its estimate rounded up to the half hour,
 * minus its WORK blocks, never below 0. Null without an estimate.
 * @param {number | null} estimate
 * @param {number} scheduled
 */
export function hoursLeft(estimate, scheduled) {
  if (estimate === null || estimate === undefined) return null;
  return Math.max(0, roundUpToHalfHour(estimate) - scheduled);
}

/**
 * Warnings of a person's day, never refusals (BR-S5, BR-S8, BR-S10):
 * - OVER_CAPACITY: blocks add up to more than the day's capacity;
 * - ABSENT: blocks on a day the person has 0 h by an override (leave…);
 * - WEEKEND_CLOSED: blocks on a Saturday or Sunday not opened for the week;
 * - SEVERAL_SITES: work on two sites or more (add travel time).
 * @param {{ total: number, capacity: number, open: boolean, absent: boolean, sites: string[] }} day
 * @returns {string[]}
 */
export function dayWarnings({ total, capacity, open, absent, sites }) {
  const warnings = [];
  if (total > capacity) warnings.push('OVER_CAPACITY');
  if (total > 0 && absent) warnings.push('ABSENT');
  if (total > 0 && !open) warnings.push('WEEKEND_CLOSED');
  if (sites.length >= 2) warnings.push('SEVERAL_SITES');
  return warnings;
}

/** 'HH:MM' → minutes after midnight. */
export const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Why an appointment start cannot be used, or null (P6): a time on the half hour, ending by
 * midnight.
 * @param {string} start 'HH:MM'
 * @param {number} hours
 */
export function lockTimeProblem(start, hours) {
  if (!/^([01]\d|2[0-3]):[03]0$/.test(start)) {
    return 'Choose a start time on the hour or the half hour, from 00:00 to 23:30.';
  }
  if (toMinutes(start) + hours * 60 > DAY_MINUTES) {
    return 'This appointment would end after midnight.';
  }
  return null;
}

/**
 * True when two appointments of one person overlap on the same day (BR-S6).
 * @param {{ locked_start: string, hours: number }} a
 * @param {{ locked_start: string, hours: number }} b
 */
export function appointmentsOverlap(a, b) {
  const startA = toMinutes(a.locked_start);
  const startB = toMinutes(b.locked_start);
  return startA < startB + b.hours * 60 && startB < startA + a.hours * 60;
}

/**
 * Why a work order cannot receive blocks, or null (BR-S2, BR-S4).
 * @param {{ status: string, review_status: string | null, estimated_hours: number | null }} wo
 * @returns {{ rule: string, message: string } | null}
 */
export function allocationBlocker(wo) {
  if (TERMINAL_WORK_ORDER_STATUSES.includes(wo.status)) {
    return { rule: 'BR-S4', message: 'This work order is finished: it cannot get more time.' };
  }
  if (wo.review_status === 'PENDING') {
    return {
      rule: 'BR-S4',
      message: 'This staff request is waiting for its review: approve it before scheduling it.',
    };
  }
  if (wo.estimated_hours === null || wo.estimated_hours === undefined) {
    return { rule: 'BR-S2', message: 'Give this work order an estimate before scheduling it.' };
  }
  return null;
}

/**
 * Why a change of a block is refused, or null (BR-S4, BR-S6): a block of a finished work order
 * is history, and an appointment keeps its day, person and length until it is unlocked.
 * @param {{ locked_start: string | null, day: string, technician_id: number, hours: number }} block
 * @param {{ status: string } | null} workOrder the block's work order, if any
 * @param {{ day?: string, technician_id?: number, hours?: number } | 'DELETE'} change
 * @returns {{ rule: string, message: string } | null}
 */
export function blockChangeBlocker(block, workOrder, change) {
  if (workOrder && TERMINAL_WORK_ORDER_STATUSES.includes(workOrder.status)) {
    return {
      rule: 'BR-S4',
      message: 'This work order is finished: its blocks are kept as history.',
    };
  }
  if (!block.locked_start) return null;
  const moves =
    change === 'DELETE' ||
    ['day', 'technician_id', 'hours'].some((k) => k in change && change[k] !== block[k]);
  return moves
    ? {
        rule: 'BR-S6',
        message: `This appointment is locked at ${block.locked_start}: unlock it before moving, resizing or removing it.`,
      }
    : null;
}

/**
 * Group of a work order in a week's "to schedule" tray (spec §8, BR-S9), or null when it
 * belongs to a later week:
 * - PLANNED: planned in this week;
 * - CARRIED_OVER: planned in an earlier week and not finished;
 * - NOT_PLANNED: open work without a week (corrective work, approved requests).
 * @param {string | null} plannedWeek
 * @param {string} week
 */
export function trayGroup(plannedWeek, week) {
  if (plannedWeek === null || plannedWeek === undefined) return 'NOT_PLANNED';
  if (plannedWeek === week) return 'PLANNED';
  return plannedWeek < week ? 'CARRIED_OVER' : null;
}

/** Tray groups in display order. */
export const TRAY_GROUPS = ['PLANNED', 'CARRIED_OVER', 'NOT_PLANNED'];

const average = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

/**
 * Tiles of the week scheduler (spec §8).
 * @param {{ days: { total: number, capacity: number, sites: string[] }[] }[]} people
 * @param {{ kind: string, hours: number }[]} blocks blocks of the week
 * @param {{ group: string, hours_left: number | null }[]} tray
 */
export function scheduleTiles(people, blocks, tray) {
  const booked = blocks.reduce((sum, b) => sum + b.hours, 0);
  const travel = blocks.filter((b) => b.kind === 'TRAVEL').reduce((sum, b) => sum + b.hours, 0);
  const days = people.flatMap((p) => p.days).filter((d) => d.sites.length > 0);
  const sites = days.map((d) => d.sites.length);
  const leftIn = (group) =>
    tray.filter((t) => t.group === group).reduce((sum, t) => sum + (t.hours_left ?? 0), 0);
  return {
    booked_hours: booked,
    available_hours: people.reduce((sum, p) => sum + p.days.reduce((s, d) => s + d.capacity, 0), 0),
    hours_left: {
      planned: leftIn('PLANNED'),
      carried_over: leftIn('CARRIED_OVER'),
      not_planned: leftIn('NOT_PLANNED'),
    },
    travel_share: booked > 0 ? travel / booked : null,
    sites_per_day: { average: average(sites), worst: Math.max(0, ...sites) },
    carried_over: tray.filter((t) => t.group === 'CARRIED_OVER').length,
  };
}

/**
 * Order of the blocks of a day: appointments by start time first, then the others in the
 * person's own order (position, then creation). `workFirst` (the scheduler's grid) puts work
 * blocks before travel, preparation and other time (spec §8); My week keeps the person's
 * order (spec §9).
 */
export function compareBlocks(a, b, { workFirst = false } = {}) {
  if (Boolean(a.locked_start) !== Boolean(b.locked_start)) return a.locked_start ? -1 : 1;
  if (a.locked_start && a.locked_start !== b.locked_start) {
    return a.locked_start < b.locked_start ? -1 : 1;
  }
  if (workFirst && (a.kind === 'WORK') !== (b.kind === 'WORK')) return a.kind === 'WORK' ? -1 : 1;
  return (a.position ?? Infinity) - (b.position ?? Infinity) || a.id - b.id;
}
