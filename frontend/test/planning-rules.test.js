// The planner's copy of the planning rules must answer like the server (live impact, refusals).
import { describe, expect, it } from 'vitest';
import * as server from '../../backend/src/rules/planning.js';
import * as serverWeeks from '../../backend/src/lib/iso-week.js';
import { CATEGORIES } from '../assets/js/enums.js';
import * as client from '../assets/js/planning-rules.js';

describe('same answers as the server', () => {
  it('counts ISO weeks the same way, across years and week 53', () => {
    let date = '2025-12-20';
    for (let i = 0; i < 800; i += 3) {
      expect(client.weekOfDate(date), date).toBe(serverWeeks.weekOfDate(date));
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 3);
      date = d.toISOString().slice(0, 10);
    }
    for (const [week, n] of [
      ['2026-W50', 5],
      ['2026-W52', 2],
      ['2027-W01', -1],
      ['2026-W41', 104],
    ]) {
      expect(client.addWeeks(week, n)).toBe(serverWeeks.addWeeks(week, n));
      expect(client.mondayOf(week)).toBe(serverWeeks.mondayOf(week));
      expect(client.weeksBetween('2026-W41', week)).toBe(
        serverWeeks.weeksBetween('2026-W41', week),
      );
    }
  });

  it('allows and refuses the same weeks, with the same messages', () => {
    const now = '2026-W41';
    const plans = [
      { type: 'PREVENTIVE', tolerance_weeks: 3, site: 'Lyon' },
      { type: 'REGULATORY', tolerance_weeks: 2, site: 'Lyon' },
      { type: 'PREVENTIVE', tolerance_weeks: 0, site: 'Lyon' },
      { type: 'PREVENTIVE', tolerance_weeks: 1, site: 'Lyon' },
    ];
    const visits = [
      { due_week: '2026-W50', status: 'PLANNED' },
      { due_week: '2026-W42', status: 'PLANNED' },
      { due_week: '2026-W52', status: 'RELEASED' },
      { due_week: '2027-W01', status: 'SKIPPED' },
    ];
    for (const plan of plans) {
      for (const visit of visits) {
        expect(client.allowedWeeks(plan, visit, now)).toEqual(
          server.allowedWeeks(plan, visit, now),
        );
        for (let n = -12; n <= 12; n++) {
          const week = client.addWeeks(visit.due_week, n);
          expect(client.moveBlocker(plan, visit, week, now), `${plan.type} ${week}`).toEqual(
            server.moveBlocker(plan, visit, week, now),
          );
        }
      }
    }
  });

  it('knows series weeks, seasons and blocked weeks the same way', () => {
    const plan = {
      anchor_week: '2026-W50',
      frequency_weeks: 13,
      end_week: '2027-W40',
      season_from_week: 45,
      season_to_week: 10,
      site: 'Lyon',
    };
    const blocked = [
      { week: '2026-W52', site: null },
      { week: '2027-W10', site: 'Lyon' },
      { week: '2027-W23', site: 'Paris' },
    ];
    for (let n = -5; n < 60; n++) {
      const week = client.addWeeks('2026-W50', n);
      expect(client.isSeriesWeek(plan, week)).toBe(server.isSeriesWeek(plan, week));
      expect(client.occurrenceWarnings(plan, week, blocked)).toEqual(
        server.occurrenceWarnings(plan, week, blocked),
      );
    }
  });

  it('computes the same figures and tiles', () => {
    const weeks = ['2026-W52', '2026-W53', '2027-W01'];
    const occurrences = [
      {
        week: '2026-W52',
        status: 'PLANNED',
        estimated_hours: 40,
        category: 'HVAC',
        site: 'Paris',
        performed_by: 'INTERNAL',
      },
      {
        week: '2026-W52',
        status: 'RELEASED',
        estimated_hours: 30,
        category: 'ELECTRICAL',
        site: 'Lyon',
        performed_by: 'INTERNAL',
      },
      {
        week: '2026-W53',
        status: 'SKIPPED',
        estimated_hours: 99,
        category: 'HVAC',
        site: 'Paris',
        performed_by: 'INTERNAL',
      },
      {
        week: '2026-W53',
        status: 'PLANNED',
        estimated_hours: 5,
        category: 'PLUMBING',
        site: 'Paris',
        performed_by: 'CONTRACTOR',
      },
      {
        week: '2027-W01',
        status: 'PLANNED',
        estimated_hours: 3.5,
        category: 'PLUMBING',
        site: 'Lille',
        performed_by: 'INTERNAL',
      },
    ];
    const capacity = server.weeklyCapacity(
      [
        { specialty: 'HVAC', site: 'Paris' },
        { specialty: 'ELECTRICAL', site: 'Lyon' },
        { specialty: null, site: 'Paris' },
      ],
      { daily_hours: 7, reserve_percent: 30 },
    );
    const figures = client.weeklyFigures(weeks, occurrences, capacity);
    expect(figures).toEqual(server.weeklyFigures(weeks, occurrences, capacity));
    expect(client.planningTiles(figures, capacity, CATEGORIES)).toEqual(
      server.planningTiles(figures, capacity, CATEGORIES),
    );
  });
});

