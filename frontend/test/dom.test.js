// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from 'vitest';
import { badgeClass, escapeHtml, h, slug } from '../assets/js/dom.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );
  });

  it('handles null, undefined and numbers', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('h', () => {
  it('inserts strings as text, never as HTML', () => {
    const el = h('p', {}, '<b>bold</b>');
    expect(el.innerHTML).toBe('&lt;b&gt;bold&lt;/b&gt;');
    expect(el.children).toHaveLength(0);
  });

  it('sets attributes, dataset, booleans and listeners', () => {
    const onClick = vi.fn();
    const el = h('button', {
      class: 'a b',
      dataset: { id: 7 },
      disabled: true,
      hidden: false,
      'aria-label': 'Close',
      onClick,
    });
    expect(el.className).toBe('a b');
    expect(el.dataset.id).toBe('7');
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.getAttribute('aria-label')).toBe('Close');
    el.click();
    expect(onClick).not.toHaveBeenCalled(); // disabled buttons don't fire click
    el.disabled = false;
    el.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('flattens arrays and skips empty children', () => {
    const el = h('ul', {}, [h('li', {}, 'a'), null, [h('li', {}, 'b'), false]], undefined);
    expect(el.textContent).toBe('ab');
  });
});

describe('badge naming (brief)', () => {
  it.each([
    ['status', 'IN_SERVICE', 'badge-status-in-service'],
    ['criticality', 'HIGH', 'badge-criticality-high'],
    ['category', 'FIRE_SAFETY', 'badge-category-fire-safety'],
    ['priority', 'URGENT', 'badge-priority-urgent'],
  ])('%s %s → %s', (field, code, name) => {
    expect(badgeClass(field, code, 'danger').split(' ')).toEqual([
      'badge',
      name,
      'badge-tone-danger',
    ]);
  });

  it('slugifies any value', () => {
    expect(slug('serial_number')).toBe('serial-number');
    expect(slug('  Odd Value!! ')).toBe('odd-value');
  });
});
