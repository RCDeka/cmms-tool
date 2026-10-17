// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Moving visits on the year planner (Phase 18, spec §7): pointer drag (mouse, pen, touch) and
// keyboard moves, with the allowed weeks highlighted, ghost chips where the visits would go
// and the figures recomputed live. The first planned visit of a row moves the whole series
// (BR-P2); any other planned visit moves alone, within its tolerance (BR-P3). The server
// decides: a refused move is never sent, an accepted one is sent through `onCommit`.
import { formatWeek } from './format.js';
import {
  addWeeks,
  allowedWeeks,
  moveBlocker,
  previewPlanVisits,
  seriesBlocker,
  weeksBetween,
} from './planning-rules.js';
import { t } from './i18n.js';

/** Pixels the pointer must travel before a press becomes a drag (a shorter one is a click). */
const DRAG_THRESHOLD = 6;
/** Distance from the grid's edge where a drag scrolls it sideways. */
const EDGE = 48;

/** Plans and visits of the timeline by id, and the plan of each visit. Pure. */
export function timelineIndex(data) {
  const plans = new Map();
  const visits = new Map();
  const planOf = new Map();
  for (const group of data.groups) {
    for (const plan of group.plans) {
      plans.set(plan.id, plan);
      for (const o of plan.occurrences) {
        visits.set(o.id, o);
        planOf.set(o.id, plan);
      }
    }
  }
  return { plans, visits, planOf };
}

/**
 * What dropping a visit in `week` would do. Pure.
 * - kind 'occurrence': that visit alone (BR-P3 limits);
 * - kind 'series': the series shifted by the same number of weeks as the visit (BR-P2).
 * @returns {{ move: object | null, blocker: { rule: string, message: string } | null,
 *   same: boolean }}
 */
export function evaluateMove(data, index, { occurrenceId, kind, week }) {
  const occurrence = index.visits.get(occurrenceId);
  const plan = index.planOf.get(occurrenceId);
  const same = week === occurrence.week;
  if (kind === 'series') {
    const anchor = addWeeks(plan.anchor_week, weeksBetween(occurrence.week, week));
    return {
      same,
      blocker: seriesBlocker(week, data.current_week),
      move: {
        kind: 'series',
        planId: plan.id,
        code: plan.code,
        anchor,
        from: plan.anchor_week,
        version: plan.version,
      },
    };
  }
  return {
    same,
    blocker: moveBlocker(plan, occurrence, week, data.current_week),
    move: {
      kind: 'occurrence',
      planId: plan.id,
      code: plan.code,
      id: occurrence.id,
      week,
      from: occurrence.week,
      version: occurrence.version,
    },
  };
}

/** Weeks a dragged visit may go to, as an index range of the weeks shown. Pure. */
export function allowedRange(data, plan, occurrence, kind) {
  const weeks = data.weeks.map((w) => w.week);
  const first = weeks.findIndex((w) => w >= data.current_week);
  if (kind === 'series') return { from: first === -1 ? weeks.length : first, to: weeks.length - 1 };
  const { from, to } = allowedWeeks(plan, occurrence, data.current_week);
  return {
    from: weeks.findIndex((w) => w >= from),
    to: weeks.findLastIndex((w) => w <= to),
  };
}

/**
 * Wires drag and keyboard moves on a rendered planner.
 * @param {HTMLElement} root the planner (renderPlanner's container)
 * @param {object} options
 * @param {object} options.data the timeline shown
 * @param {(move: object) => { figures: object[] } } options.onPreview figures as if dropped
 * @param {() => void} options.onCancel back to the real figures
 * @param {(move: object) => void} options.onCommit send the move
 * @param {(message: string) => void} options.onRefuse explain a refused drop
 * @param {(message: string) => void} options.announce screen reader message
 * @returns {() => void} detach
 */