describe('preview of a move', () => {
  const weeks =
    client.addWeeks('2026-W41', 0) &&
    Array.from({ length: 30 }, (_, i) => client.addWeeks('2026-W41', i));
  const plan = {
    id: 1,
    anchor_week: '2026-W45',
    frequency_weeks: 4,
    end_week: null,
    estimated_hours: 10,
    category: 'HVAC',
    site: 'Lyon',
    performed_by: 'INTERNAL',
    occurrences: [
      { id: 10, due_week: '2026-W45', week: '2026-W45', status: 'RELEASED' },
      { id: 11, due_week: '2026-W49', week: '2026-W49', status: 'PLANNED' },
      { id: 12, due_week: '2026-W53', week: '2027-W01', status: 'PLANNED' }, // moved by hand
      { id: 13, due_week: '2027-W04', week: '2027-W04', status: 'PLANNED' },
    ],
  };
  const context = { weeks, currentWeek: '2026-W41' };

  it('moves one visit', () => {
    const visits = client.previewPlanVisits(
      plan,
      { kind: 'occurrence', id: 11, week: '2026-W50' },
      context,
    );
    expect(visits.map((v) => [v.id, v.week])).toEqual([
      [10, '2026-W45'],
      [11, '2026-W50'],
      [12, '2027-W01'],
      [13, '2027-W04'],
    ]);
  });

  it('moves the series: moved visits keep their offset, released ones hold their slot (D51)', () => {
    const visits = client.previewPlanVisits(plan, { kind: 'series', anchor: '2026-W46' }, context);
    expect(visits.slice(0, 4).map((v) => [v.id, v.due_week, v.week])).toEqual([
      [10, '2026-W46', '2026-W45'], // keeps its week, no second visit in W46
      [null, '2026-W50', '2026-W50'],
      [12, '2027-W01', '2027-W02'],
      [null, '2027-W05', '2027-W05'],
    ]);
  });

  it('gives the figures as if dropped', () => {
    const data = {
      current_week: '2026-W41',
      weeks: weeks.map((week) => ({ week })),
      capacity: { weekly: 20, by_category: { HVAC: 20 } },
      groups: [{ plans: [plan] }],
    };
    const before = client.previewFigures(
      data,
      1,
      { kind: 'occurrence', id: 11, week: '2026-W49' },
      CATEGORIES,
    );
    const after = client.previewFigures(
      data,
      1,
      { kind: 'occurrence', id: 11, week: '2026-W50' },
      CATEGORIES,
    );
    const at = (p, week) => p.figures.find((f) => f.week === week).planned_hours;
    expect([at(before, '2026-W49'), at(before, '2026-W50')]).toEqual([10, 0]);
    expect([at(after, '2026-W49'), at(after, '2026-W50')]).toEqual([0, 10]);
    expect(after.tiles.workload.peak_load).toBe(0.5);
  });
});
