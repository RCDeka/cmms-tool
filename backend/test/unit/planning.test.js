import { describe, expect, it } from 'vitest';
import { weekRange } from '../../src/lib/iso-week.js';
import {
  allowedWeeks,
  defaultTolerance,
  floatingAnchor,
  inSeason,
  isBlocked,
  isSeriesWeek,
  loadLevel,
  moveBlocker,
  nextPlanCode,
  occurrenceWarnings,
  planProblems,
  planWarnings,
  planningTiles,
  releaseDueDate,
  releasedWeekBlocker,
  seriesShift,
  seriesWeeks,
  weeklyCapacity,
  weeklyFigures,
} from '../../src/rules/planning.js';

const SETTINGS = { daily_hours: 7, reserve_percent: 30, max_block_hours: 3.5 };

describe('occurrence series (BR-P1)', () => {
  const quarterly = { anchor_week: '2026-W42', frequency_weeks: 13, end_week: null };

  it('repeats the anchor every frequency weeks', () => {
    expect(seriesWeeks(quarterly, '2026-W41', '2027-W40')).toEqual([
      '2026-W42',
      '2027-W02',
      '2027-W15',
      '2027-W28',
    ]);
  });

  it('starts at the first visit not before the range, keeping the series aligned', () => {
    // Anchor in the past: the series goes on from today, on its own weeks.
    const old = { ...quarterly, anchor_week: '2026-W10' };
    expect(seriesWeeks(old, '2026-W41', '2027-W10')).toEqual(['2026-W49', '2027-W09']);
    expect(seriesWeeks(old, '2026-W49', '2026-W49')).toEqual(['2026-W49']);
  });

  it('stops at the end week', () => {
    expect(seriesWeeks({ ...quarterly, end_week: '2027-W15' }, '2026-W41', '2027-W40')).toEqual([
      '2026-W42',
      '2027-W02',
      '2027-W15',
    ]);
    expect(seriesWeeks({ ...quarterly, end_week: '2026-W30' }, '2026-W41', '2027-W40')).toEqual([]);
  });

  it('defaults the tolerance to a quarter of the period, at most 8 weeks', () => {
    expect(defaultTolerance(1)).toBe(0);
    expect(defaultTolerance(4)).toBe(1);
    expect(defaultTolerance(13)).toBe(3);
    expect(defaultTolerance(52)).toBe(8);
    expect(defaultTolerance(104)).toBe(8);
  });
});

describe('warnings (BR-P8)', () => {
  it('flags visits longer than the longest block', () => {
    expect(planWarnings({ estimated_hours: 3.5 }, SETTINGS)).toEqual([]);
    expect(planWarnings({ estimated_hours: 4 }, SETTINGS)).toEqual(['LONG_VISIT']);
  });

  it('checks seasons, wrapping over the new year', () => {
    expect(inSeason('2026-W20', null, null)).toBe(true);
    expect(inSeason('2026-W20', 14, 22)).toBe(true);
    expect(inSeason('2026-W23', 14, 22)).toBe(false);
    expect(inSeason('2026-W50', 45, 10)).toBe(true);
    expect(inSeason('2027-W05', 45, 10)).toBe(true);
    expect(inSeason('2027-W20', 45, 10)).toBe(false);
    const cooling = { season_from_week: 14, season_to_week: 22 };
    expect(occurrenceWarnings(cooling, '2027-W30')).toEqual(['OUT_OF_SEASON']);
    expect(occurrenceWarnings(cooling, '2027-W15')).toEqual([]);
  });
});