export function attachPlannerEditing(
  root,
  { data, onPreview, onCancel, onCommit, onRefuse, announce },
) {
  const index = timelineIndex(data);
  const grid = root.querySelector('.planner-grid');
  const scroller = root.querySelector('.planner-scroll');
  if (!grid) return () => {};
  let active = null; // { chip, row, kind, occurrenceId, origin, target, pointer?, keyboard? }
  let pending = null; // a press on a movable chip that may become a drag
  let swallowClick = false;

  const cellsOf = (row) => [...row.querySelectorAll('td.week-cell')];
  const cellIndex = (chip) => Number(chip.closest('td').dataset.index);

  function begin(chip, kind, extra) {
    const row = chip.closest('tr');
    const occurrenceId = Number(chip.dataset.occurrence);
    const occurrence = index.visits.get(occurrenceId);
    const plan = index.plans.get(Number(chip.dataset.plan));
    active = { chip, row, kind, occurrenceId, origin: cellIndex(chip), target: null, ...extra };
    const { from, to } = allowedRange(data, plan, occurrence, kind);
    cellsOf(row).forEach((cell, i) => cell.classList.toggle('is-allowed', i >= from && i <= to));
    row.classList.add('is-moving');
    chip.classList.add('is-dragged');
    root.classList.add('is-moving-visit');
  }

  function clearGhosts() {
    for (const el of grid.querySelectorAll('.chip-ghost')) el.remove();
    for (const el of grid.querySelectorAll('.is-leaving, .is-drop-target, .is-drop-refused')) {
      el.classList.remove('is-leaving', 'is-drop-target', 'is-drop-refused');
    }
  }

  /** Shows where the visits would go, and the figures as if dropped. */
  function update(target) {
    if (!active || target === active.target) return active?.result;
    active.target = target;
    clearGhosts();
    const cells = cellsOf(active.row);
    const week = data.weeks[target].week;
    const result = evaluateMove(data, index, {
      occurrenceId: active.occurrenceId,
      kind: active.kind,
      week,
    });
    active.result = result;
    cells[target].classList.add(result.blocker ? 'is-drop-refused' : 'is-drop-target');
    if (result.blocker || result.same) {
      onCancel();
      return result;
    }
    const plan = index.plans.get(result.move.planId);
    const weeks = data.weeks.map((w) => w.week);
    const visits = previewPlanVisits(plan, result.move, { weeks, currentWeek: data.current_week });
    const stays = new Set(visits.filter((v) => v.id !== null).map((v) => `${v.id}:${v.week}`));
    for (const chip of active.row.querySelectorAll('.chip[data-occurrence]')) {
      const o = index.visits.get(Number(chip.dataset.occurrence));
      if (!stays.has(`${o.id}:${o.week}`)) chip.classList.add('is-leaving');
    }
    for (const v of visits) {
      const original = v.id === null ? null : index.visits.get(v.id);
      if (original && original.week === v.week) continue;
      const i = weeks.indexOf(v.week);
      if (i === -1) continue;
      const ghost = active.chip.cloneNode(true);
      // A picture only: no identity of the visit, so no selector or handler can take it for one.
      ghost.className = 'chip chip-ghost';
      for (const name of Object.keys(ghost.dataset)) delete ghost.dataset[name];
      for (const name of ['id', 'title', 'aria-label', 'aria-describedby', 'aria-current']) {
        ghost.removeAttribute(name);
      }
      ghost.setAttribute('aria-hidden', 'true');
      ghost.tabIndex = -1;
      cells[i].append(ghost);
    }
    result.preview = onPreview(result.move);
    return result;
  }

  function end() {
    if (!active) return;
    clearGhosts();
    for (const cell of cellsOf(active.row)) cell.classList.remove('is-allowed');
    active.row.classList.remove('is-moving');
    active.chip.classList.remove('is-dragged');
    root.classList.remove('is-moving-visit');
    active = null;
  }

  function cancel(message) {
    if (!active) return;
    end();
    onCancel();
    if (message) announce(message);
  }

  function drop() {
    const result = active?.result;
    const chip = active?.chip;
    end();
    if (!result || result.same) {
      onCancel();
      return;
    }
    if (result.blocker) {
      onCancel();
      onRefuse(result.blocker.message);
      chip?.focus();
      return;
    }
    onCommit(result.move);
  }

  /** Index of the week column under the pointer, in the row being moved. */
  function targetAt(x) {
    const cells = cellsOf(active.row);
    const i = cells.findIndex((cell) => {
      const box = cell.getBoundingClientRect();
      return x >= box.left && x < box.right;
    });
    if (i !== -1) return i;
    return x < cells[0].getBoundingClientRect().left ? 0 : cells.length - 1;
  }

  const onPointerDown = (event) => {
    const chip = event.target.closest?.('.chip.is-movable');
    if (!chip || event.button !== 0 || active) return;
    const kind = event.altKey ? 'series' : chip.dataset.move;
    pending = { chip, kind, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };

  const onPointerMove = (event) => {
    if (pending && !active) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_THRESHOLD) return;
      try {
        pending.chip.setPointerCapture(pending.pointerId);
      } catch {
        // An unknown pointer (synthetic events): the drag works without the capture.
      }
      begin(pending.chip, pending.kind, { pointer: true });
      pending = null;
    }
    if (!active?.pointer) return;
    event.preventDefault();
    const box = scroller.getBoundingClientRect();
    const sticky = active.row.querySelector('th').getBoundingClientRect().right;
    if (event.clientX > box.right - EDGE) scroller.scrollLeft += 16;
    else if (event.clientX < Math.max(box.left, sticky) + EDGE) scroller.scrollLeft -= 16;
    update(targetAt(event.clientX));
  };

  const onPointerUp = () => {
    pending = null;
    if (!active?.pointer) return;
    swallowClick = true;
    drop();
  };

  const onPointerCancel = () => {
    pending = null;
    if (active?.pointer) cancel();
  };

  // A drag ends with a click on the chip: it must not open the panel.
  const onClick = (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Focus the chip of an adjacent row nearest to a week column. */
  function focusRow(chip, step) {
    const rows = [...grid.querySelectorAll('tr.plan-row')];
    const from = cellIndex(chip);
    for (let r = rows.indexOf(chip.closest('tr')) + step; r >= 0 && r < rows.length; r += step) {
      const chips = [...rows[r].querySelectorAll('.chip[data-occurrence]')];
      if (!chips.length) continue;
      chips.sort((a, b) => Math.abs(cellIndex(a) - from) - Math.abs(cellIndex(b) - from));
      chips[0].focus();
      return;
    }
  }

  const onKeyDown = (event) => {
    const chip = event.target.closest?.('.chip[data-occurrence]');
    if (!chip) return;
    const moving = active?.keyboard && active.chip === chip;
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';

    if (moving && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel(t('Move cancelled.'));
      return;
    }
    if (moving && event.key === 'Enter') {
      event.preventDefault();
      const result = active.result;
      drop();
      if (!result || result.same) announce(t('Nothing moved.'));
      return;
    }
    if (horizontal && event.shiftKey) {
      if (!chip.classList.contains('is-movable')) {
        announce(t('This visit cannot be moved: only planned visits from this week on can.'));
        return;
      }
      event.preventDefault();
      if (!moving) {
        cancel();
        begin(chip, event.altKey ? 'series' : chip.dataset.move, { keyboard: true });
        active.target = active.origin;
      }
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = Math.min(Math.max(active.target + step, 0), data.weeks.length - 1);
      const result = update(next);
      const week = formatWeek(data.weeks[next].week);
      const what = active.kind === 'series' ? t('Series') : t('Visit');
      if (result.blocker)
        announce(t('{label}: {value}', { label: week, value: result.blocker.message }));
      else if (result.same) announce(t('{week}: where it is now.', { week }));
      else {
        const load = result.preview?.figures?.[next]?.load;
        const share =
          load === null || load === undefined
            ? ''
            : t(', load {value}%', { value: Math.round(load * 100) });
        announce(
          t('{what} to {week}{share}. Enter to confirm, Escape to cancel.', { what, week, share }),
        );
      }
      return;
    }
    if (moving) return;
    if (horizontal) {
      event.preventDefault();
      const chips = [...chip.closest('tr').querySelectorAll('.chip[data-occurrence]')];
      chips[chips.indexOf(chip) + (event.key === 'ArrowRight' ? 1 : -1)]?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(chip, event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  // Leaving the chip during a keyboard move cancels it.
  const onFocusOut = (event) => {
    if (active?.keyboard && event.target === active.chip) cancel();
  };

  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('pointermove', onPointerMove);
  grid.addEventListener('pointerup', onPointerUp);
  grid.addEventListener('pointercancel', onPointerCancel);
  grid.addEventListener('click', onClick, true);
  grid.addEventListener('keydown', onKeyDown);
  grid.addEventListener('focusout', onFocusOut);
  return () => {
    cancel();
    grid.removeEventListener('pointerdown', onPointerDown);
    grid.removeEventListener('pointermove', onPointerMove);
    grid.removeEventListener('pointerup', onPointerUp);
    grid.removeEventListener('pointercancel', onPointerCancel);
    grid.removeEventListener('click', onClick, true);
    grid.removeEventListener('keydown', onKeyDown);
    grid.removeEventListener('focusout', onFocusOut);
  };
}
