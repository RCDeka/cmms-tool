// Entry point: wires the shell, the router and the views (docs/architecture.md).
// Data flow: IndexedDB first, then quiet revalidation from the server (stale-while-revalidate).
// Writes go through the sync queue (queue.js); editing and creation live in editor.js.
import { renderAccount } from './account.js';
import {
  apiFieldErrors,
  renderUserCreate,
  renderUserList,
  renderUserPanel,
  showErrors,
  usersUrl,
} from './admin-users.js';
import { apiFetch, onUnauthorized } from './api.js';
import { currentUser, hasRole, isLoggedIn, logout } from './auth.js';
import { renderArbitration, renderConflictList, resolutionSummary } from './conflicts.js';
import { renderDashboard } from './dashboard.js';
import { feedbackUrl, openFeedbackDialog, renderFeedbackLog } from './feedback.js';
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
  setServerRecordListener,
  showCreate,
  showCreateAsset,
  showPendingCreation,
  showRecord,
  withPending,
} from './editor.js';
import { ENTITIES } from './entities.js';
import {
  currentSort,
  defaultFilters,
  effectiveFilters,
  filtersQuery,
  hasFilters,
  isPlainList,
  renderFilterBar,
  sortByColumn,
  sortOf,
  urlFilters,
  withoutSort,
} from './filters.js';
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
import { findAssetById, findAssetByCode, loadRefs } from './refs.js';
import {
  checkPlanForm,
  planBody,
  planFieldErrors,
  renderPlanForm,
  renderPlanPanel,
} from './plan-panel.js';
import { planningUrl, renderPlanner, setPlannerPanel, timelineQuery } from './planning.js';
import { renderPlanningSettings } from './planning-settings.js';
import {
  renderRequestDetail,
  renderRequestForm,
  renderRequestList,
  requestsUrl,
  showRequestErrors,
} from './requests.js';
import {
  currentRoute,
  detailUrl,
  listUrl,
  navigate,
  setNavigationGuard,
  startRouter,
} from './router.js';
import { canManageAssets } from './rules.js';
import { clearSession, saveSession, saveUser } from './session.js';
import {
  fetchFilteredPage,
  fetchAndStorePage,
  fetchAndStoreRecord,
  readCachedPage,
  readCachedRecord,
} from './sync.js';
import {
  focusPager,
  focusRow,
  focusSortButton,
  renderPagination,
  renderTable,
  selectRow,
} from './table.js';

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

/** Staff members only submit requests (D46): their home page is their open requests. */
const isStaff = () => hasRole('STAFF');
const homeUrl = () => (isStaff() ? '/requests' : '/dashboard');

async function render(route) {
  const seq = ++renderSeq;
  const isCurrent = () => seq === renderSeq;

  if (route.name === 'root') return navigate(homeUrl(), { replace: true, force: true });

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
  if (isStaff()) return renderStaffRoute(route, isCurrent);
  // The planner's timeline is reused only while the user stays on the planner.
  if (!['planning', 'plan', 'planCreate'].includes(route.name)) plannerCache = null;
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
    case 'users':
    case 'user':
    case 'userCreate':
      return hasRole('ADMIN')
        ? showUsers(route, isCurrent)
        : showPlaceholder(null, 'Access denied', 'Only administrators can open this page.');
    case 'account':
      return showAccount();
    case 'planning':
    case 'plan':
      return showPlanning(route, isCurrent);
    case 'planCreate':
      return hasRole('SUPERVISOR', 'ADMIN')
        ? showPlanning(route, isCurrent)
        : showPlaceholder(
            'planning',
            'Access denied',
            'Only supervisors and administrators can create plans.',
          );
    case 'planningSettings':
      return hasRole('ADMIN')
        ? showPlanningSettings(isCurrent)
        : showPlaceholder(null, 'Access denied', 'Only administrators can open this page.');
    case 'feedback':
      return hasRole('ADMIN')
        ? showFeedbackLog(route, isCurrent)
        : showPlaceholder(null, 'Access denied', 'Only administrators can open this page.');
    case 'request':
      // A link to a staff request: the maintenance team opens it as the work order it is.
      return navigate(`/work-orders/${route.id}`, { replace: true, force: true });
    case 'requests':
    case 'requestCreate':
      return showPlaceholder(
        null,
        'Staff requests',
        'This page is for staff members. Their requests are listed under Work orders.',
        true,
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
      .append(
        h(
          'p',
          {},
          h(
            'a',
            { href: homeUrl(), 'data-link': true },
            isStaff() ? 'Go to my open requests' : 'Go to the dashboard',
          ),
        ),
      );
  }
  tableContainer.querySelector('.placeholder-title')?.focus();
}

