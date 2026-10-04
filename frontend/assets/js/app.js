// Entry point: wires the shell, the router and the views (docs/architecture.md).
import { apiFetch, onUnauthorized } from './api.js';
import { currentUser, hasRole, isLoggedIn, logout } from './auth.js';
import { PAGE_SIZE } from './config.js';
import { renderDetail, renderDetailMessage } from './detail.js';
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
import { currentRoute, detailUrl, listUrl, navigate, startRouter } from './router.js';
import { clearSession } from './session.js';
import { focusPager, focusRow, renderTable, selectRow } from './table.js';

const tableContainer = document.getElementById('table-container');
const detailContainer = document.getElementById('detail-container');

/** Table page on screen; its records also serve the detail panel without a request (D7). */
let shownPage = null; // { entity, page, byId: Map<number, object> }
/** Record open in the detail panel. */
let openDetail = null; // { entity, id }
/** Focus to restore after the next render, e.g. the pagination button just used. */
let pendingFocus = null;
/** Increases on every navigation; a render that finishes late is discarded. */
let renderSeq = 0;

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
      onLoggedIn: () => navigate(route.next, { replace: true }),
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

/** Table (+ detail panel for /<entity>/:id). */
async function showEntity(route, isCurrent) {
  const cfg = ENTITIES[route.entity];
  setActiveNav(route.entity);
  setTitle(cfg.label);

  const sameTable =
    shownPage?.entity === route.entity &&
    shownPage.page === route.page &&
    tableContainer.querySelector('.data-table, .empty-state');

  if (sameTable) {
    selectRow(tableContainer, route.id ?? null);
  } else {
    if (shownPage?.entity !== route.entity) {
      renderPage(
        h('p', { class: 'loading-state', role: 'status' }, `Loading ${cfg.label.toLowerCase()}…`),
      );
    }
    tableContainer.setAttribute('aria-busy', 'true');
    let data;
    try {
      data = await apiFetch(`${cfg.api}?page=${route.page}&size=${PAGE_SIZE}`);
    } catch (err) {
      if (isCurrent()) showTableError(err);
      return;
    } finally {
      if (isCurrent()) tableContainer.removeAttribute('aria-busy');
    }
    if (!isCurrent()) return;

    // A page past the end (e.g. an old link) goes to the last page.
    if (route.page > data.pages) {
      const url = route.id
        ? detailUrl(route.entity, route.id, data.pages)
        : listUrl(route.entity, data.pages);
      return navigate(url, { replace: true });
    }

    shownPage = {
      entity: route.entity,
      page: route.page,
      byId: new Map(data.items.map((record) => [record.id, record])),
    };
    renderTable(tableContainer, {
      entity: route.entity,
      data,
      selectedId: route.id ?? null,
      onOpen: (id) => navigate(detailUrl(route.entity, id, route.page)),
      onPage: (page, control) => {
        pendingFocus = { type: 'pager', control };
        navigate(listUrl(route.entity, page));
      },
    });
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
}

async function showDetail(route, isCurrent) {
  const cfg = ENTITIES[route.entity];
  const onClose = () => navigate(listUrl(route.entity, route.page));
  setSplitView(true);
  openDetail = { entity: route.entity, id: route.id };

  let record = shownPage?.byId.get(route.id);
  if (!record) {
    renderDetailMessage(detailContainer, {
      title: cfg.singular,
      message: `Loading ${cfg.singular.toLowerCase()}…`,
      onClose,
    });
    try {
      record = await apiFetch(`${cfg.api}/${route.id}`);
    } catch (err) {
      if (!isCurrent()) return;
      renderDetailMessage(detailContainer, {
        title: cfg.singular,
        message:
          err.status === 404 ? `This ${cfg.singular.toLowerCase()} does not exist.` : err.message,
        onClose,
        onRetry: err.status === 404 ? undefined : () => render(currentRoute()),
      });
      return;
    }
    if (!isCurrent()) return;
  }
  renderDetail(detailContainer, { entity: route.entity, record, onClose });
  restoreFocus(() => detailContainer.querySelector('.detail-title')?.focus());
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

function showTableError(err) {
  renderPage(
    h(
      'div',
      { class: 'error-state', role: 'alert' },
      h('p', {}, err.message),
      h(
        'button',
        { type: 'button', class: 'button button-secondary', onClick: () => render(currentRoute()) },
        'Retry',
      ),
    ),
  );
  shownPage = null;
}

function init() {
  initLayout({
    onLogout: async () => {
      await logout();
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

  startRouter(render);
  render(currentRoute());
}

init();
