// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Week scheduler and My week pages (D48, Phase 19, D52, D54): fetching the week, every
// change sent through the Undo / Redo history, the side panels, and My week with its copy on
// the device. The rendering is in schedule.js, schedule-panel.js, schedule-editing.js and
// my-week.js.
import { apiFieldErrors, showErrors } from './admin-users.js';
import { apiFetch } from './api.js';
import { currentUser, hasRole } from './auth.js';
import { h, replaceChildren } from './dom.js';
import { announce, confirmDialog, renderPage, setSplitView, setTitle } from './layout.js';
import { formatWeek } from './format.js';
import { readMyWeek, renderMyWeek, saveMyWeek } from './my-week.js';
import { longDayLabel as longDay, renderScheduler, scheduleUrl } from './schedule.js';
import { valueLabel } from './labels.js';
import { attachScheduleEditing } from './schedule-editing.js';
import { blockBody, createScheduleHistory } from './schedule-history.js';
import {
  renderBlockPanel,
  renderCapacityPanel,
  renderItemPanel,
  renderTimePanel,
} from './schedule-panel.js';
import { formatDuration, hoursToSchedule, reorder } from './schedule-rules.js';
import { currentRoute, navigate } from './router.js';

const tableContainer = document.getElementById('table-container');
const detailContainer = document.getElementById('detail-container');

/** What the pages need from the app shell (app.js), given once at startup. */
let app = null;

/**
 * @param {{ render: (route: object) => Promise<void>,
 *   leaveRecordViews: (section: string, title: string) => void,
 *   showConsoleError: (err: Error, retry: () => void) => void,
 *   showPlaceholder: (section: string | null, title: string, message: string) => void }} hooks
 */
export function initSchedulePage(hooks) {
  app = hooks;
}

/** Week last shown on the scheduler, so opening or closing a panel does not fetch it again. */
let scheduleCache = null; // { week, data }
let detachScheduleEditing = null;
/** Scheduler on screen: its message line. */
let scheduleView = null;
/** Changes made on the scheduler in this visit, for Undo / Redo (D54). */
const scheduleHistory = createScheduleHistory(apiFetch);

/** Today in the browser's time zone, 'YYYY-MM-DD'. */
const todayDate = () => new Intl.DateTimeFormat('en-CA').format(new Date());

/** Error text of a scheduler write, offline included. */
const writeError = (err, what = 'nothing was changed') =>
  err.status === 0 ? `You are offline: ${what}.` : `Not changed: ${err.message}`;

/**
 * Sends one change of the scheduler, then draws the week again (closing the panel when
 * `close`) and says what was done. `change` is a change for the history (schedule-history.js),
 * kept for Undo, or a function for a write outside it (the estimate of a work order).
 * Resolves to an error message, or null.
 */
async function scheduleChange(change, done, { form = null, close = false } = {}) {
  try {
    if (typeof change === 'function') await change();
    else await scheduleHistory.perform({ ...change, text: done.replace(/\.$/, '') });
  } catch (err) {
    const message = writeError(err);
    if (form) showErrors(form, apiFieldErrors(err), message);
    else {
      scheduleView?.say(message, 'danger');
      announce(message);
    }
    return message;
  }
  scheduleCache = null;
  announce(done);
  const route = currentRoute();
  if (close && route.panel) await navigate(scheduleUrl(route.week), { force: true });
  else await app.render(route);
  scheduleView?.say(done, 'success');
  return null;
}

/** Undo or Redo the last change of the scheduler, then draw the week again. */
async function replaySchedule(mode) {
  let change;
  try {
    change = await scheduleHistory[mode]();
  } catch (err) {
    const message = `${writeError(err)} The change could not be ${mode === 'undo' ? 'undone' : 'redone'}.`;
    announce(message);
    scheduleCache = null;
    await app.render(currentRoute()); // show what is there now
    scheduleView?.say(message, 'danger');
    return;
  }
  if (!change) return;
  const text = `${mode === 'undo' ? 'Undone' : 'Redone'}: ${change.text}.`;
  announce(text);
  scheduleCache = null;
  await app.render(currentRoute());
  scheduleView?.say(text, 'success');
}

/** Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) on the scheduler, outside text fields. */
export function onScheduleShortcut(event) {
  if (currentRoute().name !== 'schedule' || !hasRole('SUPERVISOR', 'ADMIN')) return;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) replaySchedule('undo');
  else if (key === 'y' || (key === 'z' && event.shiftKey)) replaySchedule('redo');
  else return;
  event.preventDefault();
}