describe('capacity and load (BR-Y2, BR-Y3)', () => {
  const people = [
    { specialty: 'HVAC', site: 'Paris' },
    { specialty: 'ELECTRICAL', site: 'Lyon' },
    { specialty: 'ELECTRICAL', site: 'Paris' },
    { specialty: null, site: 'Paris' }, // a supervisor without a trade
  ];

  it('counts every person 5 days × daily hours, minus the reserve, per trade and site', () => {
    const capacity = weeklyCapacity(people, SETTINGS);
    expect(capacity.total).toBeCloseTo(4 * 24.5);
    expect(capacity.by_category).toEqual({ HVAC: 24.5, ELECTRICAL: 49, GENERAL: 24.5 });
    expect(capacity.by_site).toEqual({ Paris: 73.5, Lyon: 24.5 });
  });

  it('follows the reserve set by the administrators (P16)', () => {
    expect(weeklyCapacity(people, { ...SETTINGS, reserve_percent: 20 }).total).toBeCloseTo(112);
    expect(weeklyCapacity(people, { ...SETTINGS, reserve_percent: 0 }).total).toBe(140);
  });

  it('classifies the load', () => {
    expect(loadLevel(null)).toBe(null);
    expect(loadLevel(0.5)).toBe('OK');
    expect(loadLevel(0.85)).toBe('TIGHT');
    expect(loadLevel(1)).toBe('TIGHT');
    expect(loadLevel(1.01)).toBe('OVER');
  });
});

describe('weekly figures and tiles (BR-Y1, BR-Y4)', () => {
  const weeks = weekRange('2026-W41', 3);
  const capacity = weeklyCapacity(
    [
      { specialty: 'HVAC', site: 'Paris' },
      { specialty: 'ELECTRICAL', site: 'Lyon' },
    ],
    { daily_hours: 7, reserve_percent: 0 },
  ); // 70 h a week
  const occ = (week, hours, extra = {}) => ({
    week,
    status: 'PLANNED',
    estimated_hours: hours,
    category: 'HVAC',
    site: 'Paris',
    performed_by: 'INTERNAL',
    ...extra,
  });
  const occurrences = [
    occ('2026-W41', 40),
    occ('2026-W41', 40, { category: 'ELECTRICAL', site: 'Lyon', status: 'RELEASED' }),
    occ('2026-W42', 7),
    occ('2026-W42', 50, { performed_by: 'CONTRACTOR' }),
    occ('2026-W42', 50, { performed_by: 'CONTRACTOR', site: 'Lyon' }),
    occ('2026-W43', 99, { status: 'SKIPPED' }),
    occ('2027-W10', 99), // outside the range
  ];
  const figures = weeklyFigures(weeks, occurrences, capacity);

  it('sums internal hours per week, trade and site; released ones included', () => {
    expect(figures[0]).toMatchObject({
      week: '2026-W41',
      planned_hours: 80,
      by_category: { HVAC: 40, ELECTRICAL: 40 },
      by_site: { Paris: 40, Lyon: 40 },
      capacity: 70,
      level: 'OVER',
      sites_visited: 2,
    });
    expect(figures[0].load).toBeCloseTo(80 / 70);
  });

  it('counts contractor visits apart, never in the load; skipped visits not at all', () => {
    expect(figures[1]).toMatchObject({ planned_hours: 7, contractor_visits: 2, level: 'OK' });
    expect(figures[2]).toMatchObject({ planned_hours: 0, contractor_visits: 0, load: 0 });
  });

  it('builds the tiles', () => {
    const tiles = planningTiles(figures, capacity, ['HVAC', 'ELECTRICAL', 'PLUMBING']);
    expect(tiles.workload.weeks_over).toBe(1);
    expect(tiles.workload.peak_load).toBeCloseTo(80 / 70);
    expect(tiles.workload.average_load).toBeCloseTo(87 / 70 / 3);
    expect(tiles.peak_week).toMatchObject({ week: '2026-W41', excess_hours: 10 });
    expect(tiles.trade_balance).toEqual([
      { category: 'HVAC', planned_hours: 47, capacity_hours: 105, load: 47 / 105 },
      { category: 'ELECTRICAL', planned_hours: 40, capacity_hours: 105, load: 40 / 105 },
    ]);
    expect(tiles.site_spread).toEqual({ average: 1, peak: 2 });
    expect(tiles.contractor_visits).toEqual({ total: 2, peak: 2, peak_week: '2026-W42' });
  });

  it('reports a trade without capacity with no load', () => {
    const tiles = planningTiles(
      weeklyFigures(weeks, [occ('2026-W41', 4, { category: 'PLUMBING' })], capacity),
      capacity,
      ['PLUMBING'],
    );
    expect(tiles.trade_balance[0]).toEqual({
      category: 'PLUMBING',
      planned_hours: 4,
      capacity_hours: 0,
      load: null,
    });
  });
});

