// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { filtersQuery, parseFilters } from '../assets/js/filters.js';
import {
  DEFAULT_FILTERS,
  drillHref,
  drillLabel,
  widgetDef,
  widgetOptions,
  widgetTable,
} from '../assets/js/widgets.js';
import { bucketAxis, bucketTitle, heatStep, plannedShare } from '../assets/js/widgets-flow.js';

const week = (key, from, to, partial = false) => ({ key, from, to, partial });

describe('bucket labels', () => {
  it('names weeks and months', () => {
    expect(bucketAxis(week('2026-W37', '2026-09-07', '2026-09-13'), 'week')).toBe('W37');
    expect(bucketAxis(week('2025-10', '2025-10-05', '2025-10-31'), 'month', 0)).toBe('Oct 2025');
    expect(bucketAxis(week('2025-11', '2025-11-01', '2025-11-30'), 'month', 1)).toBe('Nov');
    expect(bucketAxis(week('2026-01', '2026-01-01', '2026-01-31'), 'month', 3)).toBe('Jan 2026');
    expect(bucketTitle(week('2026-W37', '2026-09-07', '2026-09-13'), 'week')).toBe(
      'Week 37: 7–13 Sept',
    );
    expect(bucketTitle(week('2026-W40', '2026-09-28', '2026-10-04'), 'week')).toBe(
      'Week 40: 28 Sept–4 Oct',
    );
    expect(bucketTitle(week('2026-W36', '2026-09-06', '2026-09-06', true), 'week')).toBe(
      'Week 36: 6 Sept',
    );
    expect(bucketTitle(week('2026-09', '2026-09-01', '2026-09-30'), 'month')).toBe(
      'September 2026',
    );
    expect(bucketTitle(week('2026-10', '2026-10-01', '2026-10-04', true), 'month')).toBe(
      'October 2026 (1 Oct–4 Oct)',
    );
  });
});

describe('drill-down links (K9)', () => {
  const filters = { period: 90, sites: ['Paris', 'Lyon'], categories: ['HVAC'] };

  it('carries the segment and the filters the widget uses', () => {
    expect(drillHref(widgetDef('backlog_age'), 'URGENT:91+', filters)).toBe(
      '/work-orders?drill=backlog_age%3AURGENT%3A91%2B&site=Paris%7CLyon&category=HVAC',
    );
    expect(drillHref(widgetDef('by_category'), 'HVAC', filters)).toBe(
      '/work-orders?drill=by_category%3AHVAC&period=90&site=Paris%7CLyon',
    );
    expect(drillHref(widgetDef('closed_this_month'), null, DEFAULT_FILTERS)).toBe(
      '/work-orders?drill=closed_this_month',
    );
  });

  it('names what the list shows', () => {
    expect(drillLabel('backlog_age:URGENT:91+')).toBe(
      'Backlog by age and priority: Urgent, 91+ days old',
    );
    expect(drillLabel('backlog_age::8-30')).toBe('Backlog by age and priority: 8–30 days old');
    expect(drillLabel('opened_vs_closed:cancelled:2026-W40', 90)).toBe(
      'Opened vs closed: cancelled in week 40, 2026 (last 90 days)',
    );
    expect(drillLabel('planned_vs_reactive:REQUESTS:2026-09', 365)).toBe(
      'Planned vs reactive work: Staff requests, September 2026 (last 365 days)',
    );
    expect(drillLabel('backlog_weeks:NO_ESTIMATE')).toBe(
      'Backlog in weeks of work: without an estimate',
    );
    expect(drillLabel('by_status:ON_HOLD')).toBe('Work orders by status: On hold (last 30 days)');
    expect(drillLabel('nope:1')).toBeNull();
  });

  it('keeps drill and period in the list URL, the period only with a drill', () => {
    const query = new URLSearchParams('drill=backlog_age:URGENT:91%2B&period=90&status=OPEN');
    const filters = parseFilters('work_orders', query);
    expect(filters).toMatchObject({ drill: 'backlog_age:URGENT:91+', period: 90, status: 'OPEN' });
    expect(new URLSearchParams(filtersQuery('work_orders', filters)).get('drill')).toBe(
      'backlog_age:URGENT:91+',
    );
    expect(parseFilters('work_orders', new URLSearchParams('period=90'))).toEqual({});
    expect(parseFilters('work_orders', new URLSearchParams('drill=<script>&period=7'))).toEqual({});
  });
});

describe('flow and backlog figures', () => {
  it('steps the heat of a cell against the largest one', () => {
    expect([0, 1, 10, 26, 51, 100].map((n) => heatStep(n, 100))).toEqual([0, 1, 1, 2, 3, 4]);
    expect(heatStep(0, 0)).toBe(0);
  });

  const work = {
    unit: 'week',
    groups: ['PLANNED', 'REACTIVE', 'REQUESTS', 'IMPROVEMENT'],
    buckets: [
      {
        ...week('2026-W40', '2026-09-28', '2026-10-04'),
        values: {
          PLANNED: { count: 3, hours: 2 },
          REACTIVE: { count: 1, hours: 6 },
          REQUESTS: { count: 0, hours: 0 },
          IMPROVEMENT: { count: 0, hours: 0 },
        },
      },
    ],
  };

  it('gives the planned share by work orders or by hours', () => {
    expect(plannedShare(work, 'count')).toBe(0.75);
    expect(plannedShare(work, 'hours')).toBe(0.25);
    expect(plannedShare({ ...work, buckets: [] }, 'count')).toBeNull();
  });

  it('builds the table view of the chosen basis, with links on counted cells', () => {
    const drill = (segment) => `/x?${segment}`;
    const hours = widgetTable('planned_vs_reactive', work, { options: { basis: 'hours' }, drill });
    expect(hours.rows).toEqual([['Week 40: 28 Sept–4 Oct', 2, 6, 0, 0, 8]]);
    expect(hours.links).toEqual([
      [null, '/x?PLANNED:2026-W40', '/x?REACTIVE:2026-W40', null, null, null],
    ]);
    expect(widgetTable('planned_vs_reactive', work).rows[0].at(-1)).toBe(4);
    expect(widgetTable('planned_vs_reactive', work).links).toBeUndefined();
  });

  it('fills the default options', () => {
    expect(widgetOptions('planned_vs_reactive')).toEqual({ basis: 'count' });
    expect(widgetOptions('planned_vs_reactive', { basis: 'hours' })).toEqual({ basis: 'hours' });
    expect(widgetOptions('by_status')).toEqual({});
  });
});
