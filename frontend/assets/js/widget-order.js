// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Rearranging the widgets of a dashboard (docs/spec-dashboards.md → Drag and drop): drag a
// card by its handle with the mouse or a finger, or pick it up with the keyboard (Space),
// move it with the arrow keys and drop it (Space; Escape cancels). The other cards make room
// as it moves; the new order is given to `onOrder` once dropped.
import { t } from './i18n.js';

/** Moves `key` to position `toIndex` of the others (clamped). Pure. */
export function moveKey(keys, key, toIndex) {
  if (!keys.includes(key)) return keys;
  const others = keys.filter((k) => k !== key);
  const at = Math.max(0, Math.min(toIndex, others.length));
  return [...others.slice(0, at), key, ...others.slice(at)];
}

/** Same keys in the same order. Pure. */
export function sameOrder(a, b) {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/** Pointer travel before a press on the handle becomes a drag. */
const DRAG_THRESHOLD = 4;
/** Distance from the top or bottom of the scrolling area that scrolls it while dragging. */
const SCROLL_EDGE = 60;
/** Scrolling speed near an edge, in pixels per frame. */
const SCROLL_STEP = 14;

const cardsOf = (grid) => [...grid.querySelectorAll(':scope > .widget-card')];
const keysOf = (grid) => cardsOf(grid).map((c) => c.dataset.key);

function scrollParent(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
}

/**
 * Makes the cards of `grid` movable by their `.widget-handle`.
 * @param {HTMLElement} grid the list holding the `.widget-card` items (`data-key`)
 * @param {{ onOrder: (keys: string[], key: string) => void, announce: (text: string) => void,
 *   labelOf: (key: string) => string }} options
 * @returns {() => void} detaches the listeners
 */
export function attachWidgetDrag(grid, { onOrder, announce, labelOf }) {
  let drag = null; // pointer drag in progress
  let grabbed = null; // card picked up with the keyboard: { card, from: string[] }

  const position = (card) =>
    t('{key}, position {value} of {length}', {
      key: labelOf(card.dataset.key),
      value: cardsOf(grid).indexOf(card) + 1,
      length: cardsOf(grid).length,
    });

  const finish = (from, card) => {
    const keys = keysOf(grid);
    if (!sameOrder(from, keys)) onOrder(keys, card.dataset.key);
  };

  // --- Pointer -------------------------------------------------------------------------------

  const placeAt = (x, y) => {
    const { card, placeholder } = drag;
    const target = document.elementFromPoint(x, y)?.closest('.widget-card');
    if (target && target !== card && grid.contains(target)) {
      const rect = target.getBoundingClientRect();
      // Wide cards fill their row: compare heights; others: left or right half.
      const wide = rect.width > grid.clientWidth * 0.6;
      const before = wide ? y < rect.top + rect.height / 2 : x < rect.left + rect.width / 2;
      if (before) target.before(placeholder);
      else target.after(placeholder);
    } else if (!target) {
      const last = cardsOf(grid)
        .filter((c) => c !== card)
        .at(-1);
      if (last && y > last.getBoundingClientRect().bottom) grid.append(placeholder);
    }
  };

  const startDrag = () => {
    const { card } = drag;
    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement('li');
    // Same size classes as the card, but not a card: it is never counted or targeted.
    placeholder.className = card.className.replace(/\bwidget-card\b/, 'widget-placeholder');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.height = `${rect.height}px`;
    card.before(placeholder);
    card.classList.add('is-dragging');
    Object.assign(card.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
    });
    Object.assign(drag, { placeholder, rect, started: true, scroller: scrollParent(grid) });
    drag.frame = requestAnimationFrame(autoScroll);
  };

  /**
   * Scrolls while the pointer stays near the top or bottom edge (even without moving), and
   * places the card again under the pointer as the page moves.
   */
  const autoScroll = () => {
    if (!drag?.started) return;
    const { scroller, lastX, lastY } = drag;
    const view =
      scroller === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
    const step =
      lastY < view.top + SCROLL_EDGE
        ? -SCROLL_STEP
        : lastY > view.bottom - SCROLL_EDGE
          ? SCROLL_STEP
          : 0;
    if (step) {
      const before = scroller.scrollTop;
      scroller.scrollBy(0, step);
      if (scroller.scrollTop !== before) placeAt(lastX, lastY);
    }
    drag.frame = requestAnimationFrame(autoScroll);
  };

  const endDrag = (commit) => {
    const { card, placeholder, from, started, frame } = drag;
    drag = null;
    if (!started) return;
    cancelAnimationFrame(frame);
    card.classList.remove('is-dragging');
    for (const prop of ['width', 'height', 'left', 'top', 'transform']) card.style[prop] = '';
    if (commit) placeholder.replaceWith(card);
    else {
      placeholder.remove();
      // Back where it was.
      const index = from.indexOf(card.dataset.key);
      const others = cardsOf(grid).filter((c) => c !== card);
      if (others[index]) others[index].before(card);
      else grid.append(card);
    }
    card.querySelector('.widget-handle')?.focus();
    if (commit) {
      announce(`${position(card)}.`);
      finish(from, card);
    }
  };

  const onPointerDown = (event) => {
    const handle = event.target.closest('.widget-handle');
    if (!handle || handle.disabled || event.button !== 0 || grabbed) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    drag = {
      card: handle.closest('.widget-card'),
      handle,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      from: keysOf(grid),
      started: false,
    };
  };

  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.started) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      startDrag();
    }
    drag.card.style.transform = `translate(${dx}px, ${dy}px)`;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    placeAt(event.clientX, event.clientY);
  };

  const onPointerUp = (event) => {
    if (drag && event.pointerId === drag.pointerId) endDrag(true);
  };
  const onPointerCancel = (event) => {
    if (drag && event.pointerId === drag.pointerId) endDrag(false);
  };

  // --- Keyboard ------------------------------------------------------------------------------

  const drop = (commit) => {
    const { card, from } = grabbed;
    grabbed = null;
    card.classList.remove('is-grabbed');
    const handle = card.querySelector('.widget-handle');
    handle.setAttribute('aria-pressed', 'false');
    if (!commit) {
      for (const key of from) grid.append(grid.querySelector(`:scope > [data-key="${key}"]`));
      handle.focus();
      announce(t('{key}: move cancelled.', { key: labelOf(card.dataset.key) }));
      return;
    }
    announce(t('{position}. Dropped.', { position: position(card) }));
    finish(from, card);
  };

  const onKeyDown = (event) => {
    const handle = event.target.closest('.widget-handle');
    if (!handle || handle.disabled) return;
    const card = handle.closest('.widget-card');
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (grabbed) return drop(true);
      grabbed = { card, from: keysOf(grid) };
      card.classList.add('is-grabbed');
      handle.setAttribute('aria-pressed', 'true');
      announce(
        t(
          '{position}. Picked up: move it with the arrow keys, drop it with Space, or press Escape to cancel.',
          { position: position(card) },
        ),
      );
      return;
    }
    if (!grabbed || grabbed.card !== card) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // the menu overlay also closes on Escape
      return drop(false);
    }
    const earlier = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const later = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!earlier && !later) return;
    event.preventDefault();
    const sibling = earlier ? card.previousElementSibling : card.nextElementSibling;
    if (!sibling?.classList.contains('widget-card')) return;
    if (earlier) sibling.before(card);
    else sibling.after(card);
    handle.focus(); // moving the element loses the focus
    card.scrollIntoView({ block: 'nearest' });
    announce(`${position(card)}.`);
  };

  // Leaving the handle with the card still picked up keeps the new place.
  const onFocusOut = (event) => {
    if (grabbed && event.target === grabbed.card.querySelector('.widget-handle')) {
      // Moving the card itself blurs the handle for an instant: only a real departure counts.
      setTimeout(() => {
        if (grabbed && !grabbed.card.contains(document.activeElement)) drop(true);
      }, 0);
    }
  };

  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('pointermove', onPointerMove);
  grid.addEventListener('pointerup', onPointerUp);
  grid.addEventListener('pointercancel', onPointerCancel);
  grid.addEventListener('keydown', onKeyDown);
  grid.addEventListener('focusout', onFocusOut);
  return () => {
    if (drag) endDrag(false);
    grid.removeEventListener('pointerdown', onPointerDown);
    grid.removeEventListener('pointermove', onPointerMove);
    grid.removeEventListener('pointerup', onPointerUp);
    grid.removeEventListener('pointercancel', onPointerCancel);
    grid.removeEventListener('keydown', onKeyDown);
    grid.removeEventListener('focusout', onFocusOut);
  };
}
