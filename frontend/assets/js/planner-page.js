// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Year planner pages (D48, Phases 17 to 20): the planner with its panels (plan, plan form,
// blocked weeks, balancing proposal), its moves with Undo / Redo, and the planning settings.
// Online only (P18). The planner's rendering is in planning.js, plan-panel.js and
// planner-editing.js; this module fetches, sends and keeps the planner's state while the user
// stays on it.
import { apiFieldErrors, showErrors } from './admin-users.js';
import { apiFetch } from './api.js';
import { hasRole } from './auth.js';
import { h } from './dom.js';
import { getRefs } from './editor.js';
import { announce, renderPage } from './layout.js';
import { findAssetByCode } from './refs.js';
import {
  checkPlanForm,
  planBody,
  planFieldErrors,
  renderBlockedWeeksPanel,
  renderPlanForm,
  renderPlanPanel,
  renderSuggestionsPanel,
} from './plan-panel.js';
import {
  planningUrl,
  renderPlanner,
  setPlannerPanel,
  suggestionsBody,
  timelineQuery,
} from './planning.js';
import { attachPlannerEditing } from './planner-editing.js';
import { previewFigures, previewMoves } from './planning-rules.js';
import { CATEGORIES } from './enums.js';
import { formatWeek } from './format.js';
import { renderPlanningSettings } from './planning-settings.js';
import { openAssetPicker } from './asset-picker.js';
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
export function initPlannerPage(hooks) {
  app = hooks;
}

/** Timeline last shown, so opening or closing a plan panel does not fetch it again. */
let plannerCache = null; // { query, data }
export const PLANNER_ROUTES = ['planning', 'plan', 'planCreate', 'blockedWeeks', 'suggestions'];
/** Balancing proposal on screen (Phase 20): fetched once per range and filters. */
let suggestionState = null; // { query, proposal, selected: Set<number> }
/** Changes made on the planner in this visit, for Undo / Redo (spec §7). */
const plannerHistory = { undo: [], redo: [] };
/** Planner on screen: live preview of a move, messages. */
let plannerView = null;
let detachEditing = null;
/** What to focus once the planner is drawn again after a change. */
let plannerFocus = null; // { occurrence } | { plan }

/** "PM-0012: visit week 50 → week 52" for messages and the Undo / Redo buttons. */
function changeText(change) {
  const week = (w) => formatWeek(w).replace(/, \d{4}$/, '');
  switch (change.kind) {
    case 'occurrence':
      return `${change.code}: visit ${week(change.from)} → ${week(change.week)}`;
    case 'series':
      return `${change.code}: series from ${week(change.from)} → ${week(change.anchor)}`;
    case 'skip':
      return `${change.code}: visit of ${week(change.week)} skipped`;
    case 'batch':
      return `Balancing: ${change.changes.length} visit${change.changes.length === 1 ? '' : 's'} moved`;
    default:
      return `${change.code}: visit of ${week(change.week)} restored`;
  }
}

/** The change that undoes another. */
function opposite(change) {
  if (change.kind === 'batch')
    return { ...change, changes: change.changes.map(opposite).reverse() };
  if (change.kind === 'occurrence') return { ...change, week: change.from, from: change.week };
  if (change.kind === 'series') return { ...change, anchor: change.from, from: change.anchor };
  return { ...change, kind: change.kind === 'skip' ? 'restore' : 'skip' };
}

/**
 * Sends one planner change at the current version of the record, after checking it is still
 * as the change expects (the record may have changed since, e.g. after a series move).
 */
