// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as backend from '../../backend/src/rules/dashboards.js';
import { csvCell, exportFileName, fileSlug, toCsv } from '../assets/js/export.js';
import { moveKey, sameOrder } from '../assets/js/widget-order.js';
import {
  DEFAULT_FILTERS,
  PERIODS,
  WIDGETS,
  WIDGET_GROUPS,
  recordsTable,
  tileHref,
  widgetDef,
  widgetScope,
  widgetTable,
} from '../assets/js/widgets.js';

describe('widget catalogue', () => {
  it('matches the backend: keys, order, filters and records', () => {
    expect(WIDGETS.map((w) => ({ key: w.key, filters: w.filters, rows: w.rows }))).toEqual(
      backend.WIDGETS.map((w) => ({ key: w.key, filters: w.filters, rows: w.rows })),
    );
    expect(PERIODS).toEqual(backend.DASHBOARD_PERIODS);
    expect(DEFAULT_FILTERS.period).toBe(backend.DEFAULT_PERIOD);
  });

  it('puts every widget in a known group, with a size and a label', () => {
    for (const w of WIDGETS) {
      expect(WIDGET_GROUPS).toContain(w.group);
      expect(['S', 'M', 'L']).toContain(w.size);
      expect(w.label).toBeTruthy();
    }
  });
});

describe('widgetScope', () => {
  const filters = (extra) => ({ ...DEFAULT_FILTERS, ...extra });

  it('names the period and leaves "all sites, all trades" unsaid', () => {
    expect(widgetScope(widgetDef('by_status'), filters())).toBe('Last 30 days');
    expect(widgetScope(widgetDef('open_work_orders'), filters())).toBe('');
  });

  it('names the sites and trades chosen', () => {
    const f = filters({ period: 90, sites: ['Lyon Part-Dieu Branch'], categories: ['HVAC'] });
    expect(widgetScope(widgetDef('by_status'), f)).toBe(
      'Last 90 days · Lyon Part-Dieu Branch · HVAC',
    );
    expect(
      widgetScope(
        widgetDef('open_work_orders'),
        filters({ sites: ['A', 'B'], categories: ['HVAC', 'PLUMBING'] }),
      ),
    ).toBe('2 sites · 2 trades');
  });

  it('says when a dashboard filter does not apply', () => {
    expect(widgetScope(widgetDef('by_category'), filters({ categories: ['HVAC'] }))).toBe(
      'Last 30 days · Trade filter not used',
    );
    expect(
      widgetScope(widgetDef('my_work'), filters({ sites: ['Lyon'], categories: ['HVAC'] })),
    ).toBe('Site and trade filter not used');
    expect(widgetScope(widgetDef('pending_conflicts'), filters({ period: 365 }))).toBe('');
  });
});

describe('tileHref', () => {
  it('opens the list with the sites and trades the tile counts', () => {
    const f = {
      ...DEFAULT_FILTERS,
      sites: ['Paris, Tower A', 'Lyon'],
      categories: ['HVAC', 'PLUMBING'],
    };
    expect(tileHref(widgetDef('open_work_orders'), f)).toBe(
      '/work-orders?status=OPEN&site=Paris%2C+Tower+A%7CLyon&category=HVAC%2CPLUMBING',
    );
    expect(tileHref(widgetDef('assets_broken_down'), f)).toMatch(
      /^\/assets\?status=BROKEN_DOWN&site=/,
    );
    expect(tileHref(widgetDef('pending_conflicts'), f)).toBe('/conflicts');
    expect(tileHref(widgetDef('open_work_orders'), DEFAULT_FILTERS)).toBe(
      '/work-orders?status=OPEN',
    );
    expect(tileHref(widgetDef('by_status'), f)).toBeNull();
  });
});

