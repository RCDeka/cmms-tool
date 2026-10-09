// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Undo / Redo of the week scheduler (D54): every change made on the scheduler is sent through
// here, kept with what undoes it, and replayed as ordinary API calls. Each undo is checked by
// the server against the version the change left (409 when someone changed the block since).
//
// A block removed then put back, or created again by Redo, gets a new id from the server. The
// changes that name a block share one reference object `{ id, version }` per block, which
// follows its current id and version, so older changes still reach it.

/** Fields a block is re-created with. Pure. */
export const blockBody = (block) => ({
  kind: block.kind,
  ...(block.work_order_id ? { work_order_id: block.work_order_id } : {}),
  technician_id: block.technician_id,
  day: block.day,
  hours: block.hours,
  note: block.note ?? null,
});

/**
 * @param {(path: string, options?: object) => Promise<any>} api apiFetch
 */
export function createScheduleHistory(api) {
  const undoStack = [];
  const redoStack = [];
  /** Current reference of each block by its current id. */
  const refs = new Map();

  /** The shared reference of a block, at the version just read from the server. */
  function refOf(block) {
    let ref = refs.get(block.id);
    if (!ref) {
      ref = { id: block.id, version: block.version };
      refs.set(block.id, ref);
    } else ref.version = block.version;
    return ref;
  }

  /** The block exists again under a new id (created again, or put back). */
  function rebind(ref, item) {
    refs.delete(ref.id);
    ref.id = item.id;
    ref.version = item.version;
    refs.set(item.id, ref);
  }

  const create = (blocks) =>
    api('/schedule/allocations', { method: 'POST', body: { blocks } }).then((r) => r.items);
  const remove = (ref) =>
    api(`/schedule/allocations/${ref.id}?version=${ref.version}`, { method: 'DELETE' }).then(() =>
      refs.delete(ref.id),
    );
  async function put(ref, path, body) {
    const { item } = await api(`/schedule/allocations/${ref.id}${path}`, {
      method: 'PUT',
      body: { ...body, version: ref.version },
    });
    ref.version = item.version;
  }

  /**
   * Sends a change one way: 'do' (first time), 'undo' or 'redo'.
   * Kinds: create { blocks, refs }, update { ref, before, after }, delete { ref, block },
   * lock { ref, from, to }, capacity { person, day, before, after }, weekend { week, before, after }.
   */
  async function apply(change, mode) {
    const back = mode === 'undo';
    switch (change.kind) {
      case 'create':
        if (back) {
          // The last block first: a split comes off in reverse.
          for (const ref of [...change.refs].reverse()) await remove(ref);
        } else {
          const items = await create(change.blocks);
          if (mode === 'do') change.refs = items.map(refOf);
          else items.forEach((item, i) => rebind(change.refs[i], item));
        }
        return;
      case 'update':
        return put(change.ref, '', back ? change.before : change.after);
      case 'delete':
        if (back) rebind(change.ref, (await create([change.block]))[0]);
        else await remove(change.ref);
        return;
      case 'lock':
        return put(change.ref, '/lock', { locked_start: back ? change.from : change.to });
      case 'capacity': {
        const value = back ? change.before : change.after;
        await api('/schedule/capacity', {
          method: 'PUT',
          body: {
            technician_id: change.person,
            day: change.day,
            ...(value ?? { hours: null }),
          },
        });
        return;
      }
      case 'weekend':
        await api(`/schedule/weeks/${change.week}`, {
          method: 'PUT',
          body: back ? change.before : change.after,
        });
        return;
      default:
        throw new Error(`Unknown change: ${change.kind}`);
    }
  }

  return {
    refOf,

    /** Sends a new change and keeps it for Undo; Redo starts over. Throws when refused. */
    async perform(change) {
      await apply(change, 'do');
      undoStack.push(change);
      redoStack.length = 0;
      return change;
    },

    /**
     * Undoes the last change; it moves to Redo. When the server refuses, the change is
     * dropped (what it would undo is no longer there) and the error is thrown.
     * @returns {Promise<object | null>} the change undone, null when there is none
     */
    async undo() {
      const change = undoStack.pop();
      if (!change) return null;
      await apply(change, 'undo');
      redoStack.push(change);
      return change;
    },

    /** Redoes the last change undone; same rules as undo. */
    async redo() {
      const change = redoStack.pop();
      if (!change) return null;
      await apply(change, 'redo');
      undoStack.push(change);
      return change;
    },

    /** Texts of the next Undo and Redo (null when there is nothing). */
    labels: () => ({
      undo: undoStack.at(-1)?.text ?? null,
      redo: redoStack.at(-1)?.text ?? null,
    }),

    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      refs.clear();
    },
  };
}