async function sendPlannerChange(change) {
  if (change.kind === 'batch') {
    for (const one of change.changes) await sendPlannerChange(one);
    return null;
  }
  if (change.kind === 'series') {
    const plan = await apiFetch(`/plans/${change.planId}`);
    if (plan.anchor_week !== change.from) throw new Error('This plan changed since: reload it.');
    return apiFetch(`/plans/${change.planId}/anchor`, {
      method: 'PUT',
      body: { anchor_week: change.anchor, version: plan.version },
    });
  }
  const visit = await apiFetch(`/plan-occurrences/${change.id}`);
  const expected =
    change.kind === 'occurrence'
      ? visit.status === 'PLANNED' && visit.week === change.from
      : visit.status === (change.kind === 'skip' ? 'PLANNED' : 'SKIPPED');
  if (!expected) throw new Error('This visit changed since: reload the planner.');
  const { version } = visit;
  if (change.kind === 'occurrence') {
    return apiFetch(`/plan-occurrences/${change.id}`, {
      method: 'PUT',
      body: { week: change.week, version },
    });
  }
  return apiFetch(`/plan-occurrences/${change.id}/${change.kind}`, {
    method: 'POST',
    body: change.kind === 'skip' ? { reason: change.reason, version } : { version },
  });
}

/**
 * Applies a change (a drop, a keyboard move, the panel) or replays one (Undo / Redo), then
 * draws the planner again. Resolves to an error message, or null.
 * @param {'do' | 'undo' | 'redo'} mode
 */
async function applyPlannerChange(change, mode = 'do') {
  const sent = mode === 'undo' ? opposite(change) : change;
  try {
    await sendPlannerChange(sent);
  } catch (err) {
    const message =
      err.status === 0 ? 'You are offline: nothing was changed.' : `Not changed: ${err.message}`;
    announce(message);
    if (mode !== 'do') {
      // Show what is there now, then why: drawing the planner again empties its message line.
      plannerCache = null;
      await app.render(currentRoute());
    }
    plannerView?.say(message, 'danger');
    return message;
  }
  if (mode === 'undo') plannerHistory.redo.push(change);
  else {
    plannerHistory.undo.push(change);
    if (mode === 'do') plannerHistory.redo = [];
  }
  // Name the change itself ("Undone: visit week 17 → week 18"), not the opposite call.
  const text = `${{ do: '', undo: 'Undone: ', redo: 'Redone: ' }[mode]}${changeText(change)}.`;
  announce(text);
  plannerFocus =
    change.kind === 'series'
      ? { plan: change.planId }
      : { occurrence: change.kind === 'batch' ? change.changes[0].id : change.id };
  plannerCache = null;
  await app.render(currentRoute());
  plannerView?.say(text, 'success');
  return null;
}

const undoPlanner = () => {
  const change = plannerHistory.undo.pop();
  if (change) applyPlannerChange(change, 'undo');
};
const redoPlanner = () => {
  const change = plannerHistory.redo.pop();
  if (change) applyPlannerChange(change, 'redo');
};

/** Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) on the planner, outside text fields. */
export function onPlannerShortcut(event) {
  if (!PLANNER_ROUTES.includes(currentRoute().name) || !hasRole('SUPERVISOR', 'ADMIN')) return;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) undoPlanner();
  else if (key === 'y' || (key === 'z' && event.shiftKey)) redoPlanner();
  else return;
  event.preventDefault();
}

/** URL of a plan panel over the planner, with the visit clicked. */
function planUrl(filters, planId, occurrenceId = null) {
  const url = planningUrl(filters, `/planning/plans/${planId}`);
  if (!occurrenceId) return url;
  return `${url}${url.includes('?') ? '&' : '?'}occurrence=${occurrenceId}`;
}

