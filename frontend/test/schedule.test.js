// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Week scheduler and My week (Phase 19): routes, split proposal, the grid, drag and keyboard,
// the panels, and the week saved on the device for offline reading.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as DB from '../assets/js/db.js';
import { storesOf } from '../assets/js/db.js';
import { MY_WEEK_CACHE, readMyWeek, renderMyWeek, saveMyWeek } from '../assets/js/my-week.js';
import { protectedIds } from '../assets/js/preload.js';
import { parseRoute } from '../assets/js/router.js';
import { attachScheduleEditing, dropTarget } from '../assets/js/schedule-editing.js';
import { renderItemPanel, startOf } from '../assets/js/schedule-panel.js';
import {
  appointmentText,
  dayWarningTexts,
  formatDuration,
  hoursToSchedule,
  leftText,
  lockTimes,
  reorder,
  splitProposal,
} from '../assets/js/schedule-rules.js';
import {
  blockView,
  dayToShow,
  renderScheduler,
  scheduleSummaryText,
  scheduleUrl,
} from '../assets/js/schedule.js';
import { scheduledTexts } from '../assets/js/work-order-schedule.js';

const DAYS = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

describe('routes', () => {
  it('parses the scheduler, its panels and My week', () => {
    expect(parseRoute('/schedule', '')).toMatchObject({
      name: 'schedule',
      week: null,
      panel: null,
    });
    expect(parseRoute('/schedule', '?week=2026-W41')).toMatchObject({ week: '2026-W41' });
    expect(parseRoute('/schedule', '?week=41').week).toBeNull();
    expect(parseRoute('/schedule/work-orders/12', '?week=2026-W41').panel).toEqual({
      type: 'item',
      id: 12,
    });
    expect(parseRoute('/schedule/work-orders/12', '?person=4&day=2026-10-05').panel).toEqual({
      type: 'item',
      id: 12,
      person: 4,
      day: '2026-10-05',
    });
    expect(parseRoute('/schedule/blocks/7', '').panel).toEqual({ type: 'block', id: 7 });
    expect(parseRoute('/schedule/time', '?person=4&day=2026-10-05').panel).toEqual({
      type: 'time',
      person: 4,
      day: '2026-10-05',
    });
    expect(parseRoute('/schedule/capacity', '?person=4&day=2026-10-05').panel.type).toBe(
      'capacity',
    );
    expect(parseRoute('/schedule/time', '?person=4').name).toBe('notFound');
    expect(parseRoute('/schedule/blocks/x', '').name).toBe('notFound');
    expect(parseRoute('/schedule/blocks/1/2', '').name).toBe('notFound');
    expect(parseRoute('/my-week', '?week=2026-W41')).toMatchObject({
      name: 'myWeek',
      week: '2026-W41',
    });
    expect(parseRoute('/my-week/x', '').name).toBe('notFound');
  });

  it('builds URLs the router reads back', () => {
    const panels = [
      null,
      { type: 'item', id: 3 },
      { type: 'item', id: 3, person: 4, day: '2026-10-05' },
      { type: 'block', id: 9 },
      { type: 'time', person: 4, day: '2026-10-06' },
      { type: 'capacity', person: 5, day: '2026-10-07' },
    ];
    for (const panel of panels) {
      const url = new URL(scheduleUrl('2026-W41', panel), 'http://x');
      const route = parseRoute(url.pathname, url.search);
      expect(route).toMatchObject({ name: 'schedule', week: '2026-W41', panel });
    }
    expect(scheduleUrl()).toBe('/schedule');
  });
});