/** Values of a block for the fields of `changes`, to put them back. Pure. */
const fieldsOf = (block, changes) =>
  Object.fromEntries(Object.keys(changes).map((k) => [k, block[k] ?? null]));

const personNameOf = (data, id) => {
  const p = data.people.find((x) => x.id === id);
  return p ? `${p.first_name} ${p.last_name}` : 'someone';
};

export async function showSchedule(route, isCurrent) {
  app.leaveRecordViews('schedule', 'Week scheduler');
  const week = route.week;
  const cached = scheduleCache && scheduleCache.week === week ? scheduleCache.data : null;
  if (!tableContainer.querySelector('.scheduler')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the week…'));
  }
  let data;
  try {
    data = cached ?? (await apiFetch(`/schedule${week ? `?week=${week}` : ''}`));
  } catch (err) {
    if (!isCurrent()) return;
    app.showConsoleError(err, () => app.render(currentRoute()));
    if (err.status === 0) {
      tableContainer.querySelector('.error-state p').textContent =
        'The week scheduler needs a connection to the server. Technicians find their own week, saved on the device, under My week.';
    }
    return;
  }
  if (!isCurrent()) return;
  scheduleCache = { week, data };
  const canEdit = hasRole('SUPERVISOR', 'ADMIN');
  const panel = route.panel;
  const shownWeek = data.week === data.current_week ? null : data.week;
  const hadFocus = tableContainer.contains(document.activeElement);
  const previous = tableContainer.querySelector('.schedule-scroll');
  const scroll = previous ? { left: previous.scrollLeft, top: previous.scrollTop } : null;

  detachScheduleEditing?.();
  const labels = scheduleHistory.labels();
  scheduleView = renderScheduler(tableContainer, {
    data,
    canEdit,
    panel,
    today: todayDate(),
    history: {
      undoLabel: labels.undo,
      redoLabel: labels.redo,
      onUndo: () => replaySchedule('undo'),
      onRedo: () => replaySchedule('redo'),
    },
    onWeek: (next) => navigate(scheduleUrl(next === data.current_week ? null : next)),
    onWeekend: (key, open) =>
      scheduleChange(
        {
          kind: 'weekend',
          week: data.week,
          before: { saturday_open: data.saturday_open, sunday_open: data.sunday_open },
          after: { saturday_open: data.saturday_open, sunday_open: data.sunday_open, [key]: open },
        },
        `${key === 'saturday_open' ? 'Saturday' : 'Sunday'} ${open ? 'opened' : 'closed'} for ${formatWeek(data.week)}.`,
      ),
  });
  const grid = tableContainer.querySelector('.schedule-scroll');
  if (scroll && grid) Object.assign(grid, { scrollLeft: scroll.left, scrollTop: scroll.top });

  const trayItem = (id) => data.tray.find((t) => t.id === id);
  const blockById = (id) => data.people.flatMap((p) => p.blocks).find((b) => b.id === id);
  const max = data.settings.max_block_hours;
  detachScheduleEditing = canEdit
    ? attachScheduleEditing(tableContainer, {
        data,
        onDrop: (drop) => {
          const who = personNameOf(data, drop.person);
          const when = longDay(drop.day);
          if (drop.kind === 'item') {
            const item = trayItem(drop.id);
            const hours = hoursToSchedule(item, max);
            // A long job, or one without an estimate: the split proposal opens (BR-S1, BR-S2).
            if (hours === null || hours > max) {
              return navigate(
                scheduleUrl(shownWeek, {
                  type: 'item',
                  id: item.id,
                  person: drop.person,
                  day: drop.day,
                }),
              );
            }
            return scheduleChange(
              {
                kind: 'create',
                blocks: [
                  {
                    kind: 'WORK',
                    work_order_id: item.id,
                    technician_id: drop.person,
                    day: drop.day,
                    hours,
                  },
                ],
              },
              `${item.number}: ${formatDuration(hours)} for ${who} on ${when}.`,
            );
          }
          const block = blockById(drop.id);
          const moved = { day: drop.day, technician_id: drop.person };
          return scheduleChange(
            {
              kind: 'update',
              ref: scheduleHistory.refOf(block),
              before: fieldsOf(block, moved),
              after: moved,
            },
            `Block moved to ${who}, ${when}.`,
          );
        },
        onResize: (id, hours) => {
          const block = blockById(id);
          return scheduleChange(
            {
              kind: 'update',
              ref: scheduleHistory.refOf(block),
              before: { hours: block.hours },
              after: { hours },
            },
            `Block now ${formatDuration(hours)}.`,
          );
        },
        onRefuse: (message) => {
          scheduleView.say(message, 'danger');
          announce(message);
        },
        announce,
      })
    : null;

  const close = () => navigate(scheduleUrl(shownWeek));
  setSplitView(Boolean(panel));
  if (!panel) {
    replaceChildren(detailContainer);
    if (!hadFocus) tableContainer.querySelector('#schedule-tiles-heading')?.focus();
    return;
  }
  const notFound = (text) => {
    replaceChildren(
      detailContainer,
      h(
        'div',
        { class: 'detail-header' },
        h('h2', { class: 'detail-title', tabindex: '-1' }, text),
      ),
      h('p', {}, h('a', { href: scheduleUrl(shownWeek), 'data-link': true }, 'Back to the week')),
    );
    detailContainer.querySelector('.detail-title')?.focus();
  };
  if (panel.type === 'item') {
    const item = trayItem(panel.id);
    if (!item) return notFound('This work order is not in this week’s tray');
    setTitle(`Schedule ${item.number}`);
    renderItemPanel(detailContainer, {
      item,
      data,
      panel,
      today: todayDate(),
      canEdit,
      onClose: close,
      onSubmit: async ({ blocks, estimate }, form) => {
        if (!blocks.length) return showErrors(form, {}, 'Add at least one block.');
        if (estimate !== null) {
          if (!(estimate > 0) || estimate * 2 !== Math.round(estimate * 2)) {
            return showErrors(
              form,
              { estimate: 'Hours in steps of half an hour' },
              'Check the highlighted fields.',
            );
          }
          // BR-S2: the estimate first, on the work order itself, at its current version.
          const error = await scheduleChange(
            async () => {
              const wo = await apiFetch(`/work-orders/${item.id}`);
              await apiFetch(`/work-orders/${item.id}`, {
                method: 'PUT',
                body: { estimated_hours: estimate, version: wo.version },
              });
            },
            `${item.number}: estimate set to ${formatDuration(estimate)}.`,
            { form },
          );
          if (error) return;
        }
        const total = blocks.reduce((s, b) => s + b.hours, 0);
        return scheduleChange(
          { kind: 'create', blocks },
          `${item.number}: ${formatDuration(total)} scheduled in ${blocks.length} block${blocks.length === 1 ? '' : 's'}.`,
          { form, close: true },
        );
      },
    });
    detailContainer.querySelector('.detail-title')?.focus();
    return;
  }
  if (panel.type === 'block') {
    const block = blockById(panel.id);
    if (!block) return notFound('This block is not in this week');
    const person = data.people.find((p) => p.id === block.technician_id);
    setTitle('Block');
    renderBlockPanel(detailContainer, {
      block,
      person,
      data,
      canEdit,
      canLock: canEdit || block.technician_id === currentUser().id,
      onClose: close,
      onUpdate: (changes, form) => {
        if (!Object.keys(changes).length)
          return showErrors(form, {}, 'Nothing to save: no value was changed.');
        return scheduleChange(
          {
            kind: 'update',
            ref: scheduleHistory.refOf(block),
            before: fieldsOf(block, changes),
            after: changes,
          },
          'Block saved.',
          { form },
        );
      },
      onDelete: async () => {
        const choice = await confirmDialog({
          title: 'Remove this block?',
          message: 'Its hours go back to the tray.',
          actions: [
            { value: 'remove', label: 'Remove', primary: true },
            { value: 'cancel', label: 'Cancel' },
          ],
        });
        if (choice !== 'remove') return;
        scheduleChange(
          { kind: 'delete', ref: scheduleHistory.refOf(block), block: blockBody(block) },
          'Block removed: its hours are back in the tray.',
          { close: true },
        );
      },
      onLock: (start, form) =>
        scheduleChange(
          {
            kind: 'lock',
            ref: scheduleHistory.refOf(block),
            from: block.locked_start,
            to: start,
          },
          start ? `Appointment locked at ${start}.` : 'Appointment unlocked.',
          { form },
        ),
    });
    detailContainer.querySelector('.detail-title')?.focus();
    return;
  }
  const person = data.people.find((p) => p.id === panel.person);
  if (!person || !person.days.some((d) => d.day === panel.day) || !canEdit) {
    return notFound(
      canEdit
        ? 'This day is not in this week'
        : 'Only supervisors and administrators change the week',
    );
  }
  if (panel.type === 'time') {
    setTitle('Add time');
    renderTimePanel(detailContainer, {
      data,
      person: person.id,
      day: panel.day,
      onClose: close,
      onSubmit: (block, form) =>
        scheduleChange(
          { kind: 'create', blocks: [block] },
          `${valueLabel('allocation_kind', block.kind)}: ${formatDuration(block.hours)} for ${personNameOf(data, block.technician_id)} on ${longDay(block.day)}.`,
          { form, close: true },
        ),
    });
  } else {
    setTitle('Hours of the day');
    renderCapacityPanel(detailContainer, {
      data,
      person,
      day: panel.day,
      onClose: close,
      onSubmit: (input, form) =>
        scheduleChange(
          {
            kind: 'capacity',
            person: person.id,
            day: panel.day,
            before: person.days.find((d) => d.day === panel.day).override,
            after: input.hours === null ? null : input,
          },
          input.hours === null
            ? `${personNameOf(data, person.id)}: usual hours on ${longDay(panel.day)}.`
            : `${personNameOf(data, person.id)}: ${formatDuration(input.hours)} on ${longDay(panel.day)}.`,
          { form, close: true },
        ),
    });
  }
  detailContainer.querySelector('.detail-title')?.focus();
}

