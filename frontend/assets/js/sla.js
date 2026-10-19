// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Service levels (D86, D88, docs/data-model.md → BR-SLA1 to BR-SLA5): the deadlines of a work
// order in its panel and in the lists, and the page "Service levels" (`/admin/sla`, read by
// supervisors, edited by administrators, online only). The server computes the deadlines;
// the client only compares them with the time now, as the `sla` filter does.
import { formRow } from './admin-users.js';
import { badgeClass, h, replaceChildren } from './dom.js';
import { SLA_HOURS_MODES, SLA_RESPONSE_STOPS, UNFINISHED_WORK_ORDER_STATUSES } from './enums.js';
import { formatDate, formatDateTime, formatHoursValue, personName } from './format.js';
import { locale, t } from './i18n.js';
import { valueLabel } from './labels.js';

const STATE_LABELS = {
  met: t('Met'),
  missed: t('Missed'),
  late: t('Late'),
  at_risk: t('At risk'),
  paused: t('Paused'),
  running: t('Running'),
};
const STATE_TONES = {
  met: 'success',
  missed: 'danger',
  late: 'danger',
  at_risk: 'warning',
  paused: 'info',
  running: 'neutral',
};

/**
 * State of one clock (BR-SLA2, BR-SLA4): `met` or `missed` once it stopped; while it runs,
 * `late` past its deadline (while paused, only if the deadline passed before the pause),
 * `paused`, `at_risk` past 75 % of its target, else `running`; null without a target, or for
 * a work order finished or cancelled before the clock stopped. Pure.
 * @param {{ due_at: string | null, risk_at: string | null, at: string | null }} clock
 * @param {{ status: string, sla: { paused: boolean, paused_at: string | null } }} wo
 * @param {string} now ISO datetime
 */
export function clockState(clock, wo, now) {
  if (!clock?.due_at || wo.status === 'CANCELLED') return null;
  if (clock.at) return clock.at <= clock.due_at ? 'met' : 'missed';
  if (!UNFINISHED_WORK_ORDER_STATUSES.includes(wo.status)) return null;
  if (clock.due_at < (wo.sla.paused_at ?? now)) return 'late';
  if (wo.sla.paused) return 'paused';
  if (clock.risk_at && clock.risk_at <= now) return 'at_risk';
  return 'running';
}

/**
 * The flag of a work order in the lists, as the `sla` filter of the server: `late` when a
 * clock missed or is past its deadline, `at_risk` when one is past 75 % of its target. Pure.
 * @returns {'late' | 'at_risk' | null}
 */
export function slaFlag(wo, now) {
  if (!wo.sla) return null;
  const states = [wo.sla.response, wo.sla.resolution].map((c) => clockState(c, wo, now));
  if (states.some((s) => s === 'missed' || s === 'late')) return 'late';
  return states.includes('at_risk') ? 'at_risk' : null;
}

/** The SLA badge of a list row, or null. */
export function slaBadge(wo, now = new Date().toISOString()) {
  const flag = slaFlag(wo, now);
  if (!flag) return null;
  return h(
    'span',
    { class: badgeClass('sla', flag, STATE_TONES[flag]) },
    flag === 'late' ? t('SLA missed') : t('SLA at risk'),
  );
}

/** One line of the SLA area: the state of a clock, then its moments. */
function clockLine(label, clock, wo, now) {
  const state = clockState(clock, wo, now);
  let text;
  if (!clock.due_at) text = t('No target for this priority.');
  else if (clock.at) {
    text = t('{at}, due {due}', {
      at: formatDateTime(clock.at),
      due: formatDateTime(clock.due_at),
    });
  } else text = t('Due {due}', { due: formatDateTime(clock.due_at) });
  return [
    h('dt', {}, label),
    h(
      'dd',
      {},
      state
        ? h('span', { class: badgeClass('sla', state, STATE_TONES[state]) }, STATE_LABELS[state])
        : null,
      state ? ' ' : null,
      text,
    ),
  ];
}

