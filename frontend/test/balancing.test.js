// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Balancing assistant (Phase 20): route, request body, figures for the moves ticked, the panel
// and the ghost chips of the proposal.
import { describe, expect, it, vi } from 'vitest';
import { CATEGORIES } from '../assets/js/enums.js';
import { proposalSummary, renderSuggestionsPanel } from '../assets/js/plan-panel.js';
import { renderPlanner, suggestionsBody } from '../assets/js/planning.js';
import { addWeeks, previewFigures, previewMoves } from '../assets/js/planning-rules.js';
import { parseRoute } from '../assets/js/router.js';

const WEEKS = Array.from({ length: 12 }, (_, i) => addWeeks('2026-W41', i));
const visit = (id, week) => ({
  id,
  due_week: week,
  week,
  status: 'PLANNED',
  version: 1,
  warnings: [],
});
const plan = (id, visits) => ({
  id,
  code: `PM-000${id}`,
  title: `Plan ${id}`,
  type: 'PREVENTIVE',
  category: 'HVAC',
  site: 'Lyon',
  estimated_hours: 10,
  frequency_weeks: 4,
  anchor_week: visits[0].week,
  tolerance_weeks: 1,
  performed_by: 'INTERNAL',
  end_week: null,
  version: 1,
  warnings: [],
  occurrences: visits,
});
function timeline() {
  const data = {
    from: WEEKS[0],
    to: WEEKS.at(-1),
    current_week: '2026-W41',
    weeks: WEEKS.map((week) => ({ week, monday: '2026-10-05' })),
    settings: { reserve_percent: 30, daily_hours: 7, max_block_hours: 3.5, release_weeks_ahead: 4 },
    capacity: { weekly: 20, by_category: { HVAC: 20 } },
    blocked_weeks: [],
    groups: [
      {
        key: 'Lyon',
        site: 'Lyon',
        hours: WEEKS.map(() => 0),
        plans: [
          plan(1, [visit(11, '2026-W45')]),
          plan(2, [visit(21, '2026-W45')]),
          plan(3, [visit(31, '2026-W45')]),
        ],
      },
    ],
  };
  return { ...data, ...previewMoves(data, [], CATEGORIES) };
}

describe('route and request', () => {
  it('opens the proposal as a planner panel, keeping the filters', () => {
    expect(parseRoute('/planning/suggestions', '?site=Lyon&year=2027')).toEqual({
      name: 'suggestions',
      page: 1,
      filters: { site: 'Lyon', year: '2027' },
    });
    expect(parseRoute('/planning/suggestions/x', '').name).toBe('notFound');
  });

  it('sends the range and filters of the planner, without the grouping', () => {
    expect(
      suggestionsBody({ year: '2027', group: 'category', category: 'HVAC', q: 'pump' }),
    ).toEqual({ year: 2027, category: 'HVAC', q: 'pump' });
    expect(suggestionsBody({ from: '2026-W45', site: 'Lyon|Saclay' })).toEqual({
      from: '2026-W45',
      site: 'Lyon|Saclay',
    });
    expect(suggestionsBody({})).toEqual({});
  });
});

describe('figures for the moves ticked', () => {
  it('match the live preview of a single move', () => {
    const data = timeline();
    const one = previewMoves(data, [{ occurrence_id: 21, to: '2026-W46' }], CATEGORIES);
    const live = previewFigures(
      data,
      2,
      { kind: 'occurrence', id: 21, week: '2026-W46' },
      CATEGORIES,
    );
    expect(one).toEqual(live);
  });

  it('lower the peak when two visits leave the week over capacity', () => {
    const data = timeline();
    expect(data.tiles.workload.peak_load).toBe(1.5);
    const after = previewMoves(
      data,
      [
        { occurrence_id: 21, to: '2026-W44' },
        { occurrence_id: 31, to: '2026-W46' },
      ],
      CATEGORIES,
    );
    expect(after.tiles.workload.peak_load).toBe(0.5);
    const summary = proposalSummary(data, after, data.capacity.by_category);
    expect(summary[0]).toEqual({
      label: 'Peak week load',
      before: '150%',
      after: '50%',
      better: true,
    });
    expect(summary[1]).toMatchObject({ before: '1', after: '0', better: true });
    // HVAC alone: 30 h against its 20 h a week, then 10 h.
    expect(summary[3]).toEqual({
      label: 'Busiest week of one trade',
      before: '150%',
      after: '50%',
      better: true,
    });
  });
});

const proposal = (data) => ({
  moves: [
    {
      occurrence_id: 21,
      plan_id: 2,
      code: 'PM-0002',
      title: 'Plan 2',
      type: 'PREVENTIVE',
      category: 'HVAC',
      estimated_hours: 10,
      from: '2026-W45',
      to: '2026-W44',
      due_week: '2026-W45',
      version: 1,
    },
    {
      occurrence_id: 31,
      plan_id: 3,
      code: 'PM-0003',
      title: 'Plan 3',
      type: 'REGULATORY',
      category: 'HVAC',
      estimated_hours: 10,
      from: '2026-W45',
      to: '2026-W46',
      due_week: '2026-W45',
      version: 1,
    },
  ],
  before: { figures: data.figures, tiles: data.tiles },
});

