// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Moving visits on the year planner (Phase 18): drag, keyboard, refusals, live impact.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allowedRange,
  attachPlannerEditing,
  evaluateMove,
  timelineIndex,
} from '../assets/js/planner-editing.js';
import { renderPlanner } from '../assets/js/planning.js';
import { addWeeks } from '../assets/js/planning-rules.js';

const WEEKS = Array.from({ length: 12 }, (_, i) => addWeeks('2026-W41', i)); // W41 … W52
const plan = (o = {}) => ({
  id: 1,
  code: 'PM-0001',
  title: 'Quarterly service',
  type: 'PREVENTIVE',
  category: 'HVAC',
  site: 'Lyon',
  estimated_hours: 10,
  frequency_weeks: 4,
  anchor_week: '2026-W42',
  tolerance_weeks: 1,
  performed_by: 'INTERNAL',
  end_week: null,
  version: 3,
  warnings: [],
  occurrences: [
    {
      id: 10,
      due_week: '2026-W42',
      week: '2026-W42',
      status: 'RELEASED',
      version: 2,
      warnings: [],
      work_order: { id: 5, number: 'WO-2026-00005' },
    },
    { id: 11, due_week: '2026-W46', week: '2026-W46', status: 'PLANNED', version: 1, warnings: [] },
    { id: 12, due_week: '2026-W50', week: '2026-W50', status: 'PLANNED', version: 4, warnings: [] },
  ],
  ...o,
});
const timeline = (plans = [plan()]) => ({
  from: WEEKS[0],
  to: WEEKS.at(-1),
  current_week: '2026-W41',
  weeks: WEEKS.map((week) => ({ week, monday: '2026-10-05' })),
  settings: { reserve_percent: 30, daily_hours: 7, max_block_hours: 3.5, release_weeks_ahead: 4 },
  capacity: { weekly: 20, by_category: { HVAC: 20 } },
  figures: WEEKS.map((week) => ({
    week,
    planned_hours: 0,
    by_category: {},
    capacity: 20,
    load: 0,
    level: 'OK',
    contractor_visits: 0,
  })),
  tiles: {
    workload: { average_load: 0, peak_load: 0, weeks_over: 0, weeks_tight: 0 },
    trade_balance: [],
    peak_week: null,
    site_spread: { average: 0, peak: 0 },
    contractor_visits: { total: 0, peak: 0, peak_week: null },
  },
  blocked_weeks: [],
  groups: [{ key: 'Lyon', site: 'Lyon', hours: WEEKS.map(() => 0), plans }],
});

describe('evaluateMove', () => {
  const data = timeline();
  const index = timelineIndex(data);

  it('moves one visit within its tolerance, refuses beyond it', () => {
    expect(
      evaluateMove(data, index, { occurrenceId: 12, kind: 'occurrence', week: '2026-W51' }),
    ).toEqual({
      same: false,
      blocker: null,
      move: {
        kind: 'occurrence',
        planId: 1,
        code: 'PM-0001',
        id: 12,
        week: '2026-W51',
        from: '2026-W50',
        version: 4,
      },
    });
    const refused = evaluateMove(data, index, {
      occurrenceId: 12,
      kind: 'occurrence',
      week: '2026-W52',
    });
    expect(refused.blocker.message).toBe(
      "Week 52 is outside this visit's tolerance of ± 1 week around week 50.",
    );
  });

  it('moves the series by the same number of weeks as the visit dragged', () => {
    const { move, blocker } = evaluateMove(data, index, {
      occurrenceId: 11,
      kind: 'series',
      week: '2026-W48',
    });
    expect(blocker).toBe(null);
    expect(move).toEqual({
      kind: 'series',
      planId: 1,
      code: 'PM-0001',
      anchor: '2026-W44',
      from: '2026-W42',
      version: 3,
    });
  });

  it('gives the allowed weeks as column indexes', () => {
    const p = index.plans.get(1);
    expect(allowedRange(data, p, index.visits.get(12), 'occurrence')).toEqual({ from: 8, to: 10 });
    expect(allowedRange(data, p, index.visits.get(11), 'series')).toEqual({ from: 0, to: 11 });
  });
});

