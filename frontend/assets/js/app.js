// Entry point: wires the shell, the router and the views (docs/architecture.md).
// Data flow: IndexedDB first, then quiet revalidation from the server (stale-while-revalidate).
// Writes go through the sync queue (queue.js); editing and creation live in editor.js.
import { apiFetch, onUnauthorized } from './api.js';
import { currentUser, hasRole, isLoggedIn, logout } from './auth.js';
import { renderArbitration, renderConflictList, resolutionSummary } from './conflicts.js';
import { drawCategoryChart, renderDashboard } from './dashboard.js';
import * as DB from './db.js';
import { storesOf } from './db.js';
import { renderDetailMessage, showUpdateAvailable } from './detail.js';
import { renderAuditLog, withPeople } from './history.js';
import { h, replaceChildren } from './dom.js';
import {
  clearEditor,
  currentEditor,
  enqueueLeftoverDrafts,
  flushDraft,
  getRefs,
  leaveGuard,
  loadPendingCreations,
  onBeforeUnload,
  setRefs,
  setRerender,
  showCreate,
  showCreateAsset,
  showPendingCreation,
  showRecord,
  withPending,
} from './editor.js';
import { ENTITIES } from './entities.js';
import {
  announce,
  confirmDialog,
  initLayout,
  renderPage,
  renderPlaceholder,
  setActiveNav,
  setSplitView,
  setSyncStatus,
  setTitle,
  showLoggedIn,
  showLoggedOut,
} from './layout.js';
import { renderLogin } from './login.js';
import { initNetwork, isOnline, onNetworkChange } from './network.js';
import { prefetchAround } from './preload.js';
import {
  loadQueue,
  onQueueChange,
  pendingCount,
  resume as resumeQueue,
  setQueueHandlers,
  startQueue,
} from './queue.js';
import { findAssetById, loadRefs } from './refs.js';
import {
  currentRoute,
  detailUrl,
  listUrl,
  navigate,
  setNavigationGuard,
  startRouter,
} from './router.js';
import { canManageAssets } from './rules.js';
import { clearSession } from './session.js';
import {
  fetchAndStorePage,
  fetchAndStoreRecord,
  readCachedPage,
  readCachedRecord,
} from './sync.js';
import { focusPager, focusRow, renderPagination, renderTable, selectRow } from './table.js';

const tableContainer = document.getElementById('table-container');
const detailContainer = document.getElementById('detail-container');

/** Revalidation on window focus happens at most this often. */
const REVALIDATE_THROTTLE_MS = 10_000;

/**
 * Table page on screen. `data` is the server page; `byId` holds its records as the server
 * sent them (pending changes are applied when displayed), so the detail panel opens without
 * any lookup (D7).
 */
let shownPage = null; // { entity, page, pages, data, pinned, byId: Map }
/** Record open in the detail panel ('new' for the creation form). */
let openDetail = null; // { entity, id }
/** Focus to restore after the next render, e.g. the pagination button just used. */
let pendingFocus = null;
/** Increases on every navigation; work that finishes for an older render is discarded. */
let renderSeq = 0;
let lastRevalidation = 0;

function resetViews() {
  shownPage = null;
  openDetail = null;
  pendingFocus = null;
  clearEditor();
  setSplitView(false);
  replaceChildren(tableContainer);
  replaceChildren(detailContainer);
}

