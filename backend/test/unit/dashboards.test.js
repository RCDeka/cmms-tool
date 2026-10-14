// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import {
  TEMPLATES,
  WIDGET_KEYS,
  filtersFor,
  isSameSet,
  sameName,
  templateWidgets,
  unavailableAdded,
  widgetAvailable,
  widgetsProblem,
  withFilterDefaults,
} from '../../src/rules/dashboards.js';

describe('widget catalogue', () => {
  it('has unique keys', () => {
    expect(new Set(WIDGET_KEYS).size).toBe(WIDGET_KEYS.length);
  });

  it('builds templates from known widgets only', () => {
    for (const keys of Object.values(TEMPLATES))
      expect(widgetsProblem(keys.map((key) => ({ key })))).toBeNull();
    expect(templateWidgets('OVERVIEW')).toHaveLength(12);
    expect(templateWidgets('OVERVIEW')[0]).toEqual({ key: 'open_work_orders', options: {} });
    expect(templateWidgets('EMPTY')).toEqual([]);
  });
});

describe('widgetsProblem (BR-K3)', () => {
  it('accepts known widgets once each', () => {
    expect(widgetsProblem([{ key: 'by_status' }, { key: 'my_work' }])).toBeNull();
    expect(widgetsProblem([])).toBeNull();
  });

  it('refuses unknown and repeated widgets', () => {
    expect(widgetsProblem([{ key: 'nope' }])).toMatch(/Unknown widget/);
    expect(widgetsProblem([{ key: 'my_work' }, { key: 'my_work' }])).toMatch(/already/);
  });
});

describe('sameName (BR-K2)', () => {
  it.each([
    ['Saclay', 'saclay', true],
    ['Saclay', 'SACLAY', true],
    ['Équipe', 'équipe', true],
    ['Équipe', 'Equipe', false],
    ['Saclay', 'Saclay 2', false],
  ])('%s vs %s → %s', (a, b, expected) => {
    expect(sameName(a, b)).toBe(expected);
  });
});

describe('isSameSet', () => {
  it('accepts a new order of the same dashboards', () => {
    expect(isSameSet([1, 2, 3], [3, 1, 2])).toBe(true);
  });

  it('refuses missing, extra or repeated dashboards', () => {
    expect(isSameSet([1, 2, 3], [1, 2])).toBe(false);
    expect(isSameSet([1, 2, 3], [1, 2, 3, 4])).toBe(false);
    expect(isSameSet([1, 2, 3], [1, 1, 2])).toBe(false);
    expect(isSameSet([1, 2], [1, 5])).toBe(false);
  });
});

describe('filters', () => {
  it('fills in the defaults', () => {
    expect(withFilterDefaults({})).toEqual({ period: 30, sites: [], categories: [] });
    expect(withFilterDefaults({ period: 90, sites: ['Lyon'] })).toEqual({
      period: 90,
      sites: ['Lyon'],
      categories: [],
    });
  });

  it('keeps only the filters a widget uses', () => {
    const all = { period: 90, sites: ['Lyon'], categories: ['HVAC'] };
    expect(filtersFor('by_category', all)).toEqual({ period: 90, sites: ['Lyon'], categories: [] });
    expect(filtersFor('by_status', all)).toEqual(all);
    expect(filtersFor('open_work_orders', all)).toEqual({
      period: null,
      sites: ['Lyon'],
      categories: ['HVAC'],
    });
    expect(filtersFor('my_work', all)).toEqual({ period: null, sites: [], categories: [] });
  });
});

describe('widget availability (D65)', () => {
  const disabled = new Set(['by_status']);

  it('hides a switched-off widget from every role but administrators', () => {
    expect(widgetAvailable('by_status', 'ADMIN', disabled)).toBe(true);
    expect(widgetAvailable('by_status', 'SUPERVISOR', disabled)).toBe(false);
    expect(widgetAvailable('by_status', 'TECHNICIAN', disabled)).toBe(false);
    expect(widgetAvailable('by_category', 'SUPERVISOR', disabled)).toBe(true);
  });

  it('refuses only switched-off widgets newly added by a non-administrator', () => {
    const w = (...keys) => keys.map((key) => ({ key }));
    expect(
      unavailableAdded(w('my_work'), w('my_work', 'by_status'), 'SUPERVISOR', disabled),
    ).toEqual(['by_status']);
    // Already on the dashboard: kept (hidden), so a reorder still saves.
    expect(
      unavailableAdded(w('by_status'), w('my_work', 'by_status'), 'SUPERVISOR', disabled),
    ).toEqual([]);
    expect(unavailableAdded(w(), w('by_status'), 'ADMIN', disabled)).toEqual([]);
    expect(unavailableAdded(w(), w('by_category'), 'SUPERVISOR', disabled)).toEqual([]);
  });
});