// --- Staff requests (D46, online only) ------------------------------------------------------

const REQUESTS_PAGE_SIZE = 20;

/** Pages of a staff member; everything else leads to their open requests. */
function renderStaffRoute(route, isCurrent) {
  switch (route.name) {
    case 'requests':
      return showRequests(route, isCurrent);
    case 'requestCreate':
      return showRequestCreate(isCurrent);
    case 'request':
      return showRequest(route, isCurrent);
    case 'account':
      return showAccount();
    case 'notFound':
      return showPlaceholder(null, 'Page not found', 'This page does not exist.', true);
    default:
      return navigate('/requests', { replace: true, force: true });
  }
}

function showRequestsError(err) {
  showConsoleError(err, () => render(currentRoute()));
  if (err.status === 0) {
    tableContainer.querySelector('.error-state p').textContent =
      'Your requests need a connection to the server.';
  }
}

/**
 * Open requests (home page) or all of them. `quiet`: a refresh when the window gets the focus
 * back, which leaves the focus where it is.
 */
async function showRequests(route, isCurrent, { quiet = false } = {}) {
  const all = route.scope === 'all';
  leaveRecordViews(all ? 'requests_all' : 'requests', all ? 'All my requests' : 'My open requests');
  if (!tableContainer.querySelector('.requests-page')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading your requests…'));
  }
  let data;
  try {
    data = await apiFetch(
      `/requests?scope=${route.scope}&page=${route.page}&size=${REQUESTS_PAGE_SIZE}`,
    );
  } catch (err) {
    if (isCurrent() && !quiet) showRequestsError(err);
    return;
  }
  if (!isCurrent()) return;
  renderPage();
  renderRequestList(tableContainer, {
    data,
    scope: route.scope,
    pagination: renderPagination(data, (page, control) => {
      pendingFocus = { type: 'pager', control };
      navigate(requestsUrl(route.scope, page));
    }),
  });
  if (!quiet) restoreFocus(() => tableContainer.querySelector('.table-title')?.focus());
}

async function showRequestCreate(isCurrent) {
  leaveRecordViews('request_new', 'New request');
  renderPage();
  const { sites } = await getRefs();
  if (!isCurrent()) return;
  renderRequestForm(tableContainer, {
    sites,
    defaultSite: currentUser().site,
    onSubmit: async (body, form) => {
      try {
        const { item } = await apiFetch('/requests', { method: 'POST', body });
        announce(`Request ${item.number} sent to the maintenance team.`);
        navigate(`/requests/${item.id}`, { force: true });
        return true;
      } catch (err) {
        showRequestErrors(
          form,
          apiFieldErrors(err),
          err.status === 0
            ? 'You are offline: your request is kept on this page, send it once connected.'
            : err.message,
        );
        return false;
      }
    },
  });
  tableContainer.querySelector('.placeholder-title')?.focus();
}

async function showRequest(route, isCurrent) {
  leaveRecordViews(null, 'Request');
  if (!tableContainer.querySelector('.request-page')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the request…'));
  }
  let request;
  try {
    request = await apiFetch(`/requests/${route.id}`);
  } catch (err) {
    if (!isCurrent()) return;
    if (err.status === 404) {
      return showPlaceholder(
        null,
        'Request not found',
        'This request does not exist, or another person sent it.',
        true,
      );
    }
    return showRequestsError(err);
  }
  if (!isCurrent()) return;
  setActiveNav(['CLOSED', 'CANCELLED'].includes(request.status) ? 'requests_all' : 'requests');
  setTitle(request.title);
  renderPage();
  renderRequestDetail(tableContainer, {
    request,
    viewer: currentUser(),
    sendComment: async (body) =>
      (await apiFetch(`/requests/${request.id}/comments`, { method: 'POST', body: { body } })).item,
  });
  tableContainer.querySelector('.placeholder-title')?.focus();
}