export async function showPlanning(route, isCurrent) {
  app.leaveRecordViews('planning', 'Year planner');
  const filters = route.filters ?? {};
  const query = timelineQuery(filters);
  const cached = plannerCache?.query === query ? plannerCache.data : null;
  if (!tableContainer.querySelector('.planner')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the year planner…'));
  }
  let data;
  let plan = null;
  let blocked;
  try {
    [data, plan, blocked] = await Promise.all([
      cached ?? apiFetch(`/planning/timeline?${query}`),
      route.name === 'plan' ? apiFetch(`/plans/${route.id}`) : null,
      route.name === 'blockedWeeks' ? apiFetch('/planning/blocked-weeks') : null,
      route.name === 'suggestions' && suggestionState?.query !== query
        ? apiFetch('/planning/suggestions', { method: 'POST', body: suggestionsBody(filters) })
        : null,
    ]).then(([timeline, planRecord, blockedList, proposal]) => {
      if (proposal) {
        suggestionState = {
          query,
          proposal,
          selected: new Set(proposal.moves.map((m) => m.occurrence_id)),
        };
      }
      return [timeline, planRecord, blockedList];
    });
  } catch (err) {
    if (!isCurrent()) return;
    if (err.status === 404) {
      return app.showPlaceholder(
        'planning',
        'Plan not found',
        'This maintenance plan does not exist.',
      );
    }
    app.showConsoleError(err, () => app.render(currentRoute()));
    if (err.status === 0) {
      tableContainer.querySelector('.error-state p').textContent =
        'The year planner needs a connection to the server.';
    }
    return;
  }
  if (!isCurrent()) return;
  plannerCache = { query, data };
  const canEdit = hasRole('SUPERVISOR', 'ADMIN');
  const { sites } = await getRefs();
  if (!isCurrent()) return;

  // Keep the grid where the user scrolled it when a panel opens or closes.
  const previous = tableContainer.querySelector('.planner-scroll');
  const scroll = previous ? { left: previous.scrollLeft, top: previous.scrollTop } : null;
  const hadFocus = tableContainer.contains(document.activeElement);
  const last = (list) => (list.length ? changeText(list.at(-1)) : null);
  detachEditing?.();
  plannerView = renderPlanner(tableContainer, {
    data,
    filters,
    sites,
    canEdit,
    isAdmin: hasRole('ADMIN'),
    selectedId: route.occurrenceId ?? null,
    history: {
      undoLabel: last(plannerHistory.undo),
      redoLabel: last(plannerHistory.redo),
      onUndo: undoPlanner,
      onRedo: redoPlanner,
    },
    onFilter: (next) => navigate(planningUrl(next)),
    onOpen: (planId, occurrenceId) => navigate(planUrl(filters, planId, occurrenceId)),
  });
  detachEditing = canEdit
    ? attachPlannerEditing(tableContainer, {
        data,
        // Live impact: the tiles and the load strip as if the visit were dropped there.
        onPreview: (move) => {
          const preview = previewFigures(data, move.planId, move, CATEGORIES);
          plannerView.preview(preview);
          return preview;
        },
        onCancel: () => plannerView.reset(),
        onCommit: (move) => applyPlannerChange(move),
        onRefuse: (message) => {
          plannerView.say(message, 'danger');
          announce(message);
        },
        announce,
      })
    : null;
  const grid = tableContainer.querySelector('.planner-scroll');
  if (scroll) Object.assign(grid, { scrollLeft: scroll.left, scrollTop: scroll.top });
  if (plannerFocus) {
    const target = plannerFocus.occurrence
      ? grid.querySelector(`.chip[data-occurrence="${plannerFocus.occurrence}"]`)
      : grid.querySelector(`tr[data-plan="${plannerFocus.plan}"] .chip`);
    plannerFocus = null;
    if (target && !detailContainer.contains(document.activeElement)) {
      target.focus();
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  const close = () => navigate(planningUrl(filters));
  if (!setPlannerPanel(route.name, detailContainer)) {
    if (!hadFocus) tableContainer.querySelector('#planner-tiles-heading')?.focus();
    return;
  }
  const showForm = async (current) => {
    const { places } = await getRefs();
    renderPlanForm(detailContainer, {
      plan: current,
      sites,
      places,
      defaultWeek: data.current_week,
      onClose: current ? () => app.render(currentRoute()) : close,
      onSubmit: (raw, form, assetCode) => submitPlan(raw, form, assetCode, current, filters),
      pickAsset: (initial) =>
        openAssetPicker({
          dialog: document.getElementById('asset-dialog'),
          fetchPage: (q) => apiFetch(`/assets?${q}`),
          sites,
          initial,
        }),
    });
    detailContainer.querySelector('#p-title')?.focus();
  };
  if (route.name === 'suggestions') {
    return showSuggestions(data, filters, close);
  }
  if (route.name === 'planCreate') {
    return showForm(null);
  }
  if (route.name === 'blockedWeeks') {
    renderBlockedWeeksPanel(detailContainer, {
      items: blocked.items,
      sites,
      canEdit,
      onClose: close,
      onAdd: async (values, form) => {
        try {
          await apiFetch('/planning/blocked-weeks', { method: 'POST', body: values });
          plannerCache = null;
          announce(`${formatWeek(values.week)} blocked.`);
          app.render(currentRoute());
        } catch (err) {
          showErrors(
            form,
            apiFieldErrors(err),
            err.status === 0 ? 'You are offline: nothing was saved.' : err.message,
          );
        }
      },
      onRemove: async (item) => {
        try {
          await apiFetch(`/planning/blocked-weeks/${item.id}`, { method: 'DELETE' });
          plannerCache = null;
          announce(`${formatWeek(item.week)} is no longer blocked.`);
          app.render(currentRoute());
        } catch (err) {
          announce(err.status === 0 ? 'You are offline: nothing was removed.' : err.message);
        }
      },
    });
    detailContainer.querySelector('.detail-title')?.focus();
    return;
  }
  const occurrence = route.occurrenceId
    ? (data.groups
        .flatMap((g) => g.plans)
        .find((p) => p.id === plan.id)
        ?.occurrences.find((o) => o.id === route.occurrenceId) ??
      plan.occurrences.find((o) => o.id === route.occurrenceId) ??
      null)
    : null;
  renderPlanPanel(detailContainer, {
    plan,
    occurrence,
    settings: data.settings,
    canEdit,
    currentWeek: data.current_week,
    onClose: close,
    onEdit: () => showForm(plan),
    onMove: (move) => applyPlannerChange(move),
    onSkip: (visit, reason) =>
      applyPlannerChange({
        kind: 'skip',
        planId: plan.id,
        code: plan.code,
        id: visit.id,
        week: visit.week,
        reason,
      }),
    onRestore: (visit) =>
      applyPlannerChange({
        kind: 'restore',
        planId: plan.id,
        code: plan.code,
        id: visit.id,
        week: visit.week,
        reason: visit.skip_reason,
      }),
  });
  detailContainer.querySelector('.detail-title')?.focus();
}

/**
 * The balancing proposal over the planner (Phase 20): ghost chips for the moves ticked, the
 * tiles and load strip as if they were accepted, and the panel to tick, accept or discard.
 */
function showSuggestions(data, filters, close) {
  const { proposal, selected } = suggestionState;
  const loads = new Map(data.figures.map((f) => [f.week, f.load]));
  const draw = (focusId = null) => {
    const kept = proposal.moves.filter((m) => selected.has(m.occurrence_id));
    const after = previewMoves(data, kept, CATEGORIES);
    plannerView.propose(kept);
    if (kept.length) plannerView.preview(after);
    else plannerView.reset();
    renderSuggestionsPanel(detailContainer, {
      proposal,
      after,
      selected,
      currentWeek: data.current_week,
      capacityByCategory: data.capacity.by_category,
      loadOf: (week) => loads.get(week) ?? null,
      onToggle: (id, on) => {
        if (on) selected.add(id);
        else selected.delete(id);
        draw(`proposal-${id}`);
      },
      onToggleAll: (on) => {
        for (const m of proposal.moves) {
          if (on) selected.add(m.occurrence_id);
          else selected.delete(m.occurrence_id);
        }
        draw();
      },
      onAccept: () => acceptProposal(kept, filters),
      onClose: () => {
        suggestionState = null;
        close();
      },
    });
    if (focusId) detailContainer.querySelector(`#${focusId}`)?.focus();
  };
  draw();
  detailContainer.querySelector('.detail-title')?.focus();
}

/**
 * Sends the moves kept, one visit at a time through the usual move (BR-P3 checked again by the
 * server, at the visit's current version), and keeps them as one step for Undo.
 */
async function acceptProposal(moves, filters) {
  const done = [];
  const refused = [];
  for (const m of moves) {
    const change = {
      kind: 'occurrence',
      planId: m.plan_id,
      code: m.code,
      id: m.occurrence_id,
      week: m.to,
      from: m.from,
    };
    try {
      await sendPlannerChange(change);
      done.push(change);
    } catch (err) {
      refused.push({ change, message: err.status === 0 ? 'you are offline' : err.message });
      if (err.status === 0) break;
    }
  }
  if (done.length) {
    plannerHistory.undo.push({ kind: 'batch', changes: done });
    plannerHistory.redo = [];
  }
  suggestionState = null;
  plannerCache = null;
  const text = [
    done.length ? `${changeText({ kind: 'batch', changes: done })}.` : 'No visit was moved.',
    refused.length
      ? `${refused.length} not moved (${refused[0].change.code}: ${refused[0].message})`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  announce(text);
  await navigate(planningUrl(filters), { force: true });
  plannerView?.say(text, refused.length ? 'danger' : 'success');
}

/** Create or save a plan from the side panel form. */
async function submitPlan(raw, form, assetCode, plan, filters) {
  let assetId = null;
  if (assetCode) {
    const asset = await findAssetByCode(assetCode);
    if (!asset) {
      return showErrors(
        form,
        { asset_code: 'No asset has this code' },
        'Check the highlighted fields.',
      );
    }
    assetId = asset.id;
  }
  const body = planBody(raw, { editing: Boolean(plan), assetId });
  const errors = checkPlanForm(body, { hasAssetCode: Boolean(assetId) });
  if (Object.keys(errors).length) {
    return showErrors(form, errors, 'Check the highlighted fields.');
  }
  try {
    const result = plan
      ? await apiFetch(`/plans/${plan.id}`, {
          method: 'PUT',
          body: { ...body, version: plan.version },
        })
      : await apiFetch('/plans', { method: 'POST', body });
    plannerCache = null;
    announce(
      plan
        ? result.updated
          ? 'Plan saved.'
          : 'Nothing to save.'
        : `Plan ${result.item.code} created.`,
    );
    const url = planUrl(filters, result.item.id);
    if (url === location.pathname + location.search) app.render(currentRoute());
    else navigate(url, { force: true });
  } catch (err) {
    showErrors(
      form,
      planFieldErrors(apiFieldErrors(err)),
      err.status === 0 ? 'You are offline: the plan was not saved.' : err.message,
    );
  }
}

/** Planning settings (administrators, P16). */
export async function showPlanningSettings(isCurrent) {
  app.leaveRecordViews('planning_settings', 'Planning settings');
  renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the settings…'));
  let settings;
  try {
    settings = await apiFetch('/planning/settings');
  } catch (err) {
    if (!isCurrent()) return;
    app.showConsoleError(err, () => app.render(currentRoute()));
    if (err.status === 0) {
      tableContainer.querySelector('.error-state p').textContent =
        'The planning settings need a connection to the server.';
    }
    return;
  }
  if (!isCurrent()) return;
  renderPlanningSettings(tableContainer, {
    settings,
    onSave: async (body, form) => {
      if (!body) return showErrors(form, {}, 'Nothing to save: no value was changed.');
      try {
        await apiFetch('/planning/settings', { method: 'PUT', body });
        plannerCache = null;
        announce('Planning settings saved.');
        app.render(currentRoute());
      } catch (err) {
        showErrors(
          form,
          apiFieldErrors(err),
          err.status === 0 ? 'You are offline: the settings were not saved.' : err.message,
        );
      }
    },
  });
  tableContainer.querySelector('.placeholder-title')?.focus();
}

/**
 * Forgets the planner's state when the user leaves it: the timeline kept in memory, Undo /
 * Redo, the drag handlers; and the balancing proposal outside its own panel.
 * @param {string} routeName the route being shown
 */
export function leavePlanner(routeName) {
  if (routeName !== 'suggestions') suggestionState = null;
  if (PLANNER_ROUTES.includes(routeName)) return;
  plannerCache = null;
  plannerHistory.undo = [];
  plannerHistory.redo = [];
  detachEditing?.();
  detachEditing = null;
}
