// Entry point: wires the shell, the router and the views (docs/architecture.md).
// Data flow: IndexedDB first, then quiet revalidation from the server (stale-while-revalidate).
import { onUnauthorized } from './api.js';
import { currentUser, hasRole, isLoggedIn, logout } from './auth.js';
import * as DB from './db.js';
import { renderDetail, renderDetailMessage, showUpdateAvailable } from './detail.js';
import { h, replaceChildren } from './dom.js';
import { ENTITIES } from './entities.js';
import {
  announce,
  initLayout,
  renderPage,
  renderPlaceholder,
  setActiveNav,
  setSplitView,
  setTitle,
  showLoggedIn,
  showLoggedOut,
} from './layout.js';
import { renderLogin } from './login.js';
import { initNetwork, isOnline, onNetworkChange } from './network.js';
import { prefetchAround } from './preload.js';
import { currentRoute, detailUrl, listUrl, navigate, startRouter } from './router.js';
import { clearSession } from './session.js';
import {
  fetchAndStorePage,
  fetchAndStoreRecord,
  readCachedPage,
  readCachedRecord,
} from './sync.js';
import { focusPager, focusRow, renderTable, selectRow } from './table.js';

const tableContainer = document.getElementById('table-container');
const detailContainer = document.getElementById('detail-container');

/** Revalidation on window focus happens at most this often. */
const REVALIDATE_THROTTLE_MS = 10_000;

/** Table page on screen; its records serve the detail panel without any lookup (D7). */
let shownPage = null; // { entity, page, pages, byId: Map<number, object> }
/** Record open in the detail panel. */
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
  setSplitView(false);
  replaceChildren(tableContainer);
  replaceChildren(detailContainer);
}

async function render(route) {
  const seq = ++renderSeq;
  const isCurrent = () => seq === renderSeq;

  if (route.name === 'root') return navigate('/dashboard', { replace: true });

  if (!isLoggedIn()) {
    if (route.name !== 'login') {
      const next = encodeURIComponent(location.pathname + location.search);
      return navigate(`/login?next=${next}`, { replace: true });
    }
    resetViews();
    showLoggedOut();
    setTitle('Log in');
    return renderLogin(document.getElementById('login-container'), {
      onLoggedIn: async (user) => {
        await forgetOtherUsersData(user);
        navigate(route.next, { replace: true });
      },
    });
  }
  if (route.name === 'login') return navigate(route.next, { replace: true });

  showLoggedIn(currentUser());
  switch (route.name) {
    case 'list':
    case 'detail':
      return showEntity(route, isCurrent);
    case 'dashboard':
      return showPlaceholder(
        'dashboard',
        'Dashboard',
        'The dashboard is not available yet. Use the menu to browse assets and work orders.',
      );
    case 'create':
      return showPlaceholder(
        'work_orders',
        'New work order',
        'Creating work orders is not available yet.',
      );
    case 'conflicts':
    case 'conflict':
      return hasRole('SUPERVISOR', 'ADMIN')
        ? showPlaceholder('conflicts', 'Conflicts', 'Conflict arbitration is not available yet.')
        : showPlaceholder(
            null,
            'Access denied',
            'Only supervisors and administrators can open this page.',
          );
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

function showPlaceholder(section, title, message, withHomeLink = false) {
  shownPage = null;
  openDetail = null;
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

/** Renders a table page and remembers its records for the detail panel. */
function displayPage(route, data) {
  shownPage = {
    entity: route.entity,
    page: route.page,
    pages: data.pages,
    byId: new Map(data.items.map((record) => [record.id, record])),
  };
  renderTable(tableContainer, {
    entity: route.entity,
    data,
    selectedId: route.id ?? null,
    onOpen: (id) => {
      performance.mark('detail-open');
      navigate(detailUrl(route.entity, id, route.page));
    },
    onPage: (page, control) => {
      pendingFocus = { type: 'pager', control };
      navigate(listUrl(route.entity, page));
    },
  });
}

/** Re-renders the table with fresh data, keeping keyboard focus where it was. */
function refreshPage(route, data) {
  const active = document.activeElement;
  const rowId = active?.closest?.('#table-container tr[data-id]')?.dataset.id;
  const pager = active?.closest?.('#table-container [data-pager]')?.dataset.pager;
  displayPage(route, data);
  if (rowId) focusRow(tableContainer, rowId);
  else if (pager) focusPager(tableContainer, pager);
}

/** Table (+ detail panel for /<entity>/:id): local data first, then the server. */
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
    const cached = await readCachedPage(route.entity, route.page);
    if (!isCurrent()) return;
    if (cached) {
      fromCache = true;
      displayPage(route, cached);
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
        return navigate(url, { replace: true });
      }
      displayPage(route, result.data);
    }
  }

  if (route.name === 'detail') {
    await showDetail(route, isCurrent);
  } else {
    const closedId = openDetail?.entity === route.entity ? openDetail.id : null;
    openDetail = null;
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
    prefetchAround(route.entity, route.page, shownPage.pages, { openId: route.id ?? null }).catch(
      () => {},
    );
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
  refreshPage(route, result.data);
  if (openDetail && result.changedIds.includes(openDetail.id)) offerUpdate(route);
}

/** Shows the "Update available" badge in the detail panel (brief → Silent revalidation). */
function offerUpdate(route) {
  showUpdateAvailable(detailContainer, async () => {
    const record =
      shownPage?.byId.get(route.id) ?? (await readCachedRecord(route.entity, route.id));
    if (!record) return;
    renderDetail(detailContainer, { entity: route.entity, record, onClose: closeDetail(route) });
    detailContainer.querySelector('.detail-title')?.focus();
    announce('The record now shows the latest version.');
  });
  announce('An update is available for the open record.');
}

const closeDetail = (route) => () => navigate(listUrl(route.entity, route.page));

async function showDetail(route, isCurrent) {
  const cfg = ENTITIES[route.entity];
  const onClose = closeDetail(route);
  setSplitView(true);
  openDetail = { entity: route.entity, id: route.id };

  // 1. Current page in memory, 2. IndexedDB, 3. server.
  let record = shownPage?.byId.get(route.id);
  const onPage = Boolean(record);
  record ??= await readCachedRecord(route.entity, route.id);
  if (!isCurrent()) return;

  if (!record) {
    renderDetailMessage(detailContainer, {
      title: cfg.singular,
      message: `Loading ${cfg.singular.toLowerCase()}…`,
      onClose,
    });
    try {
      record = (await fetchAndStoreRecord(route.entity, route.id)).record;
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

  renderDetail(detailContainer, { entity: route.entity, record, onClose });
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

function init() {
  initNetwork();
  initLayout({
    onLogout: async () => {
      await logout();
      await DB.clearAll(); // D22: no local data left behind
      resetViews();
      navigate('/login');
      announce('You are logged out.');
    },
  });

  // Expired or revoked token: back to the login page, then to the same place.
  onUnauthorized(() => {
    clearSession();
    const next = encodeURIComponent(location.pathname + location.search);
    navigate(`/login?next=${next}`, { replace: true });
    announce('Your session has expired. Log in again.');
  });

  // Escape closes the detail panel and returns to the table.
  document.getElementById('main-content').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !openDetail || event.defaultPrevented) return;
    event.preventDefault();
    navigate(listUrl(openDetail.entity, shownPage?.page ?? 1));
  });

  // Revalidation triggers: window back in focus, network back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revalidateCurrent();
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

  startRouter(render);
  render(currentRoute());
}

init();