/** A staff member coming back to the tab sees the latest status of their requests. */
function refreshRequestList() {
  const route = currentRoute();
  if (!isLoggedIn() || !isStaff() || route.name !== 'requests' || !isOnline()) return;
  if (Date.now() - lastRevalidation < REVALIDATE_THROTTLE_MS) return;
  lastRevalidation = Date.now();
  const seq = ++renderSeq;
  showRequests(route, () => seq === renderSeq, { quiet: true });
}

// --- Dashboard ------------------------------------------------------------------------------

const DASHBOARD_CACHE = 'dashboard_cache';

/** Renders a dashboard snapshot { data, stats, fetched_at }, then draws the charts. */
async function paintDashboard(snapshot, fromCache, isCurrent) {
  const charts = renderDashboard(tableContainer, {
    data: snapshot.data,
    stats: snapshot.stats,
    fromCache,
    fetchedAt: snapshot.fetched_at,
    charts: !hasRole('TECHNICIAN'),
  });
  try {
    for (const chart of charts) await chart.draw(chart.canvas, chart.rows);
  } catch {
    // No chart library (e.g. offline before it was ever cached): the table stays available
    // (the status pie lists its values next to it).
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
    withUsers: hasRole('ADMIN'),
    onFilter: (type) => navigate(auditUrl(type, 1)),
    pagination: renderPagination(data, (page, control) => {
      pendingFocus = { type: 'pager', control };
      navigate(auditUrl(route.entityType, page));
    }),
  });
  restoreFocus(() => tableContainer.querySelector('.table-title')?.focus());
}

// --- User administration (admins, online only, D39) -----------------------------------------

/** Usernames are unique; sites are suggested from the users already known. */
async function showUsers(route, isCurrent) {
  leaveRecordViews('users', 'Users');
  const filters = route.filters ?? {};
  if (!tableContainer.querySelector('.users-table, .filter-bar')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading users…'));
  }
  const query = new URLSearchParams({ page: String(route.page), size: '50' });
  if (filters.q) query.set('q', filters.q);
  if (filters.role) query.set('role', filters.role);
  if (filters.active) query.set('is_active', filters.active);
  let data;
  let user = null;
  try {
    [data, user] = await Promise.all([
      apiFetch(`/admin/users?${query}`),
      route.name === 'user' ? apiFetch(`/admin/users/${route.id}`) : null,
    ]);
  } catch (err) {
    if (!isCurrent()) return;
    if (err.status === 404) {
      return showPlaceholder('users', 'User not found', 'This user does not exist.');
    }
    showConsoleError(err, () => render(currentRoute()));
    if (err.status === 0) {
      tableContainer.querySelector('.error-state p').textContent =
        'User administration needs a connection to the server.';
    }
    return;
  }
  if (!isCurrent()) return;

  const listUrlFor = (page) => usersUrl({ ...filters, page });
  const close = () => navigate(listUrlFor(route.page));
  const refs = { sites: [...new Set(data.items.map((u) => u.site).filter(Boolean))].sort() };
  renderUserList(tableContainer, {
    data,
    filters,
    selectedId: user?.id ?? null,
    onFilter: (next) => navigate(usersUrl({ ...next, page: 1 })),
    pagination: renderPagination(data, (page, control) => {
      pendingFocus = { type: 'pager', control };
      navigate(listUrlFor(page));
    }),
  });

  if (route.name === 'users') {
    setSplitView(false);
    replaceChildren(detailContainer);
    restoreFocus(() => tableContainer.querySelector('.table-title')?.focus());
    return;
  }
  setSplitView(true);
  if (route.name === 'userCreate') {
    setTitle('New user');
    renderUserCreate(detailContainer, {
      refs,
      onClose: close,
      onCreate: async (values, form) => {
        try {
          const { item } = await apiFetch('/admin/users', { method: 'POST', body: values });
          announce(`User ${item.username} created.`);
          navigate(usersUrl({ ...filters, page: route.page, id: item.id }), { force: true });
        } catch (err) {
          showErrors(form, apiFieldErrors(err), err.message);
        }
      },
    });
  } else {
    setTitle(`${user.first_name} ${user.last_name}`);
    const isSelf = user.id === currentUser().id;
    renderUserPanel(detailContainer, {
      user,
      refs,
      isSelf,
      onClose: close,
      onSave: async (values, form) => {
        try {
          const { updated, item } = await apiFetch(`/admin/users/${user.id}`, {
            method: 'PUT',
            body: values,
          });
          if (isSelf) {
            saveUser({ ...currentUser(), ...item });
            showLoggedIn(currentUser());
          }
          announce(updated ? 'Changes saved.' : 'Nothing to save.');
          render(currentRoute());
        } catch (err) {
          showErrors(form, apiFieldErrors(err), err.message);
        }
      },
      onResetPassword: async (password, form) => {
        const answer = await confirmDialog({
          title: 'Set a new password?',
          message: `${user.first_name} ${user.last_name} will have to log in again with the new password.`,
          actions: [
            { value: 'set', label: 'Set password', primary: true },
            { value: 'cancel', label: 'Cancel' },
          ],
        });
        if (answer !== 'set') return;
        try {
          await apiFetch(`/admin/users/${user.id}/password`, {
            method: 'POST',
            body: { password },
          });
          form.reset();
          showErrors(form, {}, '');
          announce('New password set. Give it to the user privately.');
        } catch (err) {
          showErrors(form, apiFieldErrors(err), err.message);
        }
      },
    });
  }
  detailContainer.querySelector('.detail-title')?.focus();
}