async function render(route) {
  const seq = ++renderSeq;
  const isCurrent = () => seq === renderSeq;

  if (route.name === 'root') return navigate('/dashboard', { replace: true, force: true });

  if (!isLoggedIn()) {
    if (route.name !== 'login') {
      const next = encodeURIComponent(location.pathname + location.search);
      return navigate(`/login?next=${next}`, { replace: true, force: true });
    }
    resetViews();
    showLoggedOut();
    setTitle('Log in');
    return renderLogin(document.getElementById('login-container'), {
      onLoggedIn: async (user) => {
        await forgetOtherUsersData(user);
        startSession(user);
        navigate(route.next, { replace: true, force: true });
      },
    });
  }
  if (route.name === 'login') return navigate(route.next, { replace: true, force: true });

  showLoggedIn(currentUser());
  switch (route.name) {
    case 'list':
    case 'detail':
    case 'create':
      return showEntity(route, isCurrent);
    case 'dashboard':
      return showDashboard(isCurrent);
    case 'audit':
      return hasRole('SUPERVISOR', 'ADMIN')
        ? showAuditLog(route, isCurrent)
        : showPlaceholder(
            null,
            'Access denied',
            'Only supervisors and administrators can open this page.',
          );
    case 'conflicts':
    case 'conflict':
      if (!hasRole('SUPERVISOR', 'ADMIN')) {
        return showPlaceholder(
          null,
          'Access denied',
          'Only supervisors and administrators can open this page.',
        );
      }
      return route.name === 'conflicts'
        ? showConflictList(isCurrent)
        : showConflict(route, isCurrent);
    default:
      return showPlaceholder(null, 'Page not found', 'This page does not exist.', true);
  }
}

/** Local data belongs to one user: clear it when someone else logs in on this browser. */
async function forgetOtherUsersData(user) {
  const previous = await DB.getConfig('user_id');
  if (previous !== undefined && previous !== user.id) await DB.clearAll();
  await DB.setConfig('user_id', user.id);
}

/** After login or at startup: lists for forms, leftover drafts, the queue. */
function startSession(user) {
  setRefs(loadRefs(user));
  loadQueue()
    .then(() => enqueueLeftoverDrafts(user))
    .then(() => resumeQueue())
    .catch(() => {});
}

function showPlaceholder(section, title, message, withHomeLink = false) {
  shownPage = null;
  openDetail = null;
  clearEditor();
  setActiveNav(section);
  setTitle(title);
  renderPlaceholder(title, message);
  if (withHomeLink) {
    tableContainer
      .querySelector('.placeholder')
      .append(h('p', {}, h('a', { href: '/dashboard', 'data-link': true }, 'Go to the dashboard')));
  }
  tableContainer.querySelector('.placeholder-title')?.focus();
}

// --- Dashboard ------------------------------------------------------------------------------

const DASHBOARD_CACHE = 'dashboard_cache';

/** Renders a dashboard snapshot { data, stats, fetched_at }, then draws the chart. */
async function paintDashboard(snapshot, fromCache, isCurrent) {
  const chart = renderDashboard(tableContainer, {
    data: snapshot.data,
    stats: snapshot.stats,
    fromCache,
    fetchedAt: snapshot.fetched_at,
  });
  try {
    await drawCategoryChart(chart.canvas, chart.rows);
  } catch {
    // No chart library (e.g. offline before it was ever cached): the table stays available.
    if (isCurrent()) tableContainer.querySelector('.chart-table')?.setAttribute('open', '');
  }
}

/** Dashboard: the copy saved on this device first, then fresh figures from the server. */
async function showDashboard(isCurrent) {
  leaveRecordViews('dashboard', 'Dashboard');
  const cached = await DB.getConfig(DASHBOARD_CACHE);
  if (!isCurrent()) return;
  if (cached) {
    renderPage();
    await paintDashboard(cached, true, isCurrent);
  } else {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the dashboard…'));
  }
  tableContainer.querySelector('#kpi-heading')?.focus();
  if (!isOnline() && cached) return;

  // Refresh keeps the frame: the previous render stays, dimmed, until new figures arrive.
  tableContainer.classList.add('is-refreshing');
  tableContainer.setAttribute('aria-busy', 'true');
  try {
    const [data, stats] = await Promise.all([
      apiFetch('/dashboard'),
      apiFetch('/work-orders/stats?period=30'),
    ]);
    const snapshot = { data, stats, fetched_at: new Date().toISOString() };
    await DB.setConfig(DASHBOARD_CACHE, snapshot);
    if (!isCurrent()) return;
    const hadFocus = tableContainer.contains(document.activeElement);
    await paintDashboard(snapshot, false, isCurrent);
    if (hadFocus) tableContainer.querySelector('#kpi-heading')?.focus();
  } catch (err) {
    if (!isCurrent() || cached) return; // the saved copy stays on screen with its date
    showConsoleError(err, () => render(currentRoute()));
    tableContainer.querySelector('.error-state p').textContent =
      err.status === 0
        ? 'The dashboard has not been loaded on this device yet, so it is not available offline.'
        : err.message;
  } finally {
    if (isCurrent()) {
      tableContainer.classList.remove('is-refreshing');
      tableContainer.removeAttribute('aria-busy');
    }
  }
}

