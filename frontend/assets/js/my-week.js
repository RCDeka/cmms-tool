// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// My week (D48, Phase 19, spec §9): a technician's (or supervisor's) own days, appointments
// first, then their blocks in their own order. They reorder their day and lock or unlock a
// time on their own blocks (BR-S7). The week is saved on the device and readable offline
// (P18); changes need a connection.
import * as DB from './db.js';
import { storesOf } from './db.js';
import { h, pageMessage, replaceChildren } from './dom.js';
import { badge, formatDateTime, formatWeek, personName } from './format.js';
import { valueLabel } from './labels.js';
import { addWeeks } from './planning-rules.js';
import { longDayLabel, myWeekUrl } from './schedule.js';
import {
  appointmentText,
  dayWarningTexts,
  formatDuration,
  lockTimes,
  reorder,
} from './schedule-rules.js';
import { t } from './i18n.js';

/** Config key of the weeks saved on the device. */
export const MY_WEEK_CACHE = 'my_week';
/** Weeks kept on the device: the most recent ones fetched. */
const KEPT_WEEKS = 4;

/**
 * Saves a week on the device, with its work orders (so they open offline too), keeping the
 * last weeks fetched only.
 * @param {object} data GET /api/my-week answer
 */
export async function saveMyWeek(data) {
  const saved = (await DB.getConfig(MY_WEEK_CACHE)) ?? {};
  const weeks = { ...saved, [data.week]: data };
  const kept = Object.keys(weeks)
    .sort((a, b) => weeks[b].generated_at.localeCompare(weeks[a].generated_at))
    .slice(0, KEPT_WEEKS);
  await DB.setConfig(MY_WEEK_CACHE, Object.fromEntries(kept.map((w) => [w, weeks[w]])));
  if (data.work_orders.length) {
    await DB.saveRecords(
      storesOf('work_orders').records,
      data.work_orders.map((w) => ({ ...w, _fetched_at: data.generated_at })),
    );
  }
}

/** A week saved on the device, or null. `week` null: the current week of the last fetch. */
export async function readMyWeek(week) {
  const saved = (await DB.getConfig(MY_WEEK_CACHE)) ?? {};
  if (week) return saved[week] ?? null;
  const latest = Object.values(saved).sort((a, b) =>
    b.generated_at.localeCompare(a.generated_at),
  )[0];
  return latest ? (saved[latest.current_week] ?? null) : null;
}