/** "Change my password" (every role). */
function showAccount() {
  leaveRecordViews(null, 'Change my password');
  renderPage();
  renderAccount(tableContainer, {
    username: currentUser().username,
    onChange: async (current, next, form) => {
      try {
        const { token } = await apiFetch('/auth/change-password', {
          method: 'POST',
          body: { current_password: current, new_password: next },
        });
        // Earlier tokens stop working (BR-U8): keep this session with the new one.
        saveSession(token, currentUser());
        form.reset();
        showErrors(form, {}, '');
        announce('Your password has been changed.');
        form.querySelector('.form-help').textContent =
          'Password changed. Your other sessions have ended.';
      } catch (err) {
        // The server checks the new password under the name `password`.
        const { password, ...fields } = apiFieldErrors(err);
        if (password) fields.new_password = password;
        showErrors(
          form,
          fields,
          err.status === 0 ? 'You are offline: try again once connected.' : err.message,
        );
      }
    },
  });
  tableContainer.querySelector('.placeholder-title')?.focus();
}

// --- Suggestions (every user sends, admins read; D40) ---------------------------------------

/** Title of what is on screen: the page, and the record open in the side panel if any. */
function screenTitle() {
  const page = document.getElementById('page-title').textContent;
  const record = detailContainer.classList.contains('hidden')
    ? null
    : detailContainer.querySelector('.detail-title')?.textContent;
  return record && record !== page ? `${page} — ${record}` : page;
}

function openFeedback() {
  openFeedbackDialog(document.getElementById('feedback-dialog'), {
    pageTitle: screenTitle(),
    send: (payload) => apiFetch('/feedback', { method: 'POST', body: payload }),
    onSent: () => {
      announce('Thank you: your suggestion has been saved.');
      document.getElementById('feedback-button').focus();
    },
  });
}