// --- Audit log (supervisors and admins) ------------------------------------------------------

function auditUrl(entityType, page) {
  const query = new URLSearchParams();
  if (entityType) query.set('type', entityType);
  if (page > 1) query.set('page', String(page));
  const text = query.toString();
  return `/audit-log${text ? `?${text}` : ''}`;
}

async function showAuditLog(route, isCurrent) {
  leaveRecordViews('audit', 'Audit log');
  if (!tableContainer.querySelector('.audit-table, .filter-row')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the audit log…'));
  }
  const query = new URLSearchParams({ page: String(route.page), size: '50' });
  if (route.entityType) query.set('entity_type', route.entityType);
  let data;
  try {
    data = await apiFetch(`/audit-log?${query}`);
  } catch (err) {
    if (isCurrent()) {
      showConsoleError(err, () => render(currentRoute()));
      if (err.status === 0) {
        tableContainer.querySelector('.error-state p').textContent =
          'The audit log needs a connection to the server.';
      }
    }
    return;
  }
  if (!isCurrent()) return;
  renderPage();
  renderAuditLog(tableContainer, {
    data,
    entityType: route.entityType,
    lookups: withPeople({ users: (await getRefs()).users, assets: new Map() }, data.people),
    onFilter: (type) => navigate(auditUrl(type, 1)),
    pagination: renderPagination(data, (page, control) => {
      pendingFocus = { type: 'pager', control };
      navigate(auditUrl(route.entityType, page));
    }),
  });
  restoreFocus(() => tableContainer.querySelector('.table-title')?.focus());
}

// --- Conflict console (supervisors and admins) ---------------------------------------------

function leaveRecordViews(section, title) {
  shownPage = null;
  openDetail = null;
  clearEditor();
  setActiveNav(section);
  setTitle(title);
}

function showConsoleError(err, retry) {
  renderPage(
    h(
      'div',
      { class: 'error-state', role: 'alert' },
      h(
        'p',
        {},
        err.status === 0 ? 'The conflict console needs a connection to the server.' : err.message,
      ),
      h('button', { type: 'button', class: 'button button-secondary', onClick: retry }, 'Retry'),
    ),
  );
}

async function showConflictList(isCurrent) {
  leaveRecordViews('conflicts', 'Conflicts');
  renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading conflicts…'));
  let items;
  try {
    ({ items } = await apiFetch('/conflicts'));
  } catch (err) {
    if (isCurrent()) showConsoleError(err, () => render(currentRoute()));
    return;
  }
  if (!isCurrent()) return;
  renderConflictList(tableContainer, items);
  tableContainer.querySelector('.table-title')?.focus();
}

/** Names of people and assets that appear in a conflict. */
async function conflictLookups(conflict) {
  const assets = new Map();
  if (conflict.entity_type === 'work_orders') {
    const ids = [conflict.version_a.asset_id, conflict.version_b.asset_id].filter(Boolean);
    for (const id of new Set(ids)) {
      const asset = await findAssetById(id);
      if (asset) assets.set(id, asset);
    }
  }
  return { users: (await getRefs()).users, assets };
}

