// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// "Scheduled" section of a work order panel (M10): the days, hours and appointments of its
// blocks from today on. Read from the server; offline, from the weeks of My week saved on the
// device.
import { apiFetch } from './api.js';
import { h, replaceChildren } from './dom.js';
import { personName } from './format.js';
import { savedBlocksOf } from './my-week.js';
import { dayLabel } from './schedule.js';
import { appointmentText, formatDuration } from './schedule-rules.js';

/**
 * One line per block from `today` on: 'Thu 8 Oct · 2 h · appointment 10:00–12:00 · you'. Pure.
 * @param {{ day: string, hours: number, locked_start: string | null, technician_id: number,
 *   technician?: { first_name: string, last_name: string } | null }[]} blocks
 * @param {number} userId the reader
 * @param {string} today 'YYYY-MM-DD'
 * @returns {string[]}
 */
export function scheduledTexts(blocks, userId, today) {
  return blocks
    .filter((b) => b.day >= today)
    .map((b) =>
      [
        dayLabel(b.day),
        formatDuration(b.hours),
        b.locked_start ? `appointment ${appointmentText(b.locked_start, b.hours)}` : null,
        b.technician_id === userId ? 'you' : b.technician ? personName(b.technician) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
}

/**
 * The section, hidden until blocks are found (a work order nobody scheduled shows nothing).
 * @param {number} workOrderId
 * @param {{ id: number }} user
 * @param {string} today
 */
export function scheduledSection(workOrderId, user, today) {
  const list = h('ul', { class: 'scheduled-list' });
  const section = h(
    'section',
    { class: 'detail-scheduled', 'aria-labelledby': 'scheduled-heading', hidden: true },
    h('h3', { id: 'scheduled-heading' }, 'Scheduled'),
    list,
  );
  (async () => {
    let blocks;
    try {
      blocks = (await apiFetch(`/schedule/work-orders/${workOrderId}`)).items;
    } catch (err) {
      if (err.status !== 0) return;
      blocks = await savedBlocksOf(workOrderId);
    }
    const texts = scheduledTexts(blocks, user.id, today);
    if (!texts.length) return;
    replaceChildren(
      list,
      texts.map((text) => h('li', {}, text)),
    );
    section.hidden = false;
  })().catch(() => {});
  return section;
}