async function showFeedbackLog(route, isCurrent) {
  leaveRecordViews('feedback', 'Suggestions');
  const filters = route.filters ?? {};
  if (!tableContainer.querySelector('.feedback-table, .filter-row')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading suggestions…'));
  }
  const query = new URLSearchParams({ page: String(route.page), size: '50' });
  if (filters.status) query.set('status', filters.status);
  let data;
  try {
    data = await apiFetch(`/feedback?${query}`);
  } catch (err) {
    if (!isCurrent()) return;
    showConsoleError(err, () => render(currentRoute()));
    if (err.status === 0) {
      tableContainer.querySelector('.error-state p').textContent =
        'The suggestions need a connection to the server.';
    }
    return;
  }
  if (!isCurrent()) return;
  renderPage();
  renderFeedbackLog(tableContainer, {
    data,
    filters,
    onFilter: (status) => navigate(feedbackUrl({ status })),
    onStatus: async (id, status, select) => {
      try {
        await apiFetch(`/feedback/${id}`, { method: 'PUT', body: { status } });
        announce('Status saved.');
        render(currentRoute());
      } catch (err) {
        select.value = data.items.find((i) => i.id === id).status;
        announce(err.status === 0 ? 'You are offline: the status was not changed.' : err.message);
      }
    },
    pagination: renderPagination(data, (page, control) => {
      pendingFocus = { type: 'pager', control };
      navigate(feedbackUrl({ ...filters, page }));
    }),
  });
  restoreFocus(() => tableContainer.querySelector('.table-title')?.focus());
}

// --- Year planner (D48, online only) -------------------------------------------------------

/** Timeline last shown, so opening or closing a plan panel does not fetch it again. */
let plannerCache = null; // { query, data }

/** URL of a plan panel over the planner, with the visit clicked. */
function planUrl(filters, planId, occurrenceId = null) {
  const url = planningUrl(filters, `/planning/plans/${planId}`);
  if (!occurrenceId) return url;
  return `${url}${url.includes('?') ? '&' : '?'}occurrence=${occurrenceId}`;
}

