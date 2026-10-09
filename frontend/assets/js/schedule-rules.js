// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Week scheduler rules the interface needs before asking the server (D48, Phase 19): the split
// proposal of a long job (BR-S1), hours left (BR-S2), durations and warnings as text. The
// server stays the authority: it checks every block again.

/** Hours rounded up to the next half hour (P4). Pure. */
export function roundUpToHalfHour(hours) {
  return Math.ceil(hours * 2 - 1e-9) / 2;
}

/**
 * Blocks proposed for `hours` of work dropped on `day` (BR-S1, P8): blocks of at most
 * `maxBlock`, one per day from the day of the drop over the next days shown ("3 h 30 today +
 * 2 h 30 tomorrow"); when the week runs out, the rest stays on its last day. Pure.
 * @param {number} hours
 * @param {string} day 'YYYY-MM-DD'
 * @param {string[]} days days shown, in order
 * @param {number} maxBlock
 * @returns {{ day: string, hours: number }[]}
 */
export function splitProposal(hours, day, days, maxBlock) {
  const blocks = [];
  let left = roundUpToHalfHour(hours);
  let index = Math.max(0, days.indexOf(day));
  while (left > 0) {
    const size = Math.min(maxBlock, left);
    blocks.push({ day: days[index] ?? day, hours: size });
    left -= size;
    if (index < days.length - 1) index += 1;
  }
  return blocks;
}

/**
 * Hours to give when a tray card is dropped: what is left, or one block when nothing is left
 * (a carried-over job gets more time). Null without an estimate (BR-S2: ask for one). Pure.
 */
export function hoursToSchedule(item, maxBlock) {
  if (item.needed_hours === null) return null;
  return item.hours_left > 0 ? item.hours_left : Math.min(maxBlock, item.needed_hours);
}

/** '0 h', '30 min', '1 h', '3 h 30', '8 h 30'. Pure. */
export function formatDuration(hours) {
  if (hours <= 0) return '0 h';
  const whole = Math.floor(hours + 1e-9);
  const minutes = Math.round((hours - whole) * 60);
  if (!whole) return `${minutes} min`;
  return minutes ? `${whole} h ${String(minutes).padStart(2, '0')}` : `${whole} h`;
}

/** What a tray card says about its hours (BR-S2). Pure. */
export function leftText(item) {
  if (item.needed_hours === null) return 'No estimate yet';
  if (item.hours_left > 0) return `${formatDuration(item.hours_left)} left`;
  return 'Fully scheduled';
}

/** Warnings of a day as text (BR-S5, BR-S8, BR-S10), never color alone. Pure. */
export function dayWarningTexts(day) {
  const texts = {
    OVER_CAPACITY: `Over capacity: ${formatDuration(day.total)} / ${formatDuration(day.capacity)}`,
    ABSENT: 'Work on a day off',
    WEEKEND_CLOSED: 'Weekend day not open',
    SEVERAL_SITES: `${day.sites.length} sites: add travel time`,
  };
  return day.warnings.map((w) => texts[w]);
}

/** '10:00–12:00' for an appointment. Pure. */
export function appointmentText(start, hours) {
  const end = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + hours * 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${start}–${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}

/** Start times offered for an appointment of `hours`: half hours from 06:00, ending by 22:00. Pure. */
export function lockTimes(hours) {
  const times = [];
  for (let m = 6 * 60; m + hours * 60 <= 22 * 60; m += 30) {
    times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`);
  }
  return times;
}

/** Half-hour lengths from 0.5 to `max`. Pure. */
export function blockLengths(max) {
  return Array.from({ length: Math.round(max * 2) }, (_, i) => (i + 1) / 2);
}

/**
 * New order of a day's blocks after moving one up or down (My week, BR-S7). Appointments keep
 * their place at the top: only the other blocks move among themselves. Null when the block
 * cannot move that way. Pure.
 * @param {{ id: number, locked_start: string | null }[]} blocks in their current order
 * @param {number} id
 * @param {-1 | 1} direction
 * @returns {number[] | null}
 */
export function reorder(blocks, id, direction) {
  const free = blocks.filter((b) => !b.locked_start);
  const index = free.findIndex((b) => b.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= free.length) return null;
  const moved = [...free];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return [...blocks.filter((b) => b.locked_start), ...moved].map((b) => b.id);
}
