// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Undo / Redo of the week scheduler (D54): every kind of change, blocks that come back under a
// new id, and refusals when a block changed since.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blockBody, createScheduleHistory } from '../assets/js/schedule-history.js';
import { renderScheduler } from '../assets/js/schedule.js';

/** A tiny server: blocks with versions (409 when stale), capacity and weekend settings. */
function fakeServer() {
  const blocks = new Map();
  let next = 1;
  const capacity = new Map();
  const weeks = new Map();
  const conflict = () =>
    Object.assign(new Error('This block changed since you opened it.'), { status: 409 });
  const api = vi.fn(async (path, { method = 'GET', body } = {}) => {
    const [base, query] = path.split('?');
    const id = Number(base.split('/')[3]);
    if (method === 'POST' && base === '/schedule/allocations') {
      const items = body.blocks.map((b) => {
        const block = { ...b, id: next++, version: 1, locked_start: null };
        blocks.set(block.id, block);
        return { ...block };
      });
      return { created: true, items };
    }
    if (method === 'DELETE') {
      const block = blocks.get(id);
      if (!block) throw Object.assign(new Error('Block not found'), { status: 404 });
      if (block.version !== Number(query.split('=')[1])) throw conflict();
      blocks.delete(id);
      return null;
    }
    if (method === 'PUT' && base.startsWith('/schedule/allocations/')) {
      const block = blocks.get(id);
      if (!block) throw Object.assign(new Error('Block not found'), { status: 404 });
      if (block.version !== body.version) throw conflict();
      const { version: _v, ...changes } = body;
      Object.assign(block, changes, { version: block.version + 1 });
      return { updated: true, item: { ...block } };
    }
    if (method === 'PUT' && base === '/schedule/capacity') {
      const key = `${body.technician_id}:${body.day}`;
      if (body.hours === null) capacity.delete(key);
      else capacity.set(key, { hours: body.hours, reason: body.reason, note: body.note ?? null });
      return {};
    }
    if (method === 'PUT' && base.startsWith('/schedule/weeks/')) {
      weeks.set(base.split('/')[3], body);
      return { week: base.split('/')[3], ...body };
    }
    throw new Error(`Unexpected ${method} ${path}`);
  });
  return { api, blocks, capacity, weeks };
}

const work = {
  kind: 'WORK',
  work_order_id: 20,
  technician_id: 4,
  day: '2026-10-12',
  hours: 3.5,
  note: null,
};

let server;
let history;
beforeEach(() => {
  server = fakeServer();
  history = createScheduleHistory(server.api);
});

describe('blocks', () => {
  it('undoes and redoes a split; the blocks come back under new ids', async () => {
    const change = await history.perform({
      kind: 'create',
      blocks: [work, { ...work, day: '2026-10-13', hours: 2.5 }],
      text: 'WO-1: 6 h scheduled in 2 blocks',
    });
    expect([...server.blocks.keys()]).toEqual([1, 2]);
    expect(history.labels()).toEqual({ undo: 'WO-1: 6 h scheduled in 2 blocks', redo: null });

    await history.undo();
    expect(server.blocks.size).toBe(0);
    expect(history.labels()).toEqual({ undo: null, redo: 'WO-1: 6 h scheduled in 2 blocks' });

    await history.redo();
    expect([...server.blocks.keys()]).toEqual([3, 4]);
    expect(change.refs.map((r) => r.id)).toEqual([3, 4]);
    // Undone again: the new ids are the ones removed.
    await history.undo();
    expect(server.blocks.size).toBe(0);
  });

  it('a later change of a re-created block still reaches it', async () => {
    const create = await history.perform({ kind: 'create', blocks: [work], text: 'create' });
    const block = { ...server.blocks.get(1) };
    await history.perform({
      kind: 'update',
      ref: history.refOf(block),
      before: { day: block.day },
      after: { day: '2026-10-14' },
      text: 'move',
    });
    await history.undo(); // move back (version 3)
    await history.undo(); // remove
    await history.redo(); // created again as id 2
    await history.redo(); // moved again: reaches id 2
    expect(create.refs[0].id).toBe(2);
    expect(server.blocks.get(2)).toMatchObject({ day: '2026-10-14', version: 2 });
  });

  it('undoes a move, a resize and a note at the version the change left', async () => {
    await history.perform({ kind: 'create', blocks: [work], text: 'create' });
    const block = { ...server.blocks.get(1) };
    await history.perform({
      kind: 'update',
      ref: history.refOf(block),
      before: { hours: 3.5, note: null },
      after: { hours: 2, note: 'Badge' },
      text: 'resize',
    });
    expect(server.blocks.get(1)).toMatchObject({ hours: 2, note: 'Badge', version: 2 });
    await history.undo();
    expect(server.blocks.get(1)).toMatchObject({ hours: 3.5, note: null, version: 3 });
    await history.redo();
    expect(server.blocks.get(1)).toMatchObject({ hours: 2, note: 'Badge', version: 4 });
  });

  it('puts a removed block back, then removes it again', async () => {
    await history.perform({ kind: 'create', blocks: [{ ...work, note: 'Keys' }], text: 'create' });
    const block = { ...server.blocks.get(1) };
    await history.perform({
      kind: 'delete',
      ref: history.refOf(block),
      block: blockBody(block),
      text: 'remove',
    });
    expect(server.blocks.size).toBe(0);
    await history.undo();
    expect(server.blocks.get(2)).toMatchObject({ day: '2026-10-12', hours: 3.5, note: 'Keys' });
    await history.redo();
    expect(server.blocks.size).toBe(0);
    // And the creation before it can still be undone and redone in turn.
    await history.undo();
    await history.undo();
    expect(server.blocks.size).toBe(0);
  });

  it('locks and unlocks an appointment', async () => {
    await history.perform({ kind: 'create', blocks: [work], text: 'create' });
    const block = { ...server.blocks.get(1) };
    await history.perform({
      kind: 'lock',
      ref: history.refOf(block),
      from: null,
      to: '10:00',
      text: 'lock',
    });
    expect(server.blocks.get(1).locked_start).toBe('10:00');
    await history.undo();
    expect(server.blocks.get(1).locked_start).toBeNull();
  });

  it('refuses an undo when the block changed since, and drops that change', async () => {
    await history.perform({ kind: 'create', blocks: [work], text: 'create' });
    const block = { ...server.blocks.get(1) };
    await history.perform({
      kind: 'update',
      ref: history.refOf(block),
      before: { hours: 3.5 },
      after: { hours: 3 },
      text: 'resize',
    });
    // Someone else changes the block.
    server.blocks.get(1).version += 1;
    await expect(history.undo()).rejects.toMatchObject({ status: 409 });
    expect(server.blocks.get(1).hours).toBe(3);
    expect(history.labels()).toEqual({ undo: 'create', redo: null });
  });

  it('a new change empties Redo; nothing to undo answers null', async () => {
    expect(await history.undo()).toBeNull();
    await history.perform({ kind: 'create', blocks: [work], text: 'one' });
    await history.undo();
    await history.perform({ kind: 'create', blocks: [work], text: 'two' });
    expect(history.labels()).toEqual({ undo: 'two', redo: null });
    expect(await history.redo()).toBeNull();
    history.clear();
    expect(history.labels()).toEqual({ undo: null, redo: null });
  });

  it('keeps a change out of the history when the server refuses it', async () => {
    server.api.mockRejectedValueOnce(Object.assign(new Error('Too long'), { status: 422 }));
    await expect(history.perform({ kind: 'create', blocks: [work], text: 'x' })).rejects.toThrow();
    expect(history.labels().undo).toBeNull();
  });
});

