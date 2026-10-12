// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { parseFilters } from '../assets/js/filters.js';
import {
  drillHref,
  drillLabel,
  recordsTable,
  widgetDef,
  widgetTable,
} from '../assets/js/widgets.js';
import { durationText, sparkPoints } from '../assets/js/widgets-people.js';

const filters = { period: 90, sites: ['Lyon'], categories: [] };

describe('durations', () => {
  it('reads as minutes, hours, then days from 48 hours', () => {
    expect(durationText(0.5)).toBe('30 min');
    expect(durationText(6.54)).toBe('6.5 h');
    expect(durationText(47.9)).toBe('47.9 h');
    expect(durationText(48)).toBe('2 d');
    expect(durationText(1200)).toBe('50 d');
    expect(durationText(null)).toBe('—');
  });
});

describe('sparkPoints', () => {
  it('draws a trend scaled to the box, skipping empty buckets', () => {
    expect(sparkPoints([1, 3], 96, 24)).toBe('0.0,22.0 96.0,2.0');
    expect(sparkPoints([2, null, 2], 96, 24)).toBe('0.0,22.0 96.0,22.0');
    expect(sparkPoints([5])).toBe('');
  });
});

describe('drill-down of the asset widgets', () => {
  it('opens the asset list with the site of the bar', () => {
    const href = drillHref(widgetDef('critical_downtime'), 'site:Lyon Part-Dieu', filters);
    expect(href).toBe(
      '/assets?drill=critical_downtime%3Asite%3ALyon+Part-Dieu&period=90&site=Lyon',
    );
    const parsed = parseFilters('assets', new URL(href, 'https://x').searchParams);
    expect(parsed).toMatchObject({ drill: 'critical_downtime:site:Lyon Part-Dieu', period: 90 });
    expect(drillLabel(parsed.drill, parsed.period)).toBe(
      'Critical assets out of service: Lyon Part-Dieu (last 90 days)',
    );
  });

  it('names the segments of the other widgets', () => {
    expect(drillLabel('response_times:close:URGENT', 30)).toBe(
      'Time to start and to close: closed, Urgent (last 30 days)',
    );
    expect(drillLabel('request_service:rejected')).toBe('Staff requests: rejected (last 30 days)');
    expect(drillLabel('workload:person:4:HIGH')).toBe('Workload per person: person 4, High');
    expect(drillLabel('workload:UNASSIGNED')).toBe('Workload per person: unassigned');
    expect(drillLabel('estimate_accuracy:HVAC')).toBe(
      'Estimates vs actual hours: HVAC (last 30 days)',
    );
    expect(drillLabel('bad_actors:critical')).toBe(
      'Assets with the most breakdowns: high and critical assets (last 30 days)',
    );
  });
});

describe('table views', () => {
  it('gives response times per priority with links on the counts', () => {
    const stats = (count, median, p90) => ({ count, median, p90 });
    const data = {
      rows: [
        { priority: 'URGENT', start: stats(3, 2, 4), close: stats(2, 36, 48) },
        { priority: 'LOW', start: stats(0, null, null), close: stats(0, null, null) },
      ],
    };
    const table = widgetTable('response_times', data, { drill: (s) => s });
    expect(table.rows[0]).toEqual(['Urgent', 3, '2 h', '4 h', 2, '36 h', '2 d']);
    expect(table.links[0]).toEqual([null, 'start:URGENT', null, null, 'close:URGENT', null, null]);
    expect(table.links[1]).toEqual([null, null, null, null, null, null, null]);
  });

  it('follows the critical-only option of the bad actors', () => {
    const asset = (id, code) => ({
      id,
      code,
      name: 'Chiller',
      site: 'Paris',
      criticality: 'CRITICAL',
    });
    const data = {
      all: {
        total: 3,
        assets: 2,
        items: [
          { asset: asset(1, 'AST-0001'), count: 2, cumulative: 2 / 3 },
          { asset: asset(2, 'AST-0002'), count: 1, cumulative: 1 },
        ],
      },
      critical: {
        total: 2,
        assets: 1,
        items: [{ asset: asset(1, 'AST-0001'), count: 2, cumulative: 1 }],
      },
    };
    expect(widgetTable('bad_actors', data).rows).toHaveLength(2);
    const critical = widgetTable('bad_actors', data, {
      options: { critical_only: 'yes' },
      drill: (s) => s,
    });
    expect(critical.rows).toEqual([['AST-0001 — Chiller', 'Paris', 'Critical', 2, '100%']]);
    expect(critical.links[0]).toEqual(['/assets/1', null, null, 'asset:1', null]);
  });

  it('lists people with their priorities, then the unassigned work', () => {
    const data = {
      week: '2026-W40',
      priorities: ['URGENT', 'HIGH', 'NORMAL', 'LOW'],
      people: [
        {
          id: 4,
          first_name: 'Tia',
          last_name: 'One',
          counts: [2, 0, 0, 0],
          total: 2,
          hours_left: 10,
          booked: 3,
          capacity: 35,
        },
      ],
      unassigned: { counts: [0, 0, 2, 0], total: 2, hours_left: 0 },
    };
    const table = widgetTable('workload', data, { drill: (s) => s });
    expect(table.rows).toEqual([
      ['Tia One', 2, 0, 0, 0, 2, 10, 3, 35],
      ['Unassigned', 0, 0, 2, 0, 2, 0, '', ''],
    ]);
    expect(table.links[0]).toEqual([
      null,
      'person:4:URGENT',
      null,
      null,
      null,
      'person:4',
      null,
      null,
      null,
    ]);
    expect(table.links[1][3]).toBe('UNASSIGNED:NORMAL');
  });
});

describe('exports', () => {
  it('adds the columns of the widget to the records', () => {
    const wo = {
      number: 'WO-2026-00009',
      title: 'Leak',
      type: 'CORRECTIVE',
      status: 'OPEN',
      priority: 'NORMAL',
      category: 'HVAC',
      site: 'Paris',
      dashboard: { previous: 'WO-2026-00008', days_since_previous: 29 },
    };
    const table = recordsTable('work_orders', [wo], 'repeat_failures');
    expect(table.columns.slice(-2)).toEqual(['Previous work order', 'Days since it closed']);
    expect(table.rows[0].slice(-2)).toEqual(['WO-2026-00008', 29]);
    const assets = recordsTable(
      'assets',
      [{ code: 'AST-0003', dashboard: { days_down: 30 } }],
      'critical_downtime',
    );
    expect(assets.columns.at(-1)).toBe('Days broken down');
    expect(assets.rows[0].at(-1)).toBe(30);
    expect(recordsTable('work_orders', [wo], 'by_status').columns.at(-1)).toBe('Actual hours');
  });
});
