// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Balancing assistant (Phase 20): targets within each plan's rules, and a greedy proposal that
// never raises the peak.
import { describe, expect, it } from 'vitest';
import { addWeeks } from '../../src/lib/iso-week.js';
import { proposalTargets, suggestMoves } from '../../src/rules/balancing.js';

const CURRENT = '2026-W41';
const WEEKS = Array.from({ length: 12 }, (_, i) => addWeeks(CURRENT, i)); // W41 … W52

let ids = 0;
const visit = (week, o = {}) => ({
  id: ++ids,
  week,
  due_week: week,
  status: 'PLANNED',
  version: 1,
  ...o,
});
const plan = (o = {}) => ({
  id: ++ids,
  code: 'PM-0001',
  type: 'PREVENTIVE',
  category: 'HVAC',
  site: 'Lyon',
  estimated_hours: 10,
  tolerance_weeks: 2,
  season_from_week: null,
  season_to_week: null,
  performed_by: 'INTERNAL',
  occurrences: [],
  ...o,
});
const timeline = (plans, o = {}) => ({
  weeks: WEEKS.map((week) => ({ week })),
  current_week: CURRENT,
  capacity: { weekly: 20, by_category: { HVAC: 20 } },
  settings: { release_weeks_ahead: 1 },
  blocked_weeks: [],
  groups: [{ plans }],
  ...o,
});
// Release horizon of 1 week: W41 and W42 already have their work orders.
const context = { weeks: WEEKS, currentWeek: CURRENT, releaseWeeksAhead: 1, blockedWeeks: [] };

describe('proposalTargets (BR-B2)', () => {
  it('stays within the tolerance, after the release horizon, never on another visit of the plan', () => {
    const o = visit('2026-W44');
    const p = plan({ occurrences: [o, visit('2026-W46')] });
    // W42 is in the release horizon; W46 holds the plan's next visit.
    expect(proposalTargets(p, o, context)).toEqual(['2026-W43', '2026-W45']);
    const near = visit('2026-W43');
    expect(proposalTargets(plan({ occurrences: [near] }), near, context)).toEqual([
      '2026-W44',
      '2026-W45',
    ]);
  });

  it('moves a regulatory visit earlier only (BR-P3)', () => {
    const o = visit('2026-W45');
    const p = plan({ type: 'REGULATORY', occurrences: [o] });
    expect(proposalTargets(p, o, context)).toEqual(['2026-W43', '2026-W44']);
  });

  it('keeps visits inside their season and out of blocked weeks', () => {
    const o = visit('2026-W45');
    const seasonal = plan({ season_from_week: 44, season_to_week: 46, occurrences: [o] });
    expect(proposalTargets(seasonal, o, context)).toEqual(['2026-W44', '2026-W46']);
    const p = plan({ occurrences: [o] });
    const blocked = [
      { week: '2026-W46', site: 'Lyon' },
      { week: '2026-W44', site: null },
      { week: '2026-W43', site: 'Saclay' },
    ];
    expect(proposalTargets(p, o, { ...context, blockedWeeks: blocked })).toEqual([
      '2026-W43',
      '2026-W47',
    ]);
  });

  it('only proposes weeks shown', () => {
    const o = visit('2026-W52');
    expect(proposalTargets(plan({ occurrences: [o] }), o, context)).toEqual([
      '2026-W50',
      '2026-W51',
    ]);
  });
});

describe('suggestMoves (BR-B1, BR-B3)', () => {
  it('spreads a week over capacity, lowering its peak', () => {
    const a = plan({ occurrences: [visit('2026-W45')] });
    const b = plan({ occurrences: [visit('2026-W45')] });
    const c = plan({ occurrences: [visit('2026-W45')] });
    const moves = suggestMoves(timeline([a, b, c]));
    // 30 h in a 20 h week: two visits leave it, to two different weeks.
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.from === '2026-W45')).toBe(true);
    expect(new Set(moves.map((m) => m.to)).size).toBe(2);
    for (const m of moves) {
      expect(m.to >= '2026-W43' && m.to <= '2026-W47').toBe(true);
    }
  });

  it('proposes nothing for a balanced year', () => {
    const plans = WEEKS.slice(0, 4).map((w) => plan({ occurrences: [visit(w)] }));
    expect(suggestMoves(timeline(plans))).toEqual([]);
  });

  it('never moves visits with a work order, skipped ones, contractor ones or past ones', () => {
    const plans = [
      plan({ occurrences: [visit('2026-W45', { status: 'RELEASED' })] }),
      plan({ occurrences: [visit('2026-W45', { status: 'RELEASED' })] }),
      plan({ occurrences: [visit('2026-W45', { status: 'SKIPPED', skip_reason: 'x' })] }),
      plan({ performed_by: 'CONTRACTOR', occurrences: [visit('2026-W45')] }),
    ];
    expect(suggestMoves(timeline(plans))).toEqual([]);
  });

  it('never fills a week above the one it relieves, so the peak cannot rise', () => {
    // 15 h and 10 h: moving the 10 h visit would make the other week 25 h.
    const big = plan({ estimated_hours: 15, tolerance_weeks: 0, occurrences: [visit('2026-W44')] });
    const small = plan({ occurrences: [visit('2026-W45')] });
    const moves = suggestMoves(timeline([big, small]));
    expect(moves.some((m) => m.to === '2026-W44')).toBe(false);
  });

  it('balances the trades too: a trade over its capacity spreads first', () => {
    const elec = (w) =>
      plan({ category: 'ELECTRICAL', estimated_hours: 4, occurrences: [visit(w)] });
    const data = timeline([elec('2026-W45'), elec('2026-W45'), elec('2026-W45')], {
      capacity: { weekly: 40, by_category: { ELECTRICAL: 5, HVAC: 35 } },
    });
    // 12 h of a 40 h week is light, but 12 h of electrical work against 5 h is not.
    expect(suggestMoves(data).length).toBeGreaterThan(0);
  });

  it('moves each visit once at most, within the limit, the same way every time', () => {
    const plans = Array.from({ length: 10 }, () => plan({ occurrences: [visit('2026-W45')] }));
    const moves = suggestMoves(timeline(plans), { maxMoves: 3 });
    expect(moves).toHaveLength(3);
    expect(new Set(moves.map((m) => m.occurrence_id)).size).toBe(3);
    expect(suggestMoves(timeline(plans), { maxMoves: 3 })).toEqual(moves);
  });

  it('keeps two visits of a plan out of the same week', () => {
    const p = plan({ occurrences: [visit('2026-W45'), visit('2026-W46')] });
    const other = plan({
      estimated_hours: 30,
      tolerance_weeks: 0,
      occurrences: [visit('2026-W45')],
    });
    const moves = suggestMoves(timeline([p, other]));
    const weeks = p.occurrences.map(
      (o) => moves.find((m) => m.occurrence_id === o.id)?.to ?? o.week,
    );
    expect(new Set(weeks).size).toBe(2);
  });
});