describe('widgetTable (Figures CSV and table views)', () => {
  it('gives a tile its value', () => {
    expect(widgetTable('overdue_work_orders', { value: 9 })).toEqual({
      columns: [{ label: 'Figure' }, { label: 'Value', numeric: true }],
      rows: [['Overdue work orders', 9]],
    });
  });

  it('lists categories biggest first, Unspecified last', () => {
    const data = {
      period: 30,
      items: [
        { category: 'HVAC', count: 2 },
        { category: 'ELECTRICAL', count: 5 },
        { category: 'UNSPECIFIED', count: 9 },
      ],
    };
    expect(widgetTable('by_category', data).rows).toEqual([
      ['Electrical', 5],
      ['HVAC', 2],
      ['Unspecified', 9],
    ]);
  });

  it('lists every status with its share', () => {
    const data = {
      items: [
        { status: 'OPEN', count: 1 },
        { status: 'IN_PROGRESS', count: 0 },
        { status: 'ON_HOLD', count: 0 },
        { status: 'CLOSED', count: 3 },
        { status: 'CANCELLED', count: 0 },
      ],
    };
    expect(widgetTable('by_status', data).rows).toEqual([
      ['Open', 1, '25%'],
      ['In progress', 0, '0%'],
      ['On hold', 0, '0%'],
      ['Closed', 3, '75%'],
      ['Cancelled', 0, '0%'],
    ]);
  });

  it('follows the My work period shown', () => {
    const wo = (id, due) => ({
      number: `WO-${id}`,
      title: `Job ${id}`,
      priority: 'HIGH',
      due_on: due,
    });
    const data = { today_items: [wo(1, null)], week_items: [wo(1, null), wo(2, '2026-10-08')] };
    expect(widgetTable('my_work', data).rows).toEqual([['WO-1 — Job 1', 'High', 'No due date']]);
    expect(widgetTable('my_work', data, { myWorkRange: 'week' }).rows).toHaveLength(2);
  });
});

describe('recordsTable (Work orders and Assets CSV)', () => {
  it('writes labels, people names and empty cells', () => {
    const table = recordsTable('work_orders', [
      {
        number: 'WO-2026-00001',
        title: 'Leak',
        type: 'CORRECTIVE',
        status: 'OPEN',
        priority: 'URGENT',
        category: null,
        site: 'Lyon',
        location: null,
        asset: { code: 'AST-0001' },
        assignee: { first_name: 'Tia', last_name: 'Tech' },
        created_on: '2026-10-01',
        due_on: null,
        started_on: null,
        closed_on: null,
        estimated_hours: 1.5,
        actual_hours: null,
      },
    ]);
    expect(table.columns[0]).toBe('Number');
    expect(table.rows[0]).toEqual([
      'WO-2026-00001',
      'Leak',
      'Corrective',
      'Open',
      'Urgent',
      'Unspecified',
      'Lyon',
      '',
      'AST-0001',
      'Tia Tech',
      '2026-10-01',
      '',
      '',
      '',
      1.5,
      '',
    ]);
    expect(recordsTable('assets', []).columns).toContain('Serial number');
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(0)).toBe('0');
  });

  it('keeps cells that look like formulas as text (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+33 1 23')).toBe("'+33 1 23");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    // Numbers are numbers, negative ones too.
    expect(csvCell(-2)).toBe('-2');
  });

  it('starts with a byte order mark and ends lines with CRLF', () => {
    const text = toCsv(['Site', 'Count'], [['Défense', 3]]);
    expect(text).toBe('﻿Site,Count\r\nDéfense,3\r\n');
  });
});

describe('file names', () => {
  it('uses plain lowercase words and the date', () => {
    expect(fileSlug('Saclay — équipe')).toBe('saclay-equipe');
    expect(
      exportFileName({
        dashboard: 'Saclay — équipe',
        widget: 'Work orders by status',
        suffix: 'work orders',
        date: '2026-10-12',
        ext: 'csv',
      }),
    ).toBe('tacto-saclay-equipe-work-orders-by-status-work-orders-2026-10-12.csv');
    expect(
      exportFileName({ dashboard: '!!!', widget: 'My work', date: '2026-10-12', ext: 'jpg' }),
    ).toBe('tacto-my-work-2026-10-12.jpg');
  });
});

describe('moveKey', () => {
  it('moves a widget to a position among the others', () => {
    expect(moveKey(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveKey(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveKey(['a', 'b', 'c'], 'b', 99)).toEqual(['a', 'c', 'b']);
    expect(moveKey(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveKey(['a', 'b'], 'x', 0)).toEqual(['a', 'b']);
  });

  it('tells whether the order changed', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});