/** My week: fetched when online and saved on the device; the saved copy when offline. */
export async function showMyWeek(route, isCurrent) {
  app.leaveRecordViews('my_week', 'My week');
  if (!tableContainer.querySelector('.my-week')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading your week…'));
  }
  let data;
  let savedOffline = false;
  try {
    data = await apiFetch(`/my-week${route.week ? `?week=${route.week}` : ''}`);
    saveMyWeek(data).catch(() => {});
  } catch (err) {
    if (!isCurrent()) return;
    data = err.status === 0 ? await readMyWeek(route.week) : null;
    if (!data) {
      app.showConsoleError(err, () => app.render(currentRoute()));
      if (err.status === 0) {
        tableContainer.querySelector('.error-state p').textContent =
          'This week has not been saved on this device yet: open My week once with a connection.';
      }
      return;
    }
    savedOffline = true;
  }
  if (!isCurrent()) return;
  setSplitView(false);
  replaceChildren(detailContainer);
  // After a change, the block keeps its "Change…" buttons open (M4).
  const focusBlock = (id) => {
    const block = tableContainer.querySelector(`[data-block="${id}"]`);
    const change = block?.querySelector('.my-block-change');
    if (change) change.open = true;
    block?.focus();
  };
  const change = async (send, done, blockId) => {
    try {
      await send();
    } catch (err) {
      const message = writeError(err);
      view.say(message, 'danger');
      announce(message);
      return;
    }
    announce(done);
    await app.render(currentRoute());
    focusBlock(blockId);
  };
  const view = renderMyWeek(tableContainer, {
    data,
    today: todayDate(),
    savedOffline,
    canChange: !savedOffline,
    canAddTravel: hasRole('SUPERVISOR', 'ADMIN'),
    onMove: (day, block, direction) => {
      const ids = reorder(day.blocks, block.id, direction);
      if (!ids) return;
      change(
        () =>
          apiFetch('/schedule/day-order', {
            method: 'PUT',
            body: { technician_id: data.user.id, day: day.day, ids },
          }),
        direction < 0 ? 'Moved up.' : 'Moved down.',
        block.id,
      );
    },
    onLock: (block, start) =>
      change(
        () =>
          apiFetch(`/schedule/allocations/${block.id}/lock`, {
            method: 'PUT',
            body: { locked_start: start, version: block.version },
          }),
        start ? `Locked at ${start}.` : 'Time unlocked.',
        block.id,
      ),
  });
  // The week opens on today, not on the days already done (M3). On a Monday the week's
  // toolbar stays in view.
  const todayTitle = view.todaySection?.querySelector('h2');
  if (todayTitle && view.todaySection.previousElementSibling?.classList.contains('my-day')) {
    todayTitle.focus({ preventScroll: true });
    view.todaySection.scrollIntoView({ block: 'start' });
  }
}

/**
 * Forgets the scheduler's state when the user leaves it: the week kept in memory, Undo /
 * Redo and the drag handlers.
 * @param {string} routeName the route being shown
 */
export function leaveSchedule(routeName) {
  if (routeName === 'schedule') return;
  scheduleCache = null;
  scheduleHistory.clear();
  detachScheduleEditing?.();
  detachScheduleEditing = null;
}