describe('rules of the interface', () => {
  it('proposes a 6 h job dropped on Monday as 3 h 30 + 2 h 30 (BR-S1)', () => {
    expect(splitProposal(6, DAYS[0], DAYS, 3.5)).toEqual([
      { day: '2026-10-05', hours: 3.5 },
      { day: '2026-10-06', hours: 2.5 },
    ]);
    expect(splitProposal(8, DAYS[0], DAYS, 3.5).map((b) => b.hours)).toEqual([3.5, 3.5, 1]);
    // Dropped on Friday: the week runs out, the rest stays on Friday.
    expect(splitProposal(6, DAYS[4], DAYS, 3.5)).toEqual([
      { day: '2026-10-09', hours: 3.5 },
      { day: '2026-10-09', hours: 2.5 },
    ]);
    // Rounded up to the half hour (P4).
    expect(splitProposal(1.2, DAYS[0], DAYS, 3.5)).toEqual([{ day: DAYS[0], hours: 1.5 }]);
  });

  it('gives what is left on a drop, one block when nothing is left, nothing without estimate', () => {
    const item = (o) => ({ needed_hours: 6, hours_left: 6, ...o });
    expect(hoursToSchedule(item(), 3.5)).toBe(6);
    expect(hoursToSchedule(item({ hours_left: 0.5 }), 3.5)).toBe(0.5);
    expect(hoursToSchedule(item({ hours_left: 0 }), 3.5)).toBe(3.5);
    expect(hoursToSchedule(item({ needed_hours: 2, hours_left: 0 }), 3.5)).toBe(2);
    expect(hoursToSchedule(item({ needed_hours: null, hours_left: null }), 3.5)).toBeNull();
  });

  it('writes durations and what is left: "30 min left" (BR-S2)', () => {
    expect(formatDuration(0)).toBe('0 h');
    expect(formatDuration(0.5)).toBe('30 min');
    expect(formatDuration(7)).toBe('7 h');
    expect(formatDuration(8.5)).toBe('8 h 30');
    expect(leftText({ needed_hours: 2, hours_left: 0.5 })).toBe('30 min left');
    expect(leftText({ needed_hours: 2, hours_left: 0 })).toBe('Fully scheduled');
    expect(leftText({ needed_hours: null, hours_left: null })).toBe('No estimate yet');
  });

  it('writes the warnings of a day (BR-S5, BR-S8, BR-S10)', () => {
    expect(
      dayWarningTexts({
        total: 8.5,
        capacity: 7,
        sites: ['Lyon', 'Saclay'],
        warnings: ['OVER_CAPACITY', 'SEVERAL_SITES'],
      }),
    ).toEqual(['Over capacity: 8 h 30 / 7 h', '2 sites: add travel time']);
    expect(dayWarningTexts({ total: 2, capacity: 0, sites: [], warnings: ['ABSENT'] })).toEqual([
      'Work on a day off',
    ]);
  });

  it('tells a technician how many sites, without asking them to add travel time (M6)', () => {
    const day = { total: 4, capacity: 7, sites: ['Lyon', 'Saclay'], warnings: ['SEVERAL_SITES'] };
    expect(dayWarningTexts(day, { canAddTravel: false })).toEqual(['2 sites on this day']);
  });

  it('writes appointments and offers half-hour start times', () => {
    expect(appointmentText('10:00', 2)).toBe('10:00–12:00');
    expect(appointmentText('09:30', 1.5)).toBe('09:30–11:00');
    const times = lockTimes(2);
    expect(times[0]).toBe('06:00');
    expect(times).toContain('10:00');
    expect(times.at(-1)).toBe('20:00');
  });

  it('reorders a day, appointments staying first (BR-S7)', () => {
    const blocks = [
      { id: 1, locked_start: '10:00' },
      { id: 2, locked_start: null },
      { id: 3, locked_start: null },
    ];
    expect(reorder(blocks, 3, -1)).toEqual([1, 3, 2]);
    expect(reorder(blocks, 2, 1)).toEqual([1, 3, 2]);
    expect(reorder(blocks, 2, -1)).toBeNull();
    expect(reorder(blocks, 3, 1)).toBeNull();
    expect(reorder(blocks, 1, 1)).toBeNull();
  });
});