async function showConflict(route, isCurrent, error = '') {
  leaveRecordViews('conflicts', 'Conflicts');
  if (!error)
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the conflict…'));
  let conflict;
  try {
    conflict = await apiFetch(`/conflicts/${route.id}`);
  } catch (err) {
    if (!isCurrent()) return;
    if (err.status === 404) {
      renderPage(
        h(
          'div',
          { class: 'placeholder' },
          h('h2', { class: 'placeholder-title', tabindex: '-1' }, 'Conflict not found'),
          h('p', {}, h('a', { href: '/conflicts', 'data-link': true }, 'Back to the conflicts')),
        ),
      );
    } else {
      showConsoleError(err, () => render(currentRoute()));
    }
    return;
  }
  const lookups = await conflictLookups(conflict);
  if (!isCurrent()) return;

  renderPage();
  renderArbitration(tableContainer, conflict, {
    lookups,
    error,
    onResolve: async (choice, fields) => {
      const answer = await confirmDialog({
        title: 'Resolve this conflict?',
        message: `${resolutionSummary(choice, conflict)} This cannot be undone.`,
        actions: [
          { value: 'resolve', label: 'Resolve', primary: true },
          { value: 'cancel', label: 'Cancel' },
        ],
      });
      if (answer !== 'resolve') return;
      try {
        const res = await apiFetch(
          `${ENTITIES[conflict.entity_type].api}/${conflict.entity_id}/resolve-conflict`,
          {
            method: 'PUT',
            body: { conflict_id: conflict.id, choice, ...(fields && { fields }) },
          },
        );
        // The tables show the resolved record at once (no wait for revalidation).
        await DB.saveRecord(storesOf(conflict.entity_type).records, res.item.id, {
          ...res.item,
          _fetched_at: new Date().toISOString(),
        });
        announce(`Conflict on ${conflict.label} resolved.`);
        navigate('/conflicts', { force: true });
      } catch (err) {
        if (err.status === 409) {
          announce('This conflict was already resolved by someone else.');
          render(currentRoute());
        } else {
          const seq = renderSeq;
          await showConflict(route, () => seq === renderSeq, err.message);
          tableContainer.querySelector('[role="alert"]')?.focus();
        }
      }
    },
  });
  tableContainer.querySelector('.arbitration-title')?.focus();
}

/** Renders a table page (with pending changes and pending creations) and remembers it. */
function displayPage(route, data, pinned = shownPage?.pinned ?? []) {
  const items = data.items.map((record) => withPending(route.entity, record));
  shownPage = {
    entity: route.entity,
    page: route.page,
    pages: data.pages,
    data,
    pinned,
    byId: new Map([...pinned, ...data.items].map((record) => [record.id, record])),
  };
  renderTable(tableContainer, {
    entity: route.entity,
    data: { ...data, items },
    pinned,
    selectedId: route.id ?? null,
    onOpen: (id) => {
      performance.mark('detail-open');
      navigate(detailUrl(route.entity, id, route.page));
    },
    onPage: (page, control) => {
      pendingFocus = { type: 'pager', control };
      navigate(listUrl(route.entity, page));
    },
    actions: tableActions(route),
  });
}

/** "New …" button above a table: work orders for everyone, assets for supervisors and admins. */
function tableActions(route) {
  const page = route.page > 1 ? `?page=${route.page}` : '';
  if (route.entity === 'work_orders') {
    return [
      h(
        'a',
        { href: `/work-orders/new${page}`, 'data-link': true, class: 'button button-primary' },
        '+ New work order',
      ),
    ];
  }
  if (route.entity === 'assets' && canManageAssets(currentUser())) {
    return [
      h(
        'a',
        { href: `/assets/new${page}`, 'data-link': true, class: 'button button-primary' },
        '+ New asset',
      ),
    ];
  }
  return [];
}

/** Re-renders the table, keeping keyboard focus where it was. */
async function refreshPage(route, data = shownPage?.data) {
  if (!data) return;
  const pinned = route.entity === 'work_orders' ? await loadPendingCreations() : [];
  const active = document.activeElement;
  const rowId = active?.closest?.('#table-container tr[data-id]')?.dataset.id;
  const pager = active?.closest?.('#table-container [data-pager]')?.dataset.pager;
  displayPage(route, data, pinned);
  if (rowId) focusRow(tableContainer, rowId);
  else if (pager) focusPager(tableContainer, pager);
}

