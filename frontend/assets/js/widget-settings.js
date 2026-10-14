// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Dashboard widgets (`/admin/widgets`, administrators, online only, D65): each widget of the
// catalogue switched on or off for supervisors, to hide those still in development or not
// working. Administrators keep seeing every widget on their own dashboards.
import { h, replaceChildren } from './dom.js';
import { formatDateTime, personName } from './format.js';
import { WIDGETS, WIDGET_GROUPS } from './widgets.js';

/** "Switched off by Ada Admin on …", or null for a widget never switched. Pure. */
export function settingNote(item) {
  if (!item.updated_at) return null;
  const by = item.updated_by ? ` by ${personName(item.updated_by)}` : '';
  return `${item.enabled ? 'Switched on' : 'Switched off'}${by} on ${formatDateTime(item.updated_at)}.`;
}

/**
 * @param {HTMLElement} container
 * @param {{ items: { key: string, enabled: boolean, updated_by: object | null,
 *   updated_at: string | null }[], onToggle: (key: string, enabled: boolean) => void }} options
 */
export function renderWidgetSettings(container, { items, onToggle }) {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const groups = WIDGET_GROUPS.map((group) => {
    const widgets = WIDGETS.filter((w) => w.group === group && byKey.has(w.key));
    if (!widgets.length) return null;
    return h(
      'fieldset',
      { class: 'widget-settings-group' },
      h('legend', {}, group),
      widgets.map((w) => {
        const item = byKey.get(w.key);
        const note = settingNote(item);
        return h(
          'div',
          { class: 'widget-setting' },
          h(
            'label',
            { class: 'widget-setting-label' },
            h('input', {
              type: 'checkbox',
              class: 'online-only',
              checked: item.enabled,
              dataset: { focus: `setting-${w.key}` },
              'aria-describedby': note ? `setting-note-${w.key}` : null,
              onChange: (event) => onToggle(w.key, event.target.checked),
            }),
            h('span', {}, w.label),
          ),
          note ? h('p', { id: `setting-note-${w.key}`, class: 'widget-setting-note' }, note) : null,
        );
      }),
    );
  });
  const off = items.filter((item) => !item.enabled).length;
  replaceChildren(
    container,
    h(
      'div',
      { class: 'settings-page widget-settings-page' },
      h('h2', { class: 'placeholder-title', tabindex: '-1' }, 'Dashboard widgets'),
      h(
        'p',
        {},
        'Ticked widgets are offered to supervisors. Untick a widget still in development or not working: supervisors no longer see it in the sidebar or on their dashboards, and get it back, where it was, once it is ticked again. You keep seeing every widget, marked “Off” in the sidebar when it is switched off.',
      ),
      h(
        'p',
        { class: 'muted', role: 'status' },
        off ? `${off} of ${items.length} widgets switched off.` : 'Every widget is switched on.',
      ),
      h('div', { class: 'widget-settings' }, groups),
    ),
  );
}