// A week as GET /api/schedule answers it.
const lock = { id: 2, first_name: 'Paul', last_name: 'Martin' };
const wo = (id, o = {}) => ({
  id,
  number: `WO-2026-${String(id).padStart(5, '0')}`,
  title: `Job ${id}`,
  site: 'Lyon',
  building: 'Tower A',
  location: null,
  status: 'OPEN',
  priority: 'NORMAL',
  category: 'HVAC',
  type: 'CORRECTIVE',
  estimated_hours: 2,
  assignee_id: 4,
  ...o,
});
const day = (date, o = {}) => ({
  day: date,
  capacity: 7,
  total: 0,
  override: null,
  sites: [],
  warnings: [],
  ...o,
});
function weekData({ saturday = false } = {}) {
  const days = DAYS.map((d, i) => ({ day: d, weekday: i + 1, open: true }));
  if (saturday) days.push({ day: '2026-10-10', weekday: 6, open: true });
  return {
    week: '2026-W41',
    current_week: '2026-W41',
    days,
    saturday_open: saturday,
    sunday_open: false,
    settings: { daily_hours: 7, max_block_hours: 3.5 },
    people: [
      {
        id: 4,
        first_name: 'Ada',
        last_name: 'Lovelace',
        role: 'TECHNICIAN',
        specialty: 'HVAC',
        site: 'Lyon',
        week_total: 10,
        week_capacity: 35,
        days: days.map((d) =>
          d.day === DAYS[0]
            ? day(d.day, {
                total: 8.5,
                sites: ['Lyon', 'Saclay'],
                warnings: ['OVER_CAPACITY', 'SEVERAL_SITES'],
              })
            : day(d.day),
        ),
        blocks: [
          {
            id: 1,
            kind: 'WORK',
            work_order_id: 11,
            work_order: wo(11),
            technician_id: 4,
            day: DAYS[0],
            hours: 2,
            locked_start: '10:00',
            locked_by: lock,
            position: 1,
            note: 'Keys at reception',
            version: 2,
          },
          {
            id: 2,
            kind: 'WORK',
            work_order_id: 12,
            work_order: wo(12, { site: 'Saclay', assignee_id: 5 }),
            technician_id: 4,
            day: DAYS[0],
            hours: 3.5,
            locked_start: null,
            locked_by: null,
            position: 2,
            note: null,
            version: 1,
          },
          {
            id: 3,
            kind: 'TRAVEL',
            work_order_id: null,
            work_order: null,
            technician_id: 4,
            day: DAYS[0],
            hours: 1,
            locked_start: null,
            locked_by: null,
            position: 3,
            note: 'Lyon → Saclay',
            version: 1,
          },
        ],
      },
    ],
    tray: [
      {
        id: 20,
        number: 'WO-2026-00020',
        title: 'Two hours',
        priority: 'HIGH',
        category: 'HVAC',
        site: 'Lyon',
        building: null,
        due_on: '2026-10-09',
        group: 'PLANNED',
        carried_from: null,
        needed_hours: 2,
        scheduled_hours: 1.5,
        hours_left: 0.5,
        assignee: null,
      },
      {
        id: 21,
        number: 'WO-2026-00021',
        title: 'Unfinished',
        priority: 'NORMAL',
        category: null,
        site: 'Lyon',
        building: null,
        due_on: null,
        group: 'CARRIED_OVER',
        carried_from: '2026-W40',
        needed_hours: 6,
        scheduled_hours: 6,
        hours_left: 0,
        assignee: { id: 4, first_name: 'Ada', last_name: 'Lovelace' },
      },
      {
        id: 22,
        number: 'WO-2026-00022',
        title: 'Six hours',
        priority: 'NORMAL',
        category: 'HVAC',
        site: 'Lyon',
        building: null,
        due_on: null,
        group: 'NOT_PLANNED',
        carried_from: null,
        needed_hours: 6,
        scheduled_hours: 0,
        hours_left: 6,
        assignee: null,
      },
    ],
    tiles: {
      booked_hours: 6.5,
      available_hours: 35,
      hours_left: { planned: 0.5, carried_over: 0, not_planned: 6 },
      travel_share: 1 / 6.5,
      sites_per_day: { average: 2, worst: 2 },
      carried_over: 1,
    },
  };
}