describe('attachPlannerEditing', () => {
  let container;
  let calls;
  let detach;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    const data = timeline();
    const view = renderPlanner(container, {
      data,
      filters: {},
      sites: [],
      canEdit: true,
      isAdmin: false,
      onFilter: () => {},
      onOpen: vi.fn(),
    });
    calls = {
      preview: vi.fn((move) => ({ figures: data.figures, move })),
      cancel: vi.fn(),
      commit: vi.fn(),
      refuse: vi.fn(),
      announce: vi.fn(),
    };
    detach = attachPlannerEditing(container, {
      data,
      onPreview: (move) => {
        view.preview({ figures: data.figures, tiles: data.tiles });
        return calls.preview(move);
      },
      onCancel: calls.cancel,
      onCommit: calls.commit,
      onRefuse: calls.refuse,
      announce: calls.announce,
    });
    // jsdom lays nothing out: give the week cells of each row their place (48 px a week).
    for (const row of container.querySelectorAll('tr.plan-row')) {
      row.querySelectorAll('td.week-cell').forEach((cell, i) => {
        cell.getBoundingClientRect = () => ({
          left: 300 + i * 48,
          right: 348 + i * 48,
          top: 0,
          bottom: 48,
        });
      });
    }
  });

  const chip = (id) => container.querySelector(`.chip[data-occurrence="${id}"]`);
  const key = (el, k, o = {}) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }),
    );
  const pointer = (el, type, x) =>
    el.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10, button: 0 }),
    );

  it('moves a visit with Shift + arrows, showing a ghost and the figures, then Enter', () => {
    chip(12).focus();
    key(chip(12), 'ArrowRight', { shiftKey: true });
    expect(calls.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'occurrence', id: 12, week: '2026-W51' }),
    );
    expect(container.querySelector('.chip-ghost').closest('td').dataset.index).toBe('10');
    expect(chip(12).classList.contains('is-leaving')).toBe(true);
    expect(container.querySelectorAll('tr.is-moving td.is-allowed')).toHaveLength(3);
    expect(calls.announce).toHaveBeenLastCalledWith(
      expect.stringContaining('Visit to Week 51, 2026'),
    );
    key(chip(12), 'Enter');
    expect(calls.commit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, week: '2026-W51', from: '2026-W50' }),
    );
    expect(container.querySelector('.chip-ghost')).toBe(null);
    expect(container.querySelector('tr.is-moving')).toBe(null);
  });

  it('refuses a drop beyond the tolerance with the reason, and Escape cancels', () => {
    chip(12).focus();
    key(chip(12), 'ArrowRight', { shiftKey: true });
    key(chip(12), 'ArrowRight', { shiftKey: true }); // week 52: beyond ± 1
    expect(container.querySelector('td.is-drop-refused').dataset.index).toBe('11');
    expect(calls.announce).toHaveBeenLastCalledWith(expect.stringContaining('outside this visit'));
    key(chip(12), 'Enter');
    expect(calls.commit).not.toHaveBeenCalled();
    expect(calls.refuse).toHaveBeenCalledWith(
      "Week 52 is outside this visit's tolerance of ± 1 week around week 50.",
    );

    key(chip(12), 'ArrowLeft', { shiftKey: true });
    key(chip(12), 'Escape');
    expect(calls.commit).not.toHaveBeenCalled();
    expect(calls.announce).toHaveBeenLastCalledWith('Move cancelled.');
    // Ghosts are pictures only: they carry no visit id.
    key(chip(12), 'ArrowLeft', { shiftKey: true });
    expect(container.querySelectorAll('.chip[data-occurrence="12"]')).toHaveLength(1);
    expect(container.querySelector('.chip-ghost').getAttribute('aria-hidden')).toBe('true');
  });

  it('moves the series from the first planned visit, or with Alt from any', () => {
    chip(11).focus();
    key(chip(11), 'ArrowRight', { shiftKey: true });
    expect(calls.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'series', anchor: '2026-W43' }),
    );
    // The visit of week 42 has its work order: it stays and holds the slot of week 43 (D51),
    // so the series goes on in weeks 47 and 51.
    expect(
      [...container.querySelectorAll('.chip-ghost')].map((g) => g.closest('td').dataset.index),
    ).toEqual(['6', '10']);
    key(chip(11), 'Escape');
    chip(12).focus();
    key(chip(12), 'ArrowLeft', { shiftKey: true, altKey: true });
    expect(calls.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'series', anchor: '2026-W41' }),
    );
  });

  it('never moves a released visit; arrows move the focus between visits', () => {
    chip(10).focus();
    key(chip(10), 'ArrowRight', { shiftKey: true });
    expect(calls.preview).not.toHaveBeenCalled();
    expect(calls.announce).toHaveBeenLastCalledWith(expect.stringContaining('cannot be moved'));
    key(chip(10), 'ArrowRight');
    expect(document.activeElement).toBe(chip(11));
  });

  it('drags with the pointer and does not open the panel on release', () => {
    const start = 300 + 9 * 48 + 20; // week 50
    pointer(chip(12), 'pointerdown', start);
    pointer(chip(12), 'pointermove', start + 3); // under the threshold: still a click
    expect(calls.preview).not.toHaveBeenCalled();
    pointer(chip(12), 'pointermove', start + 48); // week 51
    expect(calls.preview).toHaveBeenLastCalledWith(expect.objectContaining({ week: '2026-W51' }));
    pointer(chip(12), 'pointerup', start + 48);
    expect(calls.commit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, week: '2026-W51' }),
    );
    const opened = vi.fn();
    container.addEventListener('click', opened);
    chip(12).click(); // the click that ends a drag
    expect(opened).not.toHaveBeenCalled();
  });

  it('detaches cleanly', () => {
    detach();
    chip(12).focus();
    key(chip(12), 'ArrowRight', { shiftKey: true });
    expect(calls.preview).not.toHaveBeenCalled();
  });
});
