// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment node
// jsdom has no layout, so the rules the page layout depends on are checked in the style sheet.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../assets/css/layout.css', import.meta.url), 'utf8');

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(selector) {
  const escaped = selector.replace(/[#.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`));
  return match ? match[1] : '';
}

describe('page layout', () => {
  it('never lets the whole page scroll: the main area clips what overflows it (DT1)', () => {
    // #main-content is the containing block of the floating message (M2), so the
    // screen-reader-only texts inside the scrolling areas are placed against it; without the
    // clip they stretched the page and scrollIntoView scrolled the top bar away (My week).
    expect(rule('#main-content')).toMatch(/position: relative;/);
    expect(rule('#main-content')).toMatch(/overflow: clip;/);
  });

  it('keeps the page title on one line from tablets up (DT7)', () => {
    const wide = css.slice(css.indexOf('@media (min-width: 768px) {'));
    expect(wide).toMatch(/#page-title \{[^}]*white-space: nowrap;[^}]*\}/);
    expect(wide).toMatch(/#page-title \{[^}]*text-overflow: ellipsis;[^}]*\}/);
  });
});