describe('the scheduler grid', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.replaceChildren(container);
  });
  const render = (data, canEdit = true) =>
    renderScheduler(container, {
      data,
      canEdit,
      panel: null,
      today: DAYS[0],
      onWeek: vi.fn(),
      onWeekend: vi.fn(),
    });

  it('shows Saturday only once opened (P11)', () => {
    render(weekData());
    expect([...container.querySelectorAll('thead th.day-col')].map((th) => th.textContent)).toEqual(
      ['Mon 5 Oct (today)', 'Tue 6 Oct', 'Wed 7 Oct', 'Thu 8 Oct', 'Fri 9 Oct'],
    );
    render(weekData({ saturday: true }));
    expect(container.querySelectorAll('thead th.day-col')).toHaveLength(6);
    expect(container.querySelector('thead th.day-col:last-child').textContent).toBe('Sat 10 Oct');
  });

  it('shows the overload and two sites with "Add travel time" (BR-S5, BR-S10)', () => {
    render(weekData());
    const monday = container.querySelector(`td[data-day="${DAYS[0]}"]`);
    expect(monday.classList.contains('is-over')).toBe(true);
    expect(monday.querySelector('.cell-capacity').textContent).toBe('8 h 30 / 7 h');
    const warnings = monday.querySelector('.cell-warnings').textContent;
    expect(warnings).toContain('Over capacity: 8 h 30 / 7 h');
    expect(warnings).toContain('2 sites: add travel time');
    const link = [...monday.querySelectorAll('a')].find((a) => a.textContent === 'Add travel time');
    expect(link.getAttribute('href')).toBe('/schedule/time?week=2026-W41&person=4&day=2026-10-05');
  });

  it('shows "30 min left" and the carried-over mark in the tray (BR-S2, BR-S9)', () => {
    render(weekData());
    const two = container.querySelector('[data-item="20"]');
    expect(two.textContent).toContain('30 min left');
    expect(two.getAttribute('href')).toBe('/schedule/work-orders/20?week=2026-W41');
    const carried = container.querySelector('[data-item="21"]');
    expect(carried.textContent).toContain('Carried over from Week 40, 2026');
    expect(carried.textContent).toContain('Fully scheduled');
    const groups = [...container.querySelectorAll('.tray-group summary')].map((s) => s.textContent);
    expect(groups).toEqual(['Planned this week (1)', 'Carried over (1)', 'Not planned (1)']);
  });

  it('shows appointments with their time and lock, not draggable; helpers and other time', () => {
    render(weekData());
    const locked = container.querySelector('[data-block="1"]');
    expect(locked.textContent).toContain('🔒 10:00–12:00');
    expect(locked.classList.contains('is-draggable')).toBe(false);
    expect(locked.getAttribute('aria-label')).toContain('locked by Paul Martin');
    const helper = container.querySelector('[data-block="2"]');
    expect(helper.classList.contains('is-draggable')).toBe(true);
    expect(helper.textContent).toContain('helper');
    const travel = container.querySelector('[data-block="3"]');
    expect(travel.classList.contains('block-travel')).toBe(true);
    expect(travel.textContent).toContain('Travel');
    expect(travel.textContent).toContain('Lyon → Saclay');
  });

  it('is read-only for technicians: no + Time, no weekend switches, no drag', () => {
    render(weekData(), false);
    expect(container.querySelector('.add-time')).toBeNull();
    expect(container.querySelector('.weekend-switch')).toBeNull();
    expect(container.querySelector('.is-draggable')).toBeNull();
    expect(container.querySelector('a.cell-capacity')).toBeNull();
  });

  it('says to tap on touch screens, to drag elsewhere (M13, M15)', () => {
    render(weekData());
    const help = container.querySelector('#schedule-help');
    expect(help.querySelector('.help-fine').textContent).toMatch(/^Drag a work order/);
    expect(help.querySelector('.help-coarse').textContent).toMatch(/^Tap a work order/);
  });

  it('sums the tiles up in one line for phones (M13)', () => {
    expect(scheduleSummaryText(weekData().tiles)).toBe(
      '6.5 h booked of 35 h · 0.5 h left to schedule · 1 carried over',
    );
  });

  it('folds the tray behind a button for phones (M13)', () => {
    render(weekData());
    const tray = container.querySelector('.schedule-tray');
    const toggle = tray.querySelector('.tray-toggle');
    expect(toggle.textContent).toBe('Show the work orders to schedule (3)');
    expect(tray.classList.contains('is-open')).toBe(false);
    toggle.click();
    expect(tray.classList.contains('is-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click(); // folded again for the next tests
  });

  it('shows one day at a time on phones, today first, and switches days (M14)', () => {
    expect(dayToShow(weekData().days, DAYS[2], null)).toBe(DAYS[2]);
    expect(dayToShow(weekData().days, '2026-10-20', null)).toBe(DAYS[0]);
    expect(dayToShow(weekData().days, DAYS[2], DAYS[4])).toBe(DAYS[4]);
    render(weekData());
    const shown = () =>
      [...container.querySelectorAll('.schedule-grid .is-shown-day')].map((el) => el.dataset.day);
    expect(shown()).toEqual([DAYS[0], DAYS[0]]);
    container.querySelector(`.day-switcher [data-day="${DAYS[3]}"]`).click();
    expect(shown()).toEqual([DAYS[3], DAYS[3]]);
    expect(
      container.querySelector(`.day-switcher [data-day="${DAYS[3]}"]`).getAttribute('aria-pressed'),
    ).toBe('true');
    // Kept when the week is drawn again (after a change).
    render(weekData());
    expect(shown()).toEqual([DAYS[3], DAYS[3]]);
  });

  it('describes blocks for screen readers', () => {
    const data = weekData();
    const view = blockView(data.people[0].blocks[1], data.people[0]);
    expect(view.label).toBe('WO-2026-00012 · Job 12, 3 h 30, Saclay · Tower A, helper');
  });
});