/** Table (+ detail panel, creation form): local data first, then the server. */
async function showEntity(route, isCurrent) {
  const cfg = ENTITIES[route.entity];
  setActiveNav(route.entity);
  setTitle(cfg.label);

  const sameTable =
    shownPage?.entity === route.entity &&
    shownPage.page === route.page &&
    tableContainer.querySelector('.data-table, .empty-state');

  let fromCache = false;
  if (sameTable) {
    selectRow(tableContainer, route.id ?? null);
  } else {
    const pinned = route.entity === 'work_orders' ? await loadPendingCreations() : [];
    const cached = await readCachedPage(route.entity, route.page);
    if (!isCurrent()) return;
    if (cached) {
      fromCache = true;
      displayPage(route, cached, pinned);
    } else {
      if (shownPage?.entity !== route.entity) {
        renderPage(
          h('p', { class: 'loading-state', role: 'status' }, `Loading ${cfg.label.toLowerCase()}…`),
        );
      }
      tableContainer.setAttribute('aria-busy', 'true');
      let result;
      try {
        result = await fetchAndStorePage(route.entity, route.page);
      } catch (err) {
        if (isCurrent()) showTableError(err, cfg, route.page);
        return;
      } finally {
        if (isCurrent()) tableContainer.removeAttribute('aria-busy');
      }
      if (!isCurrent()) return;
      // A page past the end (e.g. an old link) goes to the last page.
      if (route.page > result.data.pages) {
        const url = route.id
          ? detailUrl(route.entity, route.id, result.data.pages)
          : listUrl(route.entity, result.data.pages);
        return navigate(url, { replace: true, force: true });
      }
      displayPage(route, result.data, pinned);
    }
  }

  const onClose = () => navigate(listUrl(route.entity, route.page));
  if (route.name === 'create' && route.entity === 'assets') {
    setSplitView(true);
    openDetail = { entity: route.entity, id: 'new' };
    if (canManageAssets(currentUser())) {
      await showCreateAsset({ route, onClose });
      if (isCurrent()) restoreFocus(() => detailContainer.querySelector('#f-code')?.focus());
    } else {
      clearEditor();
      renderDetailMessage(detailContainer, {
        title: 'New asset',
        message: 'Only supervisors and administrators can create assets.',
        onClose,
      });
    }
  } else if (route.name === 'create') {
    setSplitView(true);
    openDetail = { entity: route.entity, id: 'new' };
    await showCreate({ route, onClose });
    if (isCurrent()) restoreFocus(() => detailContainer.querySelector('#f-title')?.focus());
  } else if (route.name === 'detail' && typeof route.id === 'string') {
    setSplitView(true);
    openDetail = { entity: route.entity, id: route.id };
    await showPendingCreation({ route, onClose });
    if (isCurrent()) restoreFocus(() => detailContainer.querySelector('.detail-title')?.focus());
  } else if (route.name === 'detail') {
    await showDetail(route, isCurrent);
  } else {
    const closedId = openDetail?.entity === route.entity ? openDetail.id : null;
    openDetail = null;
    clearEditor();
    setSplitView(false);
    replaceChildren(detailContainer);
    restoreFocus(
      () => (closedId ? focusRow(tableContainer, closedId) : false) || (!sameTable && focusTitle()),
    );
  }
  if (!isCurrent()) return;

  // Background work, after the visible content: revalidate a page shown from the cache,
  // then prefetch the neighbours and evict the rest.
  if (fromCache) await revalidatePage(route, isCurrent);
  if (isCurrent() && shownPage) {
    prefetchAround(route.entity, route.page, shownPage.pages, {
      openId: typeof route.id === 'number' ? route.id : null,
    }).catch(() => {});
  }
}

/** Fetches the shown page again; re-renders only if something changed. */
async function revalidatePage(route, isCurrent) {
  if (!isOnline()) return;
  lastRevalidation = Date.now();
  let result;
  try {
    result = await fetchAndStorePage(route.entity, route.page);
  } catch {
    return; // offline or server trouble: the cached page stays on screen
  }
  if (!isCurrent()) return;
  if (!result.structureChanged && result.changedIds.length === 0) return;
  await refreshPage(route, result.data);
  if (openDetail?.entity === route.entity && result.changedIds.includes(openDetail.id)) {
    offerUpdate(route);
  }
}

/** Shows the "Update available" badge in the detail panel (brief → Silent revalidation). */
function offerUpdate(route) {
  showUpdateAvailable(detailContainer, async () => {
    flushDraft(); // unsaved edits stay available as a draft
    clearEditor();
    await showDetail(route, () => true);
    detailContainer.querySelector('.detail-title')?.focus();
    announce('The record now shows the latest version.');
  });
  announce('An update is available for the open record.');
}

