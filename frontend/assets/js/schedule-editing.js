// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Dragging on the week scheduler (Phase 19, spec §8): a tray card onto a person's day creates
// its blocks, a block onto another day or person moves it; + and − change a focused block's
// length by half an hour. Pointer events, so mouse, pen and touch all work. A locked
// appointment does not move (BR-S6): the drag is refused with the reason. The server decides
// everything else; the keyboard path is the side panel (schedule-panel.js).

/** Pixels the pointer must travel before a press becomes a drag (a shorter one is a click). */
const DRAG_THRESHOLD = 6;
/** Half an hour. */
const STEP = 0.5;

/** The day cell under a point, or null. */
function cellAt(x, y) {
  const el = document.elementFromPoint?.(x, y);
  return el?.closest?.('td.day-cell') ?? null;
}

/**
 * What a drop means, from the dragged element and the cell under the pointer. Pure.
 * @returns {{ kind: 'item' | 'block', id: number, person: number, day: string } | null}
 */
export function dropTarget(source, cell) {
  if (!source || !cell) return null;
  const person = Number(cell.dataset.person);
  const day = cell.dataset.day;
  if (source.dataset.item) return { kind: 'item', id: Number(source.dataset.item), person, day };
  return { kind: 'block', id: Number(source.dataset.block), person, day };
}

/**
 * Wires drag and keyboard resizing on a rendered scheduler.
 * @param {HTMLElement} root the scheduler (renderScheduler's container)
 * @param {object} options
 * @param {object} options.data the week shown
 * @param {(drop: { kind: string, id: number, person: number, day: string }) => void} options.onDrop
 * @param {(blockId: number, hours: number) => void} options.onResize new length of a block
 * @param {(message: string) => void} options.onRefuse explain a refused move
 * @param {(message: string) => void} options.announce screen reader message
 * @returns {() => void} detach
 */
export function attachScheduleEditing(root, { data, onDrop, onResize, onRefuse, announce }) {
  const scheduler = root.querySelector('.scheduler');
  if (!scheduler) return () => {};
  const blocks = new Map(data.people.flatMap((p) => p.blocks).map((b) => [b.id, b]));
  const max = data.settings.max_block_hours;
  let pending = null; // a press that may become a drag
  let active = null; // { source, ghost, cell }
  let swallowClick = false;

  const locked = (source) => {
    const block = source.dataset.block ? blocks.get(Number(source.dataset.block)) : null;
    return block?.locked_start ? block : null;
  };
  const lockedMessage = (block) =>
    `This appointment is locked at ${block.locked_start}: unlock it before moving it.`;

  function setTarget(cell) {
    if (active.cell === cell) return;
    active.cell?.classList.remove('is-drop-target');
    active.cell = cell;
    cell?.classList.add('is-drop-target');
  }

  function end() {
    if (!active) return;
    active.cell?.classList.remove('is-drop-target');
    active.ghost.remove();
    active.source.classList.remove('is-dragged');
    scheduler.classList.remove('is-dragging');
    active = null;
  }

  function begin(source, x, y) {
    const ghost = source.cloneNode(true);
    // A picture only: no identity, so no handler takes it for the card or the block.
    ghost.className = `${source.className} drag-ghost`;
    for (const name of Object.keys(ghost.dataset)) delete ghost.dataset[name];
    for (const name of ['href', 'aria-label', 'aria-current', 'aria-describedby', 'title']) {
      ghost.removeAttribute(name);
    }
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${source.getBoundingClientRect().width}px`;
    document.body.append(ghost);
    source.classList.add('is-dragged');
    scheduler.classList.add('is-dragging');
    active = { source, ghost, cell: null };
    move(x, y);
  }

  function move(x, y) {
    active.ghost.style.transform = `translate(${x + 8}px, ${y + 8}px)`;
    setTarget(cellAt(x, y));
  }

  const onPointerDown = (event) => {
    const source = event.target.closest?.('.tray-card.is-draggable, .block[data-block]');
    if (!source || event.button !== 0 || active || !source.closest('.scheduler')) return;
    if (source.classList.contains('block') && !source.classList.contains('is-draggable')) {
      if (!locked(source)) return;
    }
    pending = { source, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };

  const onPointerMove = (event) => {
    if (pending && !active) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_THRESHOLD) return;
      const appointment = locked(pending.source);
      if (appointment) {
        // BR-S6: nothing moves; say why once, and let the click go.
        pending = null;
        swallowClick = true;
        onRefuse(lockedMessage(appointment));
        return;
      }
      try {
        pending.source.setPointerCapture(pending.pointerId);
      } catch {
        // An unknown pointer (synthetic events): the drag works without the capture.
      }
      begin(pending.source, event.clientX, event.clientY);
      pending = null;
    }
    if (!active) return;
    event.preventDefault();
    move(event.clientX, event.clientY);
  };

  const onPointerUp = (event) => {
    pending = null;
    if (!active) return;
    swallowClick = true;
    const target = dropTarget(active.source, cellAt(event.clientX, event.clientY) ?? active.cell);
    const source = active.source;
    end();
    if (!target) return;
    if (target.kind === 'block') {
      const block = blocks.get(target.id);
      if (block.day === target.day && block.technician_id === target.person) return;
    }
    onDrop(target);
    source.focus?.();
  };

  const onPointerCancel = () => {
    pending = null;
    end();
  };

  // A drag ends with a click on the card or block: it must not open the panel.
  const onClick = (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onKeyDown = (event) => {
    if (active && event.key === 'Escape') {
      event.preventDefault();
      end();
      announce('Move cancelled.');
      return;
    }
    const source = event.target.closest?.('.block[data-block]');
    if (!source || event.ctrlKey || event.metaKey || event.altKey) return;
    const grow = event.key === '+' || event.key === '=';
    const shrink = event.key === '-' || event.key === '−';
    if (!grow && !shrink) return;
    event.preventDefault();
    const block = blocks.get(Number(source.dataset.block));
    if (block.locked_start) {
      onRefuse(lockedMessage(block).replace('moving', 'resizing'));
      return;
    }
    const hours = block.hours + (grow ? STEP : -STEP);
    if (hours < STEP || hours > max) {
      announce(
        hours < STEP
          ? 'Half an hour is the shortest block: remove it from its panel instead.'
          : `A block lasts ${max} h at most.`,
      );
      return;
    }
    onResize(block.id, hours);
  };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerCancel);
  root.addEventListener('click', onClick, true);
  root.addEventListener('keydown', onKeyDown);
  return () => {
    end();
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerCancel);
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('keydown', onKeyDown);
  };
}