describe('release and floating plans', () => {
  it('makes a released work order due on the Friday, or today when late', () => {
    expect(releaseDueDate('2026-10-16', '2026-10-04')).toBe('2026-10-16');
    expect(releaseDueDate('2026-10-02', '2026-10-04')).toBe('2026-10-04');
  });

  it('restarts a floating series from the closing week (BR-P5)', () => {
    const plan = { schedule_mode: 'FLOATING', frequency_weeks: 13 };
    expect(floatingAnchor(plan, '2026-W45')).toBe('2027-W05');
    expect(floatingAnchor({ ...plan, schedule_mode: 'FIXED' }, '2026-W45')).toBe(null);
  });
});

describe('plan creation rules', () => {
  const plan = {
    anchor_week: '2026-W42',
    end_week: null,
    season_from_week: null,
    season_to_week: null,
    performed_by: 'INTERNAL',
    supplier: null,
  };

  it('numbers plans PM-0001, PM-0002, …', () => {
    expect(nextPlanCode(null)).toBe('PM-0001');
    expect(nextPlanCode(59)).toBe('PM-0060');
    expect(nextPlanCode(10000)).toBe('PM-10001');
  });

  it('accepts a consistent plan', () => {
    expect(planProblems(plan)).toEqual({});
    expect(planProblems({ ...plan, end_week: '2026-W42' })).toEqual({});
    expect(planProblems({ ...plan, season_from_week: 45, season_to_week: 10 })).toEqual({});
  });

  it('refuses an end before the anchor, half a season, and an unnamed contractor', () => {
    expect(planProblems({ ...plan, end_week: '2026-W41' })).toHaveProperty('end_week');
    expect(planProblems({ ...plan, season_from_week: 14 })).toHaveProperty('season_to_week');
    expect(planProblems({ ...plan, season_to_week: 14 })).toHaveProperty('season_from_week');
    expect(planProblems({ ...plan, performed_by: 'CONTRACTOR' })).toHaveProperty('supplier');
    expect(
      planProblems({ ...plan, performed_by: 'CONTRACTOR', supplier: 'Coolair Services' }),
    ).toEqual({});
  });
});

