// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { formatDate, isEmpty, renderValue } from '../assets/js/format.js';

describe('formatDate', () => {
  it('formats a date without shifting it across time zones', () => {
    expect(formatDate('2026-10-04')).toBe('4 Oct 2026');
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
  });
});

describe('isEmpty', () => {
  it('treats only null, undefined and empty strings as empty', () => {
    expect([null, undefined, ''].every(isEmpty)).toBe(true);
    expect([0, false, 'x'].some(isEmpty)).toBe(false);
  });
});

describe('renderValue', () => {
  it('renders enums as labelled badges', () => {
    const el = renderValue('status', { type: 'enum', enum: 'asset_status' }, 'BROKEN_DOWN');
    expect(el.textContent).toBe('Broken down');
    expect(el.classList.contains('badge-status-broken-down')).toBe(true);
    expect(el.classList.contains('badge-tone-danger')).toBe(true);
  });

  it('renders booleans, hours and users as text', () => {
    expect(renderValue('x', { type: 'boolean' }, false)).toBe('No');
    expect(renderValue('x', { type: 'hours' }, 1.5)).toBe('1.5 h');
    expect(
      renderValue('x', { type: 'user' }, { id: 1, first_name: 'Ada', last_name: 'Byron' }),
    ).toBe('Ada Byron');
  });

  it('renders the asset of a work order as an internal link', () => {
    const link = renderValue(
      'asset',
      { type: 'asset' },
      { id: 12, code: 'AST-0012', name: 'Chiller' },
    );
    expect(link.getAttribute('href')).toBe('/assets/12');
    expect(link.hasAttribute('data-link')).toBe(true);
    expect(link.textContent).toBe('AST-0012 — Chiller');
  });
});