/**
 * SLA area of the work order panel (D86 section 7): the response and resolution deadlines,
 * met or late, and "paused" during a hold waiting for access or approval. Null outside the
 * SLA (BR-SLA1) and for a cancelled work order, which counts in neither (BR-SLA2).
 * @param {object} wo
 * @param {string} [now]
 */
export function slaArea(wo, now = new Date().toISOString()) {
  if (!wo.sla || wo.status === 'CANCELLED') return null;
  return h(
    'section',
    { class: 'sla-area', 'aria-labelledby': 'sla-area-title' },
    h('h3', { id: 'sla-area-title', class: 'sla-area-title' }, t('Service level')),
    h(
      'dl',
      { class: 'sla-clocks' },
      clockLine(t('Response'), wo.sla.response, wo, now),
      clockLine(t('Resolution'), wo.sla.resolution, wo, now),
    ),
    wo.sla.paused
      ? h(
          'p',
          { class: 'muted' },
          t('The clocks stop while the work waits for access or an approval.'),
        )
      : null,
  );
}

// --- History (audit log entries of the settings) -------------------------------------------

const PRIORITIES_DOWN = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

/** Labels of the audited fields of the service levels (the targets per priority included). */
export const SLA_FIELD_LABELS = {
  response_stop: t('Response stops at'),
  hours_mode: t('SLA hours'),
  business_days: t('Business days'),
  business_start: t('Opening'),
  business_end: t('Closing'),
  holiday: t('Holiday'),
  ...Object.fromEntries(
    PRIORITIES_DOWN.flatMap((p) => [
      [
        `${p}.response_hours`,
        t('Response target, {priority}', { priority: valueLabel('work_order_priority', p) }),
      ],
      [
        `${p}.resolution_hours`,
        t('Resolution target, {priority}', { priority: valueLabel('work_order_priority', p) }),
      ],
    ]),
  ),
};

/** Names of the ISO weekdays (1 Monday … 7 Sunday) in the interface language. */
function weekdayNames(style = 'long') {
  const format = new Intl.DateTimeFormat(locale(), { weekday: style, timeZone: 'UTC' });
  // 5 October 2026 is a Monday.
  return [1, 2, 3, 4, 5, 6, 7].map((d) => format.format(new Date(Date.UTC(2026, 9, 4 + d))));
}

/** Value of an audited field of the service levels, as text. Pure. */
export function slaFieldValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return h(
      'span',
      { class: 'no-value' },
      field.endsWith('_hours') ? t('No target') : t('No value'),
    );
  }
  if (field === 'response_stop') return valueLabel('sla_response_stop', value);
  if (field === 'hours_mode') return valueLabel('sla_hours_mode', value);
  if (field === 'business_days') {
    const names = weekdayNames('short');
    return String(value)
      .split(',')
      .map((d) => names[Number(d) - 1])
      .join(', ');
  }
  if (field === 'holiday') return formatDate(value);
  if (field.endsWith('_hours')) return formatHoursValue(value);
  return String(value);
}

// --- The page "Service levels" -------------------------------------------------------------

const hoursValue = (value) => (value === null ? '' : String(value));

/**
 * Form values → `PUT /api/sla` body: only what changed, with the version; null when nothing
 * did. Empty hours mean no target. Pure.
 * @param {object} current GET /api/sla
 * @param {Record<string, string | string[]>} raw form values; `business_days` the checked days
 */