async function showDetail(route, isCurrent) {
  const cfg = ENTITIES[route.entity];
  const onClose = () => navigate(listUrl(route.entity, route.page));
  setSplitView(true);
  openDetail = { entity: route.entity, id: route.id };

  // 1. Current page in memory, 2. IndexedDB, 3. server.
  const fromPage = shownPage?.entity === route.entity ? shownPage.byId.get(route.id) : undefined;
  let record = fromPage && withPending(route.entity, fromPage);
  const onPage = Boolean(record);
  if (!record) {
    const cached = await readCachedRecord(route.entity, route.id);
    if (!isCurrent()) return;
    if (cached) record = withPending(route.entity, cached);
  }

  if (!record) {
    renderDetailMessage(detailContainer, {
      title: cfg.singular,
      message: `Loading ${cfg.singular.toLowerCase()}…`,
      onClose,
    });
    try {
      record = withPending(
        route.entity,
        (await fetchAndStoreRecord(route.entity, route.id)).record,
      );
    } catch (err) {
      if (!isCurrent()) return;
      const singular = cfg.singular.toLowerCase();
      let message = err.message;
      if (err.status === 404) message = `This ${singular} does not exist.`;
      else if (err.status === 0) message = `This ${singular} is not available offline.`;
      renderDetailMessage(detailContainer, {
        title: cfg.singular,
        message,
        onClose,
        onRetry: err.status === 404 ? undefined : () => render(currentRoute()),
      });
      return;
    }
    if (!isCurrent()) return;
  } else if (!onPage && isOnline()) {
    // Shown from IndexedDB and not covered by the page revalidation: check it alone.
    fetchAndStoreRecord(route.entity, route.id)
      .then(({ changed }) => {
        if (changed && isCurrent()) offerUpdate(route);
      })
      .catch(() => {});
  }

  await showRecord({ route, record, onClose });
  if (!isCurrent()) return;
  measureDetailOpening();
  restoreFocus(() => detailContainer.querySelector('.detail-title')?.focus());
}

/** Table → detail time (target < 20 ms with cached data), logged during development. */
function measureDetailOpening() {
  if (performance.getEntriesByName('detail-open', 'mark').length === 0) return;
  performance.clearMeasures('detail-open-to-render');
  const { duration } = performance.measure('detail-open-to-render', 'detail-open');
  performance.clearMarks('detail-open');
  if (location.hostname === 'localhost') {
    console.debug(`Detail rendered ${duration.toFixed(1)} ms after the click`);
  }
}

function focusTitle() {
  tableContainer.querySelector('.table-title')?.focus();
  return true;
}

/** Applies the pending focus request, or the default given for this view. */
function restoreFocus(defaultFocus) {
  const focus = pendingFocus;
  pendingFocus = null;
  if (focus?.type === 'pager') focusPager(tableContainer, focus.control);
  else defaultFocus();
}

function showTableError(err, cfg, page) {
  const message =
    err.status === 0
      ? `Page ${page} of ${cfg.label.toLowerCase()} has not been loaded before, so it is not available offline.`
      : err.message;
  renderPage(
    h(
      'div',
      { class: 'error-state', role: 'alert' },
      h('p', {}, message),
      h(
        'button',
        { type: 'button', class: 'button button-secondary', onClick: () => render(currentRoute()) },
        'Retry',
      ),
    ),
  );
  shownPage = null;
}

/** Revalidates the view on screen (window focus, network back). */
function revalidateCurrent({ force = false } = {}) {
  if (!isLoggedIn() || !isOnline() || !shownPage) return;
  if (!force && Date.now() - lastRevalidation < REVALIDATE_THROTTLE_MS) return;
  const route = currentRoute();
  if (route.entity !== shownPage.entity || route.page !== shownPage.page) return;
  const seq = renderSeq;
  revalidatePage(route, () => seq === renderSeq);
}

/** Re-renders the open view after a queue result, unless the user is typing in a form. */
function refreshAfterWrite(entity, recordId) {
  const route = currentRoute();
  const editor = currentEditor();
  const isOpen = openDetail?.entity === entity && openDetail.id === recordId;
  if (isOpen && !editor?.dirty) {
    render(route);
  } else if (shownPage?.entity === entity) {
    refreshPage(route);
  }
}