describe('dragging and keyboard on the grid', () => {
  let container;
  let data;
  let options;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.replaceChildren(container);
    data = weekData();
    renderScheduler(container, {
      data,
      canEdit: true,
      panel: null,
      today: DAYS[0],
      onWeek: vi.fn(),
      onWeekend: vi.fn(),
    });
    options = { data, onDrop: vi.fn(), onResize: vi.fn(), onRefuse: vi.fn(), announce: vi.fn() };
    attachScheduleEditing(container, options);
  });
  afterEach(() => {
    delete document.elementFromPoint;
  });
  const pointer = (el, type, x, y) =>
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }),
    );
  const cell = (person, date) =>
    container.querySelector(`td[data-person="${person}"][data-day="${date}"]`);

  it('drops a tray card on a person’s day', () => {
    const card = container.querySelector('[data-item="22"]');
    const target = cell(4, DAYS[1]);
    document.elementFromPoint = () => target;
    pointer(card, 'pointerdown', 10, 10);
    pointer(card, 'pointermove', 40, 40);
    expect(target.classList.contains('is-drop-target')).toBe(true);
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    pointer(card, 'pointerup', 40, 40);
    expect(options.onDrop).toHaveBeenCalledWith({ kind: 'item', id: 22, person: 4, day: DAYS[1] });
    expect(document.querySelector('.drag-ghost')).toBeNull();
  });

  it('moves a block to another day, and ignores a drop where it already is', () => {
    const block = container.querySelector('[data-block="2"]');
    document.elementFromPoint = () => cell(4, DAYS[2]);
    pointer(block, 'pointerdown', 10, 10);
    pointer(block, 'pointermove', 40, 40);
    pointer(block, 'pointerup', 40, 40);
    expect(options.onDrop).toHaveBeenCalledWith({ kind: 'block', id: 2, person: 4, day: DAYS[2] });
    options.onDrop.mockClear();
    document.elementFromPoint = () => cell(4, DAYS[0]);
    pointer(block, 'pointerdown', 10, 10);
    pointer(block, 'pointermove', 40, 40);
    pointer(block, 'pointerup', 40, 40);
    expect(options.onDrop).not.toHaveBeenCalled();
  });

  it('refuses to drag a locked appointment, with the reason (BR-S6)', () => {
    const locked = container.querySelector('[data-block="1"]');
    document.elementFromPoint = () => cell(4, DAYS[2]);
    pointer(locked, 'pointerdown', 10, 10);
    pointer(locked, 'pointermove', 40, 40);
    pointer(locked, 'pointerup', 40, 40);
    expect(options.onDrop).not.toHaveBeenCalled();
    expect(options.onRefuse).toHaveBeenCalledWith(
      'This appointment is locked at 10:00: unlock it before moving it.',
    );
  });

  it('a short press is a click: no drop', () => {
    const card = container.querySelector('[data-item="22"]');
    pointer(card, 'pointerdown', 10, 10);
    pointer(card, 'pointermove', 12, 11);
    pointer(card, 'pointerup', 12, 11);
    expect(options.onDrop).not.toHaveBeenCalled();
  });

  it('changes a block’s length with + and −, within half an hour and 3 h 30', () => {
    const key = (el, k) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const travel = container.querySelector('[data-block="3"]');
    key(travel, '+');
    expect(options.onResize).toHaveBeenCalledWith(3, 1.5);
    key(travel, '-');
    expect(options.onResize).toHaveBeenLastCalledWith(3, 0.5);
    key(container.querySelector('[data-block="2"]'), '+');
    expect(options.onResize).toHaveBeenCalledTimes(2);
    expect(options.announce).toHaveBeenCalledWith('A block lasts 3.5 h at most.');
    key(container.querySelector('[data-block="1"]'), '+');
    expect(options.onRefuse).toHaveBeenCalledWith(
      'This appointment is locked at 10:00: unlock it before resizing it.',
    );
  });

  it('reads the drop target from the dragged element and the cell', () => {
    expect(dropTarget(null, cell(4, DAYS[0]))).toBeNull();
    expect(dropTarget(container.querySelector('[data-block="2"]'), null)).toBeNull();
  });
});