export function slaChanges(current, raw) {
  const body = {};
  const targets = current.targets
    .map((target) => {
      const read = (key) => {
        const text = String(raw[`${target.priority}.${key}`] ?? '').trim();
        return text === '' ? null : Number(text.replace(',', '.'));
      };
      return {
        priority: target.priority,
        response_hours: read('response_hours'),
        resolution_hours: read('resolution_hours'),
      };
    })
    .filter((next, i) =>
      ['response_hours', 'resolution_hours'].some((key) => next[key] !== current.targets[i][key]),
    );
  if (targets.length) body.targets = targets;
  for (const key of ['response_stop', 'hours_mode', 'business_start', 'business_end']) {
    if (raw[key] !== undefined && raw[key] !== current[key]) body[key] = raw[key];
  }
  const days = (raw.business_days ?? []).map(Number).sort((a, b) => a - b);
  if (days.join() !== current.business_days.join()) body.business_days = days;
  return Object.keys(body).length ? { ...body, version: current.version } : null;
}

/**
 * Server field errors of a PUT (`targets.0.resolution_hours`) → the names of the form
 * (`HIGH.resolution_hours`), given the targets sent. Pure.
 */
export function slaFieldErrors(fields, sentTargets = []) {
  const out = {};
  for (const [key, message] of Object.entries(fields ?? {})) {
    const match = /^targets\.(\d+)\.(\w+)$/.exec(key);
    const target = match && sentTargets[Number(match[1])];
    out[target ? `${target.priority}.${match[2]}` : key] = message;
  }
  return out;
}

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {object} options.sla GET /api/sla
 * @param {boolean} options.canEdit administrators
 * @param {(body: object | null, form: HTMLFormElement) => void} options.onSave
 * @param {(body: { day: string, name: string }, form: HTMLFormElement) => void} options.onAddHoliday
 * @param {(holiday: { id: number, day: string, name: string }) => void} options.onRemoveHoliday
 */
