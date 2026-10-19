// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Display formatting of field values, in the interface language (D85, docs/ui-guidelines.md).
import { badgeClass, h } from './dom.js';
import { valueLabel, valueTone } from './labels.js';
import { locale, t } from './i18n.js';

const dateFormat = new Intl.DateTimeFormat(locale(), {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFormat = new Intl.DateTimeFormat(locale(), {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const hoursFormat = new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 });

/** 3.5 → '3.5 h' ('3,5 h' in French). */
export function formatHoursValue(hours) {
  return `${hoursFormat.format(hours)} h`;
}

/** 'YYYY-MM-DD' → '4 Oct 2026'. Dates have no time zone, so they are read as UTC. */
export function formatDate(date) {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

/** ISO datetime → '4 Oct 2026, 14:05' in the browser's time zone. */
export function formatDateTime(iso) {
  return dateTimeFormat.format(new Date(iso));
}

/** ISO week '2026-W43' → 'Week 43, 2026'. */
export function formatWeek(week) {
  const [year, n] = week.split('-W');
  return t('Week {n}, {year}', { n: Number(n), year });
}

/** { first_name, last_name } → 'Julien Bernard'. */
export function personName(ref) {
  return `${ref.first_name} ${ref.last_name}`;
}

/** True when a value should not be displayed (brief: only non-empty fields are shown). */
export function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

/** Badge element for an enum value: text label + tone class. */
export function badge(field, enumName, code) {
  return h(
    'span',
    { class: badgeClass(field, code, valueTone(enumName, code)) },
    valueLabel(enumName, code),
  );
}

/**
 * Status of a work order in lists (D86): "Open · assigned" when an open one has an assignee
 * (there is no "Assigned" status), and the reason under "On hold".
 * @param {{ status: string, assignee_id?: number | null, hold_reason?: string | null }} wo
 */
export function workOrderStatus(wo) {
  const extra =
    wo.status === 'OPEN' && wo.assignee_id
      ? t('· assigned')
      : wo.status === 'ON_HOLD' && wo.hold_reason
        ? valueLabel('hold_reason', wo.hold_reason)
        : null;
  return [
    badge('status', 'work_order_status', wo.status),
    extra ? h('span', { class: 'status-detail' }, ' ', extra) : null,
  ];
}

/**
 * Display node or text for a field value, according to its definition (entities.js).
 * @param {string} field
 * @param {{ type?: string, enum?: string }} def
 * @param {unknown} value non-empty value
 */
export function renderValue(field, def, value) {
  switch (def.type) {
    case 'enum':
      return badge(field, def.enum, value);
    case 'date':
      return formatDate(value);
    case 'datetime':
      return formatDateTime(value);
    case 'boolean':
      return value ? t('Yes') : t('No');
    case 'hours':
      return formatHoursValue(value);
    case 'user':
      return personName(value);
    case 'week':
      return formatWeek(value);
    case 'plan':
      return h(
        'a',
        { href: `/planning/plans/${value.id}`, 'data-link': true },
        `${value.code} — ${value.title}`,
      );
    case 'asset':
      return h(
        'a',
        { href: `/assets/${value.id}`, 'data-link': true },
        `${value.code} — ${value.name}`,
      );
    default:
      return String(value);
  }
}
