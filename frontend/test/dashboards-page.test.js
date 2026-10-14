// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest';
import { closeMenuOnEscape } from '../assets/js/dashboards-page.js';

describe('dashboard menus', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <details class="widget-menu" open><summary>⋯</summary><button>Figures (CSV)</button></details>
      <details class="page-menu"><summary>Dashboard</summary></details>`;
  });

  it('close with Escape and give the focus back to their button (DT8)', () => {
    const menu = document.querySelector('.widget-menu');
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    closeMenuOnEscape(event);
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(menu.querySelector('summary'));
    expect(event.defaultPrevented).toBe(true);
  });

  it('leave Escape alone when no menu is open, for the panel and the drag', () => {
    document.querySelector('.widget-menu').open = false;
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    closeMenuOnEscape(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