export function renderSlaSettings(
  container,
  { sla, canEdit, onSave, onAddHoliday, onRemoveHoliday },
) {
  const hoursInput = (target, key, label) =>
    h('input', {
      name: `${target.priority}.${key}`,
      id: `sla-${target.priority}-${key}`,
      type: 'number',
      min: '0.5',
      max: '10000',
      step: '0.5',
      inputmode: 'decimal',
      value: hoursValue(target[key]),
      'aria-label': label,
      'aria-describedby': `sla-${target.priority}-${key}-error`,
    });
  const targetRows = sla.targets.map((target) => {
    const priority = valueLabel('work_order_priority', target.priority);
    const cell = (key, label) =>
      h(
        'td',
        {},
        hoursInput(target, key, label),
        h('p', { id: `sla-${target.priority}-${key}-error`, class: 'field-error' }),
      );
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, priority),
      cell('response_hours', t('Response target, {priority}', { priority })),
      cell('resolution_hours', t('Resolution target, {priority}', { priority })),
    );
  });
  const choice = (name, codes, enumName) => {
    const el = h(
      'select',
      { name },
      codes.map((code) => h('option', { value: code }, valueLabel(enumName, code))),
    );
    el.value = sla[name];
    return el;
  };
  const names = weekdayNames();
  const days = h(
    'fieldset',
    { class: 'sla-days' },
    h('legend', {}, t('Business days')),
    names.map((name, i) =>
      h(
        'label',
        {},
        h('input', {
          type: 'checkbox',
          class: 'checkbox',
          name: 'business_days',
          // The first one carries the error line of the group (showErrors).
          id: i === 0 ? 'sla-business_days' : null,
          value: String(i + 1),
          checked: sla.business_days.includes(i + 1),
        }),
        ` ${name}`,
      ),
    ),
    h('p', { id: 'sla-business_days-error', class: 'field-error' }),
  );
  const time = (name) => h('input', { name, type: 'time', value: sla[name], step: '60' });

  const form = h(
    'form',
    {
      class: 'detail-form settings-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const raw = Object.fromEntries(data);
        raw.business_days = data.getAll('business_days');
        onSave(slaChanges(sla, raw), form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h(
      'fieldset',
      { disabled: !canEdit },
      h(
        'table',
        { class: 'sla-targets' },
        h('caption', {}, t('Targets in hours (empty: no target)')),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, t('Priority')),
            h('th', { scope: 'col' }, t('Response')),
            h('th', { scope: 'col' }, t('Resolution')),
          ),
        ),
        h('tbody', {}, targetRows),
      ),
      formRow(
        'sla-response_stop',
        t('Response stops at'),
        choice('response_stop', SLA_RESPONSE_STOPS, 'sla_response_stop'),
        {
          hint: t('The first start of the work, or its first assignment to someone.'),
        },
      ),
      formRow(
        'sla-hours_mode',
        t('SLA hours'),
        choice('hours_mode', SLA_HOURS_MODES, 'sla_hours_mode'),
        {
          hint: t(
            'Business hours count the business days and opening hours below, without the holidays.',
          ),
        },
      ),
      days,
      formRow('sla-business_start', t('Opening'), time('business_start')),
      formRow('sla-business_end', t('Closing'), time('business_end')),
    ),
    h(
      'p',
      { class: 'muted' },
      t('Corrective work and staff requests reported since {date} are measured.', {
        date: formatDate(sla.measured_from.slice(0, 10)),
      }),
      sla.updated_by
        ? t(' Last changed by {updated_by} on {updated_at}.', {
            updated_by: personName(sla.updated_by),
            updated_at: formatDateTime(sla.updated_at),
          })
        : '',
    ),
    canEdit
      ? h(
          'div',
          { class: 'form-actions' },
          h(
            'button',
            { type: 'submit', class: 'button button-primary online-only' },
            t('Save service levels'),
          ),
        )
      : null,
  );

  const holidayForm = h(
    'form',
    {
      class: 'detail-form sla-holiday-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const raw = Object.fromEntries(new FormData(holidayForm));
        onAddHoliday({ day: raw.day, name: String(raw.name ?? '').trim() }, holidayForm);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    formRow('sla-holiday-day', t('Day'), h('input', { name: 'day', type: 'date' }), {
      required: true,
    }),
    formRow(
      'sla-holiday-name',
      t('Name'),
      h('input', { name: 'name', type: 'text', maxlength: '100' }),
      { required: true },
    ),
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        { type: 'submit', class: 'button button-secondary online-only' },
        t('Add holiday'),
      ),
    ),
  );
  const holidays = h(
    'section',
    { class: 'sla-holidays', 'aria-labelledby': 'sla-holidays-title' },
    h('h3', { id: 'sla-holidays-title' }, t('Holidays')),
    h('p', {}, t('Days without business hours, on every site. Used in business hours only.')),
    sla.holidays.length
      ? h(
          'ul',
          { class: 'sla-holiday-list' },
          sla.holidays.map((holiday) =>
            h(
              'li',
              {},
              h('span', {}, `${formatDate(holiday.day)} — ${holiday.name}`),
              canEdit
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'button button-secondary online-only',
                      dataset: { focus: `holiday-${holiday.id}` },
                      'aria-label': t('Remove the holiday {name} of {day}', {
                        name: holiday.name,
                        day: formatDate(holiday.day),
                      }),
                      onClick: () => onRemoveHoliday(holiday),
                    },
                    t('Remove'),
                  )
                : null,
            ),
          ),
        )
      : h('p', { class: 'muted' }, t('No holiday.')),
    canEdit ? holidayForm : null,
  );

  replaceChildren(
    container,
    h(
      'div',
      { class: 'settings-page' },
      h('h2', { class: 'placeholder-title', tabindex: '-1' }, t('Service levels')),
      h(
        'p',
        {},
        canEdit
          ? t(
              'Response and resolution targets of corrective work, per priority. A change recomputes the deadlines of the unfinished work orders and is recorded in the audit log.',
            )
          : t(
              'Response and resolution targets of corrective work, per priority. Only administrators can change them.',
            ),
      ),
      form,
      holidays,
    ),
  );
}