describe('the proposal panel', () => {
  const render = (selected, overrides = {}) => {
    const container = document.createElement('div');
    const data = timeline();
    const p = proposal(data);
    const kept = p.moves.filter((m) => selected.has(m.occurrence_id));
    const options = {
      proposal: p,
      after: previewMoves(data, kept, CATEGORIES),
      selected,
      currentWeek: '2026-W41',
      capacityByCategory: data.capacity.by_category,
      loadOf: (week) => data.figures.find((f) => f.week === week)?.load ?? null,
      onToggle: vi.fn(),
      onToggleAll: vi.fn(),
      onAccept: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    };
    renderSuggestionsPanel(container, options);
    return { container, options };
  };

  it('lists the moves with their weeks and loads, all ticked, and the figures before → after', () => {
    const { container } = render(new Set([21, 31]));
    const items = [...container.querySelectorAll('.proposal-list li')].map((li) => li.textContent);
    expect(items[0]).toContain('PM-0002 · Week 45 → Week 44');
    expect(items[0]).toContain('Load now: Week 45 150%, Week 44 0%');
    expect(items[1]).toContain('§ regulatory');
    expect([...container.querySelectorAll('.proposal-list input')].every((i) => i.checked)).toBe(
      true,
    );
    const peakRow = container.querySelector('.proposal-summary tbody tr');
    expect(peakRow.textContent).toBe('Peak week load150%50% (lower)');
    expect(container.querySelector('.button-primary').textContent).toBe('Accept 2 moves');
  });

  it('accepts some: unticked moves are not counted, nothing ticked disables Accept', () => {
    const { container, options } = render(new Set([21]));
    expect(container.querySelector('.button-primary').textContent).toBe('Accept 1 move');
    const box = container.querySelector('#proposal-31');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(options.onToggle).toHaveBeenCalledWith(31, true);
    container.querySelector('.button-primary').click();
    expect(options.onAccept).toHaveBeenCalled();
    const none = render(new Set());
    expect(none.container.querySelector('.button-primary').disabled).toBe(true);
    const discard = [...none.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Discard',
    );
    discard.click();
    expect(none.options.onClose).toHaveBeenCalled();
  });

  it('says so when there is nothing to propose', () => {
    const { container } = render(new Set(), {
      proposal: { moves: [], before: { figures: [], tiles: timeline().tiles } },
    });
    expect(container.textContent).toContain('already as smooth as the plans allow');
    expect(container.querySelector('.button-primary')).toBeNull();
  });
});

describe('ghost chips of the proposal', () => {
  it('show where each visit would go, fade the visit, and are replaced by the next proposal', () => {
    const container = document.createElement('div');
    const data = timeline();
    const view = renderPlanner(container, {
      data,
      filters: {},
      sites: ['Lyon'],
      canEdit: true,
      isAdmin: false,
      onFilter: vi.fn(),
      onOpen: vi.fn(),
    });
    const p = proposal(data);
    view.propose(p.moves);
    const ghostIn = (planId, week) =>
      container.querySelector(
        `tr[data-plan="${planId}"] td.week-cell[data-index="${WEEKS.indexOf(week)}"] .chip-ghost`,
      );
    expect(ghostIn(2, '2026-W44')).not.toBeNull();
    expect(ghostIn(3, '2026-W46')).not.toBeNull();
    expect(ghostIn(2, '2026-W44').getAttribute('aria-hidden')).toBe('true');
    expect(
      container.querySelector('.chip[data-occurrence="21"]').classList.contains('is-leaving'),
    ).toBe(true);
    view.propose([p.moves[1]]);
    expect(ghostIn(2, '2026-W44')).toBeNull();
    expect(
      container.querySelector('.chip[data-occurrence="21"]').classList.contains('is-leaving'),
    ).toBe(false);
    expect(container.querySelectorAll('.chip-ghost')).toHaveLength(1);
  });

  it('offers "Suggest a smoother plan" to supervisors and admins only', () => {
    const container = document.createElement('div');
    const options = {
      data: timeline(),
      filters: { site: 'Lyon' },
      sites: [],
      isAdmin: false,
      onFilter: vi.fn(),
      onOpen: vi.fn(),
    };
    renderPlanner(container, { ...options, canEdit: true });
    const link = [...container.querySelectorAll('a')].find(
      (a) => a.textContent === 'Suggest a smoother plan',
    );
    expect(link.getAttribute('href')).toBe('/planning/suggestions?site=Lyon');
    renderPlanner(container, { ...options, canEdit: false });
    expect(container.textContent).not.toContain('Suggest a smoother plan');
  });
});