describe('moving one visit (BR-P3, BR-P4)', () => {
  const plan = { type: 'PREVENTIVE', tolerance_weeks: 3, site: 'Lyon' };
  const occ = { due_week: '2026-W50', status: 'PLANNED' };
  const now = '2026-W41';

  it('allows the due week ± the tolerance, never the past', () => {
    expect(allowedWeeks(plan, occ, now)).toEqual({ from: '2026-W47', to: '2026-W53' });
    expect(allowedWeeks(plan, { due_week: '2026-W42' }, now)).toEqual({
      from: '2026-W41',
      to: '2026-W45',
    });
    for (const week of ['2026-W47', '2026-W50', '2026-W53']) {
      expect(moveBlocker(plan, occ, week, now)).toBe(null);
    }
  });

  it('refuses outside the tolerance, with the reason', () => {
    expect(moveBlocker(plan, occ, '2027-W01', now)).toEqual({
      rule: 'BR-P3',
      message: "Week 1 is outside this visit's tolerance of ± 3 weeks around week 50.",
    });
    expect(moveBlocker(plan, occ, '2026-W46', now).rule).toBe('BR-P3');
    expect(moveBlocker({ ...plan, tolerance_weeks: 0 }, occ, '2026-W49', now).message).toContain(
      '± 0 weeks',
    );
    expect(moveBlocker(plan, { due_week: '2026-W42' }, '2026-W40', now).message).toBe(
      'A visit cannot be moved into the past.',
    );
  });

  it('moves a regulatory visit earlier only', () => {
    const regulatory = { ...plan, type: 'REGULATORY' };
    expect(allowedWeeks(regulatory, occ, now)).toEqual({ from: '2026-W47', to: '2026-W50' });
    expect(moveBlocker(regulatory, occ, '2026-W48', now)).toBe(null);
    expect(moveBlocker(regulatory, occ, '2026-W51', now)).toEqual({
      rule: 'BR-P3',
      message: 'A regulatory visit can only move earlier: week 50 is its deadline.',
    });
  });

  it('never moves a released or skipped visit', () => {
    expect(moveBlocker(plan, { ...occ, status: 'RELEASED' }, '2026-W49', now).rule).toBe('BR-P4');
    expect(moveBlocker(plan, { ...occ, status: 'SKIPPED' }, '2026-W49', now).rule).toBe('BR-P7');
  });

  it('warns about blocked weeks for the site or every site', () => {
    const blocked = [
      { week: '2026-W52', site: null },
      { week: '2026-W51', site: 'Paris' },
    ];
    expect(isBlocked('2026-W52', 'Lyon', blocked)).toBe(true);
    expect(isBlocked('2026-W51', 'Lyon', blocked)).toBe(false);
    expect(isBlocked('2026-W51', 'Paris', blocked)).toBe(true);
    expect(occurrenceWarnings(plan, '2026-W52', blocked)).toEqual(['BLOCKED_WEEK']);
    expect(
      occurrenceWarnings(
        { ...plan, season_from_week: 14, season_to_week: 22 },
        '2026-W52',
        blocked,
      ),
    ).toEqual(['OUT_OF_SEASON', 'BLOCKED_WEEK']);
  });
});

describe('series weeks after a change (BR-P2, D51)', () => {
  const plan = { anchor_week: '2026-W50', frequency_weeks: 13, end_week: '2027-W40' };

  it('knows the weeks of the series', () => {
    expect(isSeriesWeek(plan, '2026-W50')).toBe(true);
    expect(isSeriesWeek(plan, '2027-W10')).toBe(true);
    expect(isSeriesWeek(plan, '2027-W11')).toBe(false);
    expect(isSeriesWeek(plan, '2026-W37')).toBe(false); // before the anchor
    expect(isSeriesWeek(plan, '2027-W49')).toBe(false); // after the end
  });

  it('shifts by the anchor move, unless the frequency changed', () => {
    expect(seriesShift(plan, { ...plan, anchor_week: '2026-W52' })).toBe(2);
    expect(seriesShift(plan, { ...plan, anchor_week: '2026-W48' })).toBe(-2);
    expect(seriesShift(plan, { ...plan, frequency_weeks: 26 })).toBe(0);
  });
});

describe('releasedWeekBlocker (BR-P4, D55)', () => {
  const occurrence = { due_week: '2026-W43' };

  it('lets the work order of a visit go to any week, outside its tolerance too', () => {
    const plan = { type: 'PREVENTIVE' };
    expect(releasedWeekBlocker(plan, occurrence, '2026-W50')).toBeNull();
    expect(releasedWeekBlocker(plan, occurrence, '2026-W40')).toBeNull();
  });

  it('keeps a week, and a regulatory visit by its deadline', () => {
    expect(releasedWeekBlocker({ type: 'PREVENTIVE' }, occurrence, null)?.rule).toBe('BR-P4');
    const regulatory = { type: 'REGULATORY' };
    expect(releasedWeekBlocker(regulatory, occurrence, '2026-W43')).toBeNull();
    expect(releasedWeekBlocker(regulatory, occurrence, '2026-W41')).toBeNull();
    expect(releasedWeekBlocker(regulatory, occurrence, '2026-W44')).toEqual({
      rule: 'BR-P3',
      message: 'A regulatory visit can only move earlier: week 43 is its deadline.',
    });
  });
});
