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
