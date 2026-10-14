// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// DOM helpers. Data is always inserted as text (D12): use h() or textContent, and
// escapeHtml() if a template string is ever unavoidable.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes a value for use inside HTML text or a quoted attribute. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Creates an element. Children may be strings (inserted as text), nodes, arrays, or
 * null/false (skipped).
 * Attributes: `class`, `dataset` (object), `on<Event>` (listener), booleans (set when true),
 * anything else via setAttribute.
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {...unknown} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Removes all children and appends new ones. */
export function replaceChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

/** 'FIRE_SAFETY' → 'fire-safety'; 'serial_number' → 'serial-number'. */
export function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Badge class names from the brief: `badge badge-<field>-<value>` plus a tone modifier. */
export function badgeClass(field, code, tone = 'neutral') {
  return `badge badge-${slug(field)}-${slug(code)} badge-tone-${tone}`;
}

/**
 * Message line of the planner, the week scheduler and My week: what was just done, or what
 * went wrong. Hidden while empty. On small screens it floats at the bottom of the page with a
 * close button, so it is seen wherever the page is scrolled (M2, layout.css).
 * @returns {{ element: HTMLElement, say: (text: string, tone?: string) => void }}
 */
export function pageMessage() {
  const text = h('span', { class: 'planner-message-text' });
  const element = h(
    'p',
    { class: 'planner-message', role: 'status' },
    text,
    h(
      'button',
      {
        type: 'button',
        class: 'icon-button planner-message-close',
        'aria-label': 'Dismiss the message',
        onClick: () => say(''),
      },
      h('span', { 'aria-hidden': 'true' }, '×'),
    ),
  );
  function say(message, tone = 'info') {
    text.textContent = message;
    element.dataset.tone = tone;
    element.classList.toggle('has-message', Boolean(message));
  }
  return { element, say };
}

/**
 * A label "WO-2026-00133 — Title" with its code kept on one line (DT5): the hyphens of a code
 * are otherwise line-break points in narrow columns.
 * @param {string} label
 * @param {string} [separator] between the code and the rest
 * @returns {(string | HTMLElement)[]}
 */
export function codeFirst(label, separator = ' — ') {
  const at = label.indexOf(separator);
  if (at < 0) return [label];
  return [h('span', { class: 'nowrap' }, label.slice(0, at)), label.slice(at)];
}

/** Phone-sized screen: under 768 px wide (docs/ui-guidelines.md). False where unknown. */
export function isPhone() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
}