/** Blocks of a work order in the weeks saved on the device (the user's own). */
export async function savedBlocksOf(workOrderId) {
  const saved = (await DB.getConfig(MY_WEEK_CACHE)) ?? {};
  return Object.values(saved)
    .flatMap((w) => w.days.flatMap((d) => d.blocks.map((b) => ({ ...b, technician: w.user }))))
    .filter((b) => b.work_order_id === workOrderId)
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Work orders of the weeks saved on the device: never evicted from the cache. */
export async function myWeekWorkOrderIds() {
  const saved = (await DB.getConfig(MY_WEEK_CACHE)) ?? {};
  return Object.values(saved).flatMap((w) => w.work_orders.map((o) => o.id));
}

/** Buttons of a block, behind "Change…" so the job stays readable (M4). */
function blockActions(block, day, { onMove, onLock, canChange }) {
  const wo = block.work_order;
  const free = day.blocks.filter((b) => !b.locked_start);
  const index = free.indexOf(block);
  const moveButton = (direction, text) =>
    h(
      'button',
      {
        type: 'button',
        class: 'button button-secondary online-only',
        disabled: !canChange || index === -1 || !reorder(day.blocks, block.id, direction),
        'aria-label': t('{label}: {value}', {
          label: text,
          value: block.kind === 'WORK' ? wo.number : valueLabel('allocation_kind', block.kind),
        }),
        onClick: () => onMove(day, block, direction),
      },
      text,
    );
  const time = h(
    'select',
    {
      'aria-label': wo?.number
        ? t('Start time of {number}', { number: wo.number })
        : t('Start time of this block'),
      class: 'online-only',
    },
    lockTimes(block.hours).map((time) =>
      h('option', { value: time, selected: time === '09:00' }, time),
    ),
  );
  return h(
    'details',
    { class: 'my-block-change' },
    h(
      'summary',
      { class: 'button button-secondary' },
      t('Change…'),
      h(
        'span',
        { class: 'visually-hidden' },
        ` ${block.kind === 'WORK' ? wo.number : valueLabel('allocation_kind', block.kind)}`,
      ),
    ),
    h(
      'div',
      { class: 'my-block-actions' },
      block.locked_start ? null : [moveButton(-1, t('Move up')), moveButton(1, t('Move down'))],
      block.kind === 'WORK'
        ? block.locked_start
          ? h(
              'button',
              {
                type: 'button',
                class: 'button button-secondary online-only',
                disabled: !canChange,
                onClick: () => onLock(block, null),
              },
              t('Unlock the time'),
            )
          : [
              time,
              h(
                'button',
                {
                  type: 'button',
                  class: 'button button-secondary online-only',
                  disabled: !canChange,
                  onClick: () => onLock(block, time.value),
                },
                t('Lock at this time'),
              ),
            ]
        : null,
    ),
  );
}

function blockCard(block, day, { past, ...options }) {
  const wo = block.work_order;
  const title =
    block.kind === 'WORK'
      ? h('a', { href: `/work-orders/${wo.id}`, 'data-link': true }, `${wo.number} — ${wo.title}`)
      : h('strong', {}, valueLabel('allocation_kind', block.kind));
  const where = wo ? [wo.site, wo.place, wo.location].filter(Boolean).join(' · ') : null;
  return h(
    'li',
    {
      class: `my-block block-${block.kind.toLowerCase()}${block.locked_start ? ' is-locked' : ''}`,
      tabindex: '-1',
      dataset: { block: String(block.id) },
    },
    block.locked_start
      ? h(
          'p',
          { class: 'block-lock' },
          t('🔒 {appointmentText} · locked by {locked_by}', {
            appointmentText: appointmentText(block.locked_start, block.hours),
            locked_by: personName(block.locked_by),
          }),
        )
      : null,
    h('p', { class: 'my-block-title' }, title),
    // Status and priority of the job (M5).
    wo
      ? h(
          'p',
          { class: 'my-block-badges' },
          badge('status', 'work_order_status', wo.status),
          ' ',
          badge('priority', 'work_order_priority', wo.priority),
        )
      : null,
    h(
      'p',
      { class: 'block-meta' },
      [formatDuration(block.hours), where].filter(Boolean).join(' · '),
    ),
    block.note ? h('p', { class: 'block-note' }, block.note) : null,
    // Days gone by are history: nothing to change (M4).
    past ? null : blockActions(block, day, options),
  );
}

/**
 * Renders My week. Today is marked (M3); days before it show no buttons (M4).
 * @param {HTMLElement} container
 * @param {{ data: object, today: string, savedOffline: boolean, canChange: boolean,
 *   canAddTravel?: boolean,
 *   onMove: (day: object, block: object, direction: -1 | 1) => void,
 *   onLock: (block: object, start: string | null) => void }} options
 * @returns {{ say: (text: string, tone?: string) => void, todaySection: HTMLElement | null }}
 */
export function renderMyWeek(
  container,
  { data, today, savedOffline, canChange, canAddTravel = false, onMove, onLock },
) {
  const { element: message, say } = pageMessage();
  const link = (week, text, label) =>
    h(
      'a',
      {
        href: myWeekUrl(week === data.current_week ? null : week),
        'data-link': true,
        class: 'button button-secondary',
        'aria-label': label,
      },
      text,
    );
  const days = data.days.map((day) =>
    h(
      'section',
      {
        class: `my-day${day.day === today ? ' is-today' : ''}${day.day < today ? ' is-past' : ''}`,
        'aria-labelledby': `my-day-${day.day}`,
      },
      h(
        'h2',
        { id: `my-day-${day.day}`, tabindex: '-1' },
        longDayLabel(day.day),
        day.override ? ` · ${valueLabel('capacity_reason', day.override.reason)}` : '',
        day.day === today ? [' ', h('span', { class: 'badge badge-tone-info' }, t('Today'))] : null,
      ),
      h(
        'p',
        { class: `my-day-total${day.warnings.includes('OVER_CAPACITY') ? ' is-over' : ''}` },
        `${formatDuration(day.total)} / ${formatDuration(day.capacity)}`,
        day.sites.length ? ` · ${day.sites.join(' · ')}` : '',
      ),
      day.warnings.length
        ? h(
            'ul',
            { class: 'cell-warnings' },
            dayWarningTexts(day, { canAddTravel }).map((text) =>
              h('li', {}, h('span', { 'aria-hidden': 'true' }, '⚠ '), text),
            ),
          )
        : null,
      day.blocks.length
        ? h(
            'ol',
            { class: 'my-blocks' },
            day.blocks.map((b) =>
              blockCard(b, day, { onMove, onLock, canChange, past: day.day < today }),
            ),
          )
        : h('p', { class: 'muted' }, t('Nothing scheduled.')),
    ),
  );
  replaceChildren(
    container,
    h(
      'div',
      { class: 'my-week' },
      h(
        'div',
        { class: 'schedule-toolbar' },
        h(
          'div',
          { class: 'schedule-weeks' },
          link(addWeeks(data.week, -1), t('← Previous'), t('Previous week')),
          h('strong', { class: 'schedule-week-name' }, formatWeek(data.week)),
          link(addWeeks(data.week, 1), t('Next →'), t('Next week')),
          data.week === data.current_week
            ? null
            : link(data.current_week, t('This week'), t('Back to this week')),
        ),
        h(
          'p',
          { class: 'muted' },
          t(
            '{week_total} scheduled of {week_capacity}. Appointments come first; order the rest of each day as you like.',
            {
              week_total: formatDuration(data.week_total),
              week_capacity: formatDuration(data.week_capacity),
            },
          ),
        ),
        savedOffline
          ? h(
              'p',
              { class: 'banner banner-info', role: 'note' },
              t(
                'Offline: your week as saved on this device on {generated_at}. Changes need a connection.',
                { generated_at: formatDateTime(data.generated_at) },
              ),
            )
          : null,
        message,
      ),
      days,
    ),
  );
  return {
    say,
    todaySection: days.find((section) => section.classList.contains('is-today')) ?? null,
  };
}