describe('scheduling a work order from its panel', () => {
  it('proposes 3 h 30 + 2 h 30 for a 6 h job dropped on Monday (acceptance)', () => {
    const container = document.createElement('div');
    const data = weekData();
    const item = data.tray.find((t) => t.id === 22);
    const onSubmit = vi.fn();
    renderItemPanel(container, {
      item,
      data,
      panel: { type: 'item', id: 22, person: 4, day: DAYS[0] },
      today: DAYS[2],
      canEdit: true,
      onClose: vi.fn(),
      onSubmit,
    });
    const rows = [...container.querySelectorAll('.block-row')].map((row) => [
      row.querySelector('[name="person"]').value,
      row.querySelector('[name="day"]').value,
      row.querySelector('[name="hours"]').value,
    ]);
    expect(rows).toEqual([
      ['4', DAYS[0], '3.5'],
      ['4', DAYS[1], '2.5'],
    ]);
    expect(container.querySelector('.block-total').textContent).toBe('6 h in 2 blocks');
    container.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      estimate: null,
      blocks: [
        { kind: 'WORK', work_order_id: 22, technician_id: 4, day: DAYS[0], hours: 3.5 },
        { kind: 'WORK', work_order_id: 22, technician_id: 4, day: DAYS[1], hours: 2.5 },
      ],
    });
  });

  it('asks for an estimate first when the work order has none (BR-S2)', () => {
    const container = document.createElement('div');
    const data = weekData();
    const item = { ...data.tray[2], needed_hours: null, hours_left: null };
    renderItemPanel(container, {
      item,
      data,
      panel: { type: 'item', id: 22 },
      today: DAYS[0],
      canEdit: true,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    });
    expect(container.querySelector('[name="estimate"]')).not.toBeNull();
    expect(container.querySelectorAll('.block-row')).toHaveLength(0);
  });

  it('starts at the drop, else the assignee on today', () => {
    const data = weekData();
    expect(startOf(data.tray[0], data, { person: 4, day: DAYS[3] }, DAYS[0])).toEqual({
      person: 4,
      day: DAYS[3],
    });
    expect(startOf(data.tray[1], data, null, DAYS[2])).toEqual({ person: 4, day: DAYS[2] });
    // Today outside the week: its first day.
    expect(startOf(data.tray[0], data, null, '2026-12-01')).toEqual({ person: 4, day: DAYS[0] });
  });
});

