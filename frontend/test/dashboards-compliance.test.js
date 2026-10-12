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
import { sortContractors } from '../assets/js/widgets-compliance.js';

const contractors = [
  { supplier: 'Volt & Co', visits: 1, on_time: 1, late: 0, skipped: 0, rate: 1 },
  { supplier: 'Sécurité Incendie: Nord', visits: 3, on_time: 1, late: 1, skipped: 1, rate: 0.5 },
  { supplier: 'Absent', visits: 1, on_time: 0, late: 0, skipped: 1, rate: null },
];

describe('contractor scorecard', () => {
  it('puts the worst first by default, and sorts by any column', () => {
    expect(sortContractors(contractors).map((c) => c.supplier)).toEqual([
      'Sécurité Incendie: Nord',
      'Volt & Co',
      'Absent',
    ]);
    expect(sortContractors(contractors, 'supplier').map((c) => c.supplier)).toEqual([
      'Absent',
      'Sécurité Incendie: Nord',
      'Volt & Co',
    ]);
    expect(sortContractors(contractors, 'visits')[0].supplier).toBe('Sécurité Incendie: Nord');
  });

  it('links the visits and the late ones, never the skipped ones', () => {
    const drill = (segment) => `/x?${segment}`;
    const table = widgetTable('contractor_scorecard', { items: contractors }, { drill });
    expect(table.columns.map((c) => c.label)).toEqual([
      'Contractor',
      'Visits',
      'On time',
      'Late',
      'Skipped',
      'On time %',
    ]);
    expect(table.rows[0]).toEqual(['Sécurité Incendie: Nord', 3, 1, 1, 1, '50%']);
    expect(table.links[0]).toEqual([
      null,
      '/x?:Sécurité Incendie: Nord',
      '/x?on_time:Sécurité Incendie: Nord',
      '/x?late:Sécurité Incendie: Nord',
      null,
      null,
    ]);
    expect(table.rows[2].at(-1)).toBe('—');
  });

  it('opens a drill-down whose segment holds the name, colon and accents included', () => {
    const href = drillHref(widgetDef('contractor_scorecard'), 'late:Sécurité Incendie: Nord', {
      period: 30,
      sites: [],
      categories: [],
    });
    const query = new URL(href, 'https://x').searchParams;
    const filters = parseFilters('work_orders', query);
    expect(filters.drill).toBe('contractor_scorecard:late:Sécurité Incendie: Nord');
    expect(drillLabel(filters.drill, filters.period)).toBe(
      'Contractors: Sécurité Incendie: Nord, late (last 30 days)',
    );
    expect(parseFilters('work_orders', new URLSearchParams('drill=pm_compliance:late%0A'))).toEqual(
      {},
    );
  });
});

describe('labels of the compliance segments', () => {
  it('name trades, outcomes and weeks', () => {
    expect(drillLabel('pm_compliance:late:FIRE_SAFETY', 90)).toBe(
      'Preventive maintenance compliance: Fire safety, late (last 90 days)',
    );
    expect(drillLabel('schedule_compliance:missed:2026-W38')).toBe(
      'Week schedule kept: week 38, 2026, not finished in their week (last 30 days)',
    );
    expect(drillLabel('regulatory_late')).toBe('Regulatory visits late');
  });

  it('links the regulatory tile to its drill-down (no list filter says it)', () => {
    expect(
      drillHref(widgetDef('regulatory_late'), null, {
        period: 30,
        sites: ['Lyon'],
        categories: [],
      }),
    ).toBe('/work-orders?drill=regulatory_late&site=Lyon');
  });
});

describe('figures and visits tables', () => {
  it('builds the preventive table with links to late and on-time visits', () => {
    const data = {
      items: [{ category: 'HVAC', on_time: 2, late: 1, skipped: 1, rate: 2 / 3 }],
    };
    const table = widgetTable('pm_compliance', data, { drill: (s) => s });
    expect(table.rows).toEqual([['HVAC', 2, 1, 1, '67%']]);
    expect(table.links).toEqual([[null, 'on_time:HVAC', 'late:HVAC', null, null]]);
  });

  it('writes the schedule kept per week', () => {
    const data = {
      unit: 'week',
      buckets: [
        {
          key: '2026-W38',
          from: '2026-09-14',
          to: '2026-09-20',
          partial: false,
          scheduled: 2,
          kept: 1,
          rate: 0.5,
          hours: 5,
          break_in: 0.4,
        },
        {
          key: '2026-W39',
          from: '2026-09-21',
          to: '2026-09-27',
          partial: false,
          scheduled: 0,
          kept: 0,
          rate: null,
          hours: 0,
          break_in: null,
        },
      ],
    };
    const table = widgetTable('schedule_compliance', data, { drill: (s) => s });
    expect(table.rows).toEqual([
      ['Week 38: 14–20 Sept', 2, 1, '50%', 5, '40%'],
      ['Week 39: 21–27 Sept', 0, 0, '—', 0, '—'],
    ]);
    expect(table.links[0]).toEqual([
      null,
      'scheduled:2026-W38',
      'kept:2026-W38',
      'missed:2026-W38',
      null,
      null,
    ]);
  });

  it('exports visits with their outcome and reason', () => {
    const table = recordsTable('visits', [
      {
        plan_code: 'PM-0002',
        plan_title: 'Fire alarm check',
        type: 'REGULATORY',
        category: 'FIRE_SAFETY',
        site: 'Paris',
        performed_by: 'CONTRACTOR',
        supplier: 'Veritec',
        due_week: '2026-W39',
        week: '2026-W39',
        deadline_on: '2026-09-27',
        outcome: 'skipped',
        skip_reason: 'Building closed',
        work_order_number: null,
        closed_on: null,
      },
    ]);
    expect(table.columns[0]).toBe('Plan');
    expect(table.rows[0]).toEqual([
      'PM-0002',
      'Fire alarm check',
      'Regulatory',
      'Fire safety',
      'Paris',
      'Veritec',
      '2026-W39',
      '2026-W39',
      '2026-09-27',
      'Skipped',
      'Building closed',
      '',
      '',
    ]);
  });
});