/** Puts a record returned by the server into the page on screen. */
function updateShownRecord(entity, item) {
  if (shownPage?.entity !== entity) return;
  const index = shownPage.data.items.findIndex((r) => r.id === item.id);
  if (index >= 0) {
    shownPage.data.items[index] = item;
    shownPage.byId.set(item.id, item);
  }
}

/** Reactions to the sync queue (docs/architecture.md → Sync queue, response table). */
function handleQueueResults() {
  setQueueHandlers({
    onSuccess(entry, item) {
      updateShownRecord(entry.entity, item);
      const singular = ENTITIES[entry.entity].singular;
      if (entry.op === 'create') {
        announce(`Work order ${item.number} created.`);
        if (openDetail?.id === entry.record_id) {
          navigate(detailUrl('work_orders', item.id, shownPage?.page ?? 1), {
            replace: true,
            force: true,
          });
        } else {
          refreshAfterWrite(entry.entity, entry.record_id);
        }
        revalidateCurrent({ force: true });
      } else {
        announce(`${singular} saved.`);
        refreshAfterWrite(entry.entity, entry.record_id);
      }
    },
    onConflict(entry, body) {
      if (body?.server_version) updateShownRecord(entry.entity, body.server_version);
      announce(
        body?.locked
          ? 'Not saved: this record is waiting for a supervisor to resolve a conflict. Your edits are kept as a draft.'
          : 'Conflict: someone changed this record before you. A supervisor will choose which version to keep.',
      );
      refreshAfterWrite(entry.entity, entry.record_id);
    },
    onRejected(entry, err) {
      announce(`Not saved: ${err.message}`);
      refreshAfterWrite(entry.entity, entry.record_id);
    },
  });
  onQueueChange(() => {
    setSyncStatus(pendingCount());
    if (shownPage && !currentEditor()?.dirty) refreshPage(currentRoute());
  });
}

async function onLogout() {
  // Unsaved form: same choices as when leaving the record.
  if (!(await leaveGuard('/login'))) return;
  const waiting = pendingCount();
  if (waiting > 0) {
    const choice = await confirmDialog({
      title: 'Changes not sent',
      message: `${waiting} change${waiting === 1 ? ' has' : 's have'} not been sent to the server yet. If you log out now, ${waiting === 1 ? 'it' : 'they'} will be lost.`,
      actions: [
        { value: 'stay', label: 'Stay logged in', primary: true },
        { value: 'logout', label: 'Log out anyway' },
      ],
      cancelValue: 'stay',
    });
    if (choice !== 'logout') return;
  }
  await logout();
  resetViews();
  await DB.clearAll(); // D22: no local data left behind
  await loadQueue();
  navigate('/login', { force: true });
  announce('You are logged out.');
}

function init() {
  initNetwork();
  initLayout({ onLogout });
  setRerender(() => render(currentRoute()));
  setNavigationGuard(leaveGuard);
  handleQueueResults();

  // Expired or revoked token: back to the login page, then to the same place.
  onUnauthorized(() => {
    flushDraft();
    clearSession();
    const next = encodeURIComponent(location.pathname + location.search);
    navigate(`/login?next=${next}`, { replace: true, force: true });
    announce('Your session has expired. Log in again.');
  });

  // Escape closes the detail panel and returns to the table (dialogs handle their own Escape).
  document.getElementById('main-content').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !openDetail || event.defaultPrevented) return;
    event.preventDefault();
    navigate(listUrl(openDetail.entity, shownPage?.page ?? 1));
  });

  // Unsaved work survives closing or reloading the tab.
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', flushDraft);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDraft();
    else revalidateCurrent();
  });
  window.addEventListener('focus', () => revalidateCurrent());
  onNetworkChange((online) => {
    announce(online ? 'Back online.' : 'You are offline. Local data is shown.');
    if (online) revalidateCurrent({ force: true });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* the app works without it, only offline reloads are lost */
    });
  }

  if (isLoggedIn()) startSession(currentUser());
  startQueue();
  startRouter(render);
  render(currentRoute());
}

init();