describe('My week on the device (P18)', () => {
  beforeEach(async () => {
    await DB.close();
    globalThis.indexedDB = new IDBFactory();
  });

  const myWeek = (week, generatedAt, ids = [11]) => ({
    week,
    current_week: '2026-W41',
    generated_at: generatedAt,
    user: { id: 4, first_name: 'Ada', last_name: 'Lovelace' },
    week_total: 2,
    week_capacity: 35,
    days: [
      {
        ...day(DAYS[0], { total: 2 }),
        weekday: 1,
        blocks: [weekData().people[0].blocks[0]],
      },
    ],
    work_orders: ids.map((id) => ({
      id,
      number: `WO-2026-${String(id).padStart(5, '0')}`,
      version: 1,
    })),
  });

  it('saves a week with its work orders, and reads it back offline', async () => {
    await saveMyWeek(myWeek('2026-W41', '2026-10-05T08:00:00.000Z'));
    expect((await readMyWeek('2026-W41')).week).toBe('2026-W41');
    expect((await readMyWeek(null)).week).toBe('2026-W41');
    expect(await readMyWeek('2026-W42')).toBeNull();
    expect(await DB.getRecord(storesOf('work_orders').records, 11)).toMatchObject({
      number: 'WO-2026-00011',
    });
    // Its work orders are never evicted, so they open offline too.
    expect((await protectedIds('work_orders')).has(11)).toBe(true);
    expect((await protectedIds('assets')).has(11)).toBe(false);
  });

  it('keeps the last 4 weeks fetched', async () => {
    for (let i = 0; i < 6; i++) {
      await saveMyWeek(myWeek(`2026-W4${i}`, `2026-10-0${i + 1}T08:00:00.000Z`, [i + 1]));
    }
    expect(Object.keys(await DB.getConfig(MY_WEEK_CACHE)).sort()).toEqual([
      '2026-W42',
      '2026-W43',
      '2026-W44',
      '2026-W45',
    ]);
  });

  it('shows the saved week offline, with changes disabled', () => {
    const container = document.createElement('div');
    const data = myWeek('2026-W41', '2026-10-05T08:00:00.000Z');
    renderMyWeek(container, {
      data,
      savedOffline: true,
      canChange: false,
      onMove: vi.fn(),
      onLock: vi.fn(),
    });
    expect(container.querySelector('.banner').textContent).toMatch(
      /^Offline: your week as saved on this device on/,
    );
    expect(container.textContent).toContain('🔒 10:00–12:00 · locked by Paul Martin');
    expect(container.querySelector('a[href="/work-orders/11"]')).not.toBeNull();
    expect(
      [...container.querySelectorAll('.my-block-actions button')].every((b) => b.disabled),
    ).toBe(true);
  });

  it('marks today, shows status and priority, and folds the buttons behind Change… (M3–M5)', () => {
    const container = document.createElement('div');
    const data = myWeek('2026-W41', '2026-10-05T08:00:00.000Z');
    data.days.push({ ...day(DAYS[1]), weekday: 2, blocks: [] });
    const view = renderMyWeek(container, {
      data,
      today: DAYS[1],
      savedOffline: false,
      canChange: true,
      onMove: vi.fn(),
      onLock: vi.fn(),
    });
    expect(view.todaySection.querySelector('h2').textContent).toBe('Tuesday 6 October Today');
    const block = container.querySelector('[data-block="1"]');
    expect(block.querySelector('.my-block-badges').textContent).toBe('Open Normal');
    // Monday is gone by: nothing to change there.
    expect(block.querySelector('.my-block-change')).toBeNull();
    expect(container.querySelector('.my-day.is-past')).not.toBeNull();
  });

  it('tells a technician about two sites without asking for travel time (M6)', () => {
    const container = document.createElement('div');
    const data = myWeek('2026-W41', '2026-10-05T08:00:00.000Z');
    data.days[0] = {
      ...data.days[0],
      sites: ['Lyon', 'Saclay'],
      warnings: ['SEVERAL_SITES'],
    };
    renderMyWeek(container, {
      data,
      today: DAYS[0],
      savedOffline: false,
      canChange: true,
      onMove: vi.fn(),
      onLock: vi.fn(),
    });
    expect(container.querySelector('.cell-warnings').textContent).toBe('⚠ 2 sites on this day');
  });

  it('lists the scheduled days of a work order from today on (M10)', () => {
    const blocks = [
      { day: DAYS[0], hours: 2, locked_start: null, technician_id: 4 },
      { day: DAYS[1], hours: 2, locked_start: '10:00', technician_id: 4 },
      {
        day: DAYS[2],
        hours: 3.5,
        locked_start: null,
        technician_id: 5,
        technician: { first_name: 'Paul', last_name: 'Martin' },
      },
    ];
    expect(scheduledTexts(blocks, 4, DAYS[1])).toEqual([
      'Tue 6 Oct · 2 h · appointment 10:00–12:00 · you',
      'Wed 7 Oct · 3 h 30 · Paul Martin',
    ]);
  });

  it('reorders and locks from My week online', () => {
    const container = document.createElement('div');
    const data = myWeek('2026-W41', '2026-10-05T08:00:00.000Z');
    const free = (id) => ({ ...weekData().people[0].blocks[2], id });
    data.days[0].blocks = [free(5), free(6)];
    const onMove = vi.fn();
    renderMyWeek(container, {
      data,
      savedOffline: false,
      canChange: true,
      onMove,
      onLock: vi.fn(),
    });
    const buttons = [...container.querySelectorAll('[data-block="6"] .my-block-actions button')];
    expect(buttons.map((b) => [b.textContent, b.disabled])).toEqual([
      ['Move up', false],
      ['Move down', true],
    ]);
    buttons[0].click();
    expect(onMove.mock.calls[0][1].id).toBe(6);
    expect(onMove.mock.calls[0][2]).toBe(-1);
  });
});