async function showPlanning(route, isCurrent) {
  leaveRecordViews('planning', 'Year planner');
  const filters = route.filters ?? {};
  const query = timelineQuery(filters);
  const cached = plannerCache?.query === query ? plannerCache.data : null;
  if (!tableContainer.querySelector('.planner')) {
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the year planner…'));
  }
  let data;
  let plan = null;
  try {
    [data, plan] = await Promise.all([
      cached ?? apiFetch(`/planning/timeline?${query}`),
      route.name === 'plan' ? apiFetch(`/plans/${route.id}`) : null,
    ]);
  } catch (err) {
    if (!isCurrent()) return;
    if (err.status === 404) {
      return showPlaceholder('planning', 'Plan not found', 'This maintenance plan does not exist.');
    }
    showConsoleError(err, () => render(currentRoute()));
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
  renderPlanner(tableContainer, {
    data,
    filters,
    sites,
    canEdit,
    isAdmin: hasRole('ADMIN'),
    selectedId: route.occurrenceId ?? null,
    onFilter: (next) => navigate(planningUrl(next)),
    onOpen: (planId, occurrenceId) => navigate(planUrl(filters, planId, occurrenceId)),
  });
  const grid = tableContainer.querySelector('.planner-scroll');
  if (scroll) Object.assign(grid, { scrollLeft: scroll.left, scrollTop: scroll.top });

  const close = () => navigate(planningUrl(filters));
  if (!setPlannerPanel(route.name, detailContainer)) {
    if (!hadFocus) tableContainer.querySelector('#planner-tiles-heading')?.focus();
    return;
  }
  const showForm = (current) => {
    renderPlanForm(detailContainer, {
      plan: current,
      sites,
      defaultWeek: data.current_week,
      onClose: current ? () => render(currentRoute()) : close,
      onSubmit: (raw, form, assetCode) => submitPlan(raw, form, assetCode, current, filters),
    });
    detailContainer.querySelector('#p-title')?.focus();
  };
  if (route.name === 'planCreate') {
    setTitle('New maintenance plan');
    return showForm(null);
  }
  setTitle(`${plan.code} — ${plan.title}`);
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
    onClose: close,
    onEdit: () => showForm(plan),
  });
  detailContainer.querySelector('.detail-title')?.focus();
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
    if (url === location.pathname + location.search) render(currentRoute());
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
async function showPlanningSettings(isCurrent) {
  leaveRecordViews('planning_settings', 'Planning settings');
  renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading the settings…'));
  let settings;
  try {
    settings = await apiFetch('/planning/settings');
  } catch (err) {
    if (!isCurrent()) return;
    showConsoleError(err, () => render(currentRoute()));
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
        render(currentRoute());
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

/** Filter bar + table area of the list views; the bar survives re-renders (focus kept). */
let listLayout = null; // { entity, bar, area }

/** Ensures the filter bar and table area are on screen; returns the table area. */
async function ensureListLayout(route) {
  const role = currentUser()?.role;
  // The bar shows the filters applied, role defaults included (technicians: "Assigned to me").
  const filters = effectiveFilters(route.entity, role, route.filters);
  if (listLayout?.entity === route.entity && tableContainer.contains(listLayout.area)) {
    listLayout.bar.setFilters(filters);
    return listLayout.area;
  }
  const refs = await getRefs();
  const area = h('div', { class: 'table-area' });
  const bar = renderFilterBar({
    entity: route.entity,
    filters,
    refs,
    canFilterAssignee: hasRole('SUPERVISOR', 'ADMIN'),
    defaults: defaultFilters(route.entity, role),
    // Typing replaces the history entry (no entry per keystroke); other changes add one.
    // The table sort is not in the bar: it is kept from the URL.
    onChange: (next, { typing }) => {
      const chosen = { ...next, ...sortOf(currentRoute().filters) };
      navigate(listUrl(route.entity, 1, urlFilters(route.entity, role, chosen)), {
        replace: typing,
      });
    },
  });
  setSplitView(Boolean(openDetail));
  replaceChildren(tableContainer, bar.element, area);
  listLayout = { entity: route.entity, bar, area };
  return area;
}

/** Renders a table page (with pending changes and pending creations) and remembers it. */
function displayPage(route, data, pinned = shownPage?.pinned ?? []) {
  if (!listLayout || !tableContainer.contains(listLayout.area)) return;
  const filters = route.filters ?? {};
  const items = data.items.map((record) => withPending(route.entity, record));
  shownPage = {
    entity: route.entity,
    page: route.page,
    filterKey: filtersQuery(route.entity, filters),
    filters,
    pages: data.pages,
    data,
    pinned,
    byId: new Map([...pinned, ...data.items].map((record) => [record.id, record])),
  };
  renderTable(listLayout.area, {
    entity: route.entity,
    data: { ...data, items },
    pinned,
    // "Matching" when the list is narrowed: technicians' default list counts, `mine=false` not.
    filtered: hasFilters(effectiveFilters(route.entity, currentUser()?.role, filters)),
    selectedId: route.id ?? null,
    onOpen: (id) => {
      performance.mark('detail-open');
      navigate(detailUrl(route.entity, id, route.page, filters));
    },
    onPage: (page, control) => {
      pendingFocus = { type: 'pager', control };
      navigate(listUrl(route.entity, page, filters));
    },
    sort: currentSort(route.entity, filters),
    onSort: (column) => {
      pendingFocus = { type: 'sort', column };
      navigate(listUrl(route.entity, 1, sortByColumn(route.entity, filters, column)));
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

  const filters = route.filters ?? {};
  const filtered = hasFilters(filters);
  // Only plain lists (no filter, default order) are cached on the device (D38, D42).
  const plain = isPlainList(filters);
  const filterKey = filtersQuery(route.entity, filters);
  const area = await ensureListLayout(route);
  if (!isCurrent()) return;
  const sameTable =
    shownPage?.entity === route.entity &&
    shownPage.page === route.page &&
    shownPage.filterKey === filterKey &&
    area.querySelector('.data-table, .empty-state');

  let fromCache = false;
  if (sameTable) {
    selectRow(tableContainer, route.id ?? null);
  } else {
    // Pending creations appear on the plain list only (they match no search yet).
    const pinned = route.entity === 'work_orders' && !filtered ? await loadPendingCreations() : [];
    const cached = plain ? await readCachedPage(route.entity, route.page) : null;
    if (!isCurrent()) return;
    if (cached) {
      fromCache = true;
      displayPage(route, cached, pinned);
    } else {
      if (!area.querySelector('.data-table')) {
        replaceChildren(
          area,
          h('p', { class: 'loading-state', role: 'status' }, `Loading ${cfg.label.toLowerCase()}…`),
        );
      }
      area.setAttribute('aria-busy', 'true');
      let data;
      try {
        data = plain
          ? (await fetchAndStorePage(route.entity, route.page)).data
          : await fetchFilteredPage(
              route.entity,
              route.page,
              effectiveFilters(route.entity, currentUser()?.role, filters),
            );
      } catch (err) {
        if (isCurrent()) showTableError(area, err, cfg, route);
        return;
      } finally {
        if (isCurrent()) area.removeAttribute('aria-busy');
      }
      if (!isCurrent()) return;
      // A page past the end (e.g. an old link) goes to the last page.
      if (route.page > data.pages) {
        const url = route.id
          ? detailUrl(route.entity, route.id, data.pages, filters)
          : listUrl(route.entity, data.pages, filters);
        return navigate(url, { replace: true, force: true });
      }
      displayPage(route, data, pinned);
    }
  }

  const onClose = () => navigate(listUrl(route.entity, route.page, filters));
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
    // While the user types in the filter bar, focus stays there.
    const inFilterBar = Boolean(document.activeElement?.closest?.('.filter-bar'));
    restoreFocus(
      () =>
        (closedId ? focusRow(tableContainer, closedId) : false) ||
        (!sameTable && !inFilterBar && focusTitle()),
    );
  }
  if (!isCurrent()) return;

  // Background work, after the visible content: revalidate a page shown from the cache,
  // then prefetch the neighbours and evict the rest (plain lists only).
  if (fromCache) await revalidatePage(route, isCurrent);
  if (isCurrent() && shownPage && plain) {
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
  const onClose = () => navigate(listUrl(route.entity, route.page, route.filters));
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
  else if (focus?.type !== 'sort' || !focusSortButton(tableContainer, focus.column)) defaultFocus();
}

/** Error in the table area; the filter bar stays so the user can change or clear it. */
function showTableError(area, err, cfg, route) {
  const filters = route.filters ?? {};
  const filtered = hasFilters(filters);
  const sorted = !filtered && !isPlainList(filters);
  let message = err.message;
  if (err.status === 0) {
    if (filtered) {
      message =
        'Search and filters need a connection to the server. Without filters, the pages saved on this device are available.';
    } else if (sorted) {
      message =
        'Sorting needs a connection to the server. In the default order, the pages saved on this device are available.';
    } else {
      message = `Page ${route.page} of ${cfg.label.toLowerCase()} has not been loaded before, so it is not available offline.`;
    }
  }
  replaceChildren(
    area,
    h(
      'div',
      { class: 'error-state', role: 'alert' },
      h('p', {}, message),
      h(
        'div',
        { class: 'error-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'button button-secondary',
            onClick: () => render(currentRoute()),
          },
          'Retry',
        ),
        filtered
          ? h(
              'a',
              { href: listUrl(route.entity), 'data-link': true, class: 'button button-secondary' },
              'Clear filters',
            )
          : null,
        sorted
          ? h(
              'a',
              {
                href: listUrl(route.entity, route.page, withoutSort(filters)),
                'data-link': true,
                class: 'button button-secondary',
              },
              'Default order',
            )
          : null,
      ),
    ),
  );
  shownPage = null;
}

/** Revalidates the view on screen (window focus, network back). */
function revalidateCurrent({ force = false } = {}) {
  // Filtered lists are not cached: they are fetched fresh each time.
  if (!isLoggedIn() || !isOnline() || !shownPage || shownPage.filterKey) return;
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
  document.getElementById('feedback-button').addEventListener('click', openFeedback);
  setRerender(() => render(currentRoute()));
  setServerRecordListener(updateShownRecord);
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
    navigate(listUrl(openDetail.entity, shownPage?.page ?? 1, shownPage?.filters ?? {}));
  });

  // Unsaved work survives closing or reloading the tab.
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', flushDraft);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDraft();
    else {
      revalidateCurrent();
      refreshRequestList();
    }
  });
  window.addEventListener('focus', () => {
    revalidateCurrent();
    refreshRequestList();
  });
  onNetworkChange((online) => {
    announce(online ? 'Back online.' : 'You are offline. Local data is shown.');
    if (online) {
      revalidateCurrent({ force: true });
      refreshRequestList();
    }
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
