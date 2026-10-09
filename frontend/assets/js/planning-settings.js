// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Planning settings (P16, `/admin/planning`, administrators, online only): corrective reserve,
// daily capacity, release horizon and longest block. The form shows the effect on the
// capacity before saving.
import { formRow } from './admin-users.js';
import { h, replaceChildren } from './dom.js';
import { formatDateTime, personName } from './format.js';

/** Working days a week counted in the capacity (BR-Y2). */
const WORKING_DAYS = 5;
const WEEKS = 52;
const hoursFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/**
 * Capacity of the next 52 weeks for some settings (BR-Y2): every person counted works the
 * daily hours 5 days a week, minus the reserve. Pure.
 */
export function yearCapacity({ daily_hours: daily, reserve_percent: reserve }, people) {
  return people * daily * WORKING_DAYS * (1 - reserve / 100) * WEEKS;
}

/** "Capacity of the next 52 weeks: 5,096 h → 5,824 h", or null when unchanged. Pure. */
export function capacityPreview(current, next, people) {
  const before = yearCapacity(current, people);
  const after = yearCapacity(next, people);
  if (!Number.isFinite(after) || Math.abs(after - before) < 0.05) return null;
  return `Capacity of the next ${WEEKS} weeks: ${hoursFormat.format(before)} h → ${hoursFormat.format(after)} h`;
}

/** Form values → API body: only the fields that changed, with the version. Pure. */
export function settingsChanges(current, raw) {
  const body = {};
  for (const key of ['reserve_percent', 'daily_hours', 'release_weeks_ahead', 'max_block_hours']) {
    const value = Number(raw[key]);
    if (raw[key] !== '' && value !== current[key]) body[key] = value;
  }
  return Object.keys(body).length ? { ...body, version: current.version } : null;
}

/**
 * @param {HTMLElement} container
 * @param {{ settings: object, onSave: (body: object, form: HTMLFormElement) => void }} options
 */
export function renderPlanningSettings(container, { settings, onSave }) {
  const number = (name, attrs) =>
    h('input', {
      name,
      type: 'number',
      value: String(settings[name]),
      inputmode: 'decimal',
      ...attrs,
    });
  const preview = h('p', { class: 'settings-preview', 'aria-live': 'polite' });
  const form = h(
    'form',
    {
      class: 'detail-form settings-form',
      novalidate: true,
      onInput: () => {
        const raw = Object.fromEntries(new FormData(form));
        const next = { ...settings, ...settingsChanges(settings, raw) };
        preview.textContent =
          capacityPreview(settings, next, settings.capacity_people) ??
          `Capacity of the next ${WEEKS} weeks: ${hoursFormat.format(yearCapacity(settings, settings.capacity_people))} h`;
      },
      onSubmit: (event) => {
        event.preventDefault();
        onSave(settingsChanges(settings, Object.fromEntries(new FormData(form))), form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    formRow(
      's-reserve_percent',
      'Corrective reserve (%)',
      number('reserve_percent', { min: '0', max: '80', step: '1' }),
      {
        hint: 'Share of each week kept free for breakdowns and staff requests (0 to 80).',
      },
    ),
    formRow(
      's-daily_hours',
      'Daily capacity (hours)',
      number('daily_hours', { min: '0.5', max: '12', step: '0.5' }),
      {
        hint: 'Hours each technician and supervisor works on a working day.',
      },
    ),
    formRow(
      's-release_weeks_ahead',
      'Release horizon (weeks)',
      number('release_weeks_ahead', { min: '1', max: '12', step: '1' }),
      { hint: 'Work orders of plan visits are created this many weeks ahead.' },
    ),
    formRow(
      's-max_block_hours',
      'Longest block (hours)',
      number('max_block_hours', { min: '0.5', max: '8', step: '0.5' }),
      {
        hint: 'Longer visits are flagged in the year planner: they will be split.',
      },
    ),
    preview,
    h(
      'p',
      { class: 'muted' },
      `${settings.capacity_people} technicians and supervisors count as capacity.`,
      settings.updated_by
        ? ` Last changed by ${personName(settings.updated_by)} on ${formatDateTime(settings.updated_at)}.`
        : '',
    ),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'submit', class: 'button button-primary online-only' }, 'Save settings'),
    ),
  );
  replaceChildren(
    container,
    h(
      'div',
      { class: 'settings-page' },
      h('h2', { class: 'placeholder-title', tabindex: '-1' }, 'Planning settings'),
      h(
        'p',
        {},
        'These settings apply at once to every figure of the year planner. Each change is recorded in the audit log.',
      ),
      form,
    ),
  );
  form.dispatchEvent(new Event('input'));
}