describe('capacity and weekends', () => {
  it('puts the hours of a day back: an override, or the usual hours', async () => {
    const leave = { hours: 0, reason: 'LEAVE', note: null };
    await history.perform({
      kind: 'capacity',
      person: 4,
      day: '2026-10-12',
      before: null,
      after: leave,
      text: 'leave',
    });
    expect(server.capacity.get('4:2026-10-12')).toEqual(leave);
    await history.undo();
    expect(server.capacity.has('4:2026-10-12')).toBe(false);
    await history.redo();
    const part = { hours: 3.5, reason: 'PART_TIME', note: null };
    await history.perform({
      kind: 'capacity',
      person: 4,
      day: '2026-10-12',
      before: leave,
      after: part,
      text: 'part',
    });
    await history.undo();
    expect(server.capacity.get('4:2026-10-12')).toEqual(leave);
  });

  it('closes a Saturday opened by mistake', async () => {
    const closed = { saturday_open: false, sunday_open: false };
    await history.perform({
      kind: 'weekend',
      week: '2026-W42',
      before: closed,
      after: { ...closed, saturday_open: true },
      text: 'Saturday opened',
    });
    await history.undo();
    expect(server.weeks.get('2026-W42')).toEqual(closed);
  });
});

describe('toolbar', () => {
  const data = {
    week: '2026-W42',
    current_week: '2026-W42',
    days: [{ day: '2026-10-12', weekday: 1, open: true }],
    saturday_open: false,
    sunday_open: false,
    settings: { daily_hours: 7, max_block_hours: 3.5 },
    people: [],
    tray: [],
    tiles: {
      booked_hours: 0,
      available_hours: 0,
      hours_left: { planned: 0, carried_over: 0, not_planned: 0 },
      travel_share: null,
      sites_per_day: { average: null, worst: 0 },
      carried_over: 0,
    },
  };
  const render = (canEdit, history) => {
    const container = document.createElement('div');
    renderScheduler(container, {
      data,
      canEdit,
      panel: null,
      today: '2026-10-12',
      history,
      onWeek: vi.fn(),
      onWeekend: vi.fn(),
    });
    return container;
  };
  const button = (container, text) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));

  it('names the change Undo and Redo would replay, and is disabled when there is none', () => {
    const onUndo = vi.fn();
    const container = render(true, {
      undoLabel: 'Block moved to Ada, Monday',
      redoLabel: null,
      onUndo,
      onRedo: vi.fn(),
    });
    const undo = button(container, 'Undo');
    expect(undo.disabled).toBe(false);
    expect(undo.title).toBe('Undo: Block moved to Ada, Monday (Ctrl+Z)');
    expect(undo.getAttribute('aria-keyshortcuts')).toBe('Control+Z');
    undo.click();
    expect(onUndo).toHaveBeenCalled();
    expect(button(container, 'Redo').disabled).toBe(true);
  });

  it('is not offered to technicians', () => {
    const container = render(false, {
      undoLabel: null,
      redoLabel: null,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    });
    expect(button(container, 'Undo')).toBeUndefined();
  });
});
