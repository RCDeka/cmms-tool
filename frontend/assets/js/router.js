// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Client router: URL ↔ route, history.pushState / popstate (docs/architecture.md → Client routes).
import { parseUserFilters } from './admin-users.js';
import { ENTITIES, entityForSegment } from './entities.js';
import { parseFeedbackFilters } from './feedback.js';
import { filtersQuery, isPlainList, parseFilters } from './filters.js';
import { AUDIT_TYPES } from './history.js';
import { parsePlanningFilters } from './planning.js';
import { parsePlaceFilters } from './places.js';
import { parseSchedulePanel } from './schedule.js';

const ID = /^[1-9]\d{0,15}$/;
/** Work orders created offline have a temporary id until the server answers (D26). */
const TMP_ID = /^tmp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * @typedef {object} Route
 * @property {'root'|'login'|'dashboard'|'list'|'detail'|'create'|'conflicts'|'conflict'|'audit'
 *   |'users'|'user'|'userCreate'|'places'|'place'|'placeCreate'|'levelTypes'|'account'|'feedback'|'requests'|'request'|'requestCreate'
 *   |'planning'|'plan'|'planCreate'|'blockedWeeks'|'planningSettings'|'schedule'|'myWeek'
 *   |'notFound'} name
 * @property {string | null} [week] week scheduler and My week: the week shown (current when null)
 * @property {object | null} [panel] week scheduler: the side panel open (schedule.js)
 * @property {number} [occurrenceId] plan panel: the visit clicked on the year planner
 * @property {'open'|'all'} [scope] staff request list: unfinished requests, or all (D46)
 * @property {string} [entity] 'assets' | 'work_orders'
 * @property {number | string} [id] number, or `tmp-<uuid>` for a work order not yet created
 * @property {number} [assetId] creation form: asset to pre-fill
 * @property {object} [filters] search, filters and sort of the table (only when some are set)
 * @property {number} page table page (1 when absent or invalid)
 * @property {string} [next] login: where to go after logging in
 */

/** Positive integer from a query value, or the fallback. */
function positiveInt(value, fallback) {
  return value && ID.test(value) ? Number(value) : fallback;
}

/**
 * Parses a path and query string into a route. Pure function.
 * @param {string} pathname
 * @param {string} [search]
 * @returns {Route}
 */
export function parseRoute(pathname, search = '') {
  const query = new URLSearchParams(search);
  const page = positiveInt(query.get('page'), 1);
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const [first, second, ...rest] = path.split('/').filter(Boolean);

  if (!first) return { name: 'root', page };
  if (first === 'admin' && second === 'users' && rest.length <= 1) {
    const filters = parseUserFilters(query);
    const extra = Object.keys(filters).length ? { filters } : {};
    const [third] = rest;
    if (!third) return { name: 'users', page, ...extra };
    if (third === 'new') return { name: 'userCreate', page, ...extra };
    return ID.test(third)
      ? { name: 'user', id: Number(third), page, ...extra }
      : { name: 'notFound', page };
  }
  if (first === 'admin' && second === 'locations' && rest.length <= 1) {
    // Places (D82): /admin/locations, /new (?parent=), /types, /:id.
    const filters = parsePlaceFilters(query);
    const extra = Object.keys(filters).length ? { filters } : {};
    const [third] = rest;
    if (!third) return { name: 'places', page, ...extra };
    if (third === 'new') return { name: 'placeCreate', page, ...extra };
    if (third === 'types') return { name: 'levelTypes', page, ...extra };
    return ID.test(third)
      ? { name: 'place', id: Number(third), page, ...extra }
      : { name: 'notFound', page };
  }
  if (first === 'admin' && second === 'planning' && !rest.length) {
    return { name: 'planningSettings', page };
  }
  if (first === 'admin' && second === 'widgets' && !rest.length) {
    return { name: 'widgetSettings', page };
  }
  if (first === 'planning') {
    // Year planner (D48): /planning, /planning/plans/new, /planning/plans/:id?occurrence=N.
    const filters = parsePlanningFilters(query);
    if (!second) return { name: 'planning', page, filters };
    if (second === 'blocked-weeks' && !rest.length) return { name: 'blockedWeeks', page, filters };
    if (second === 'suggestions' && !rest.length) return { name: 'suggestions', page, filters };
    const [third, ...more] = rest;
    if (second !== 'plans' || !third || more.length) return { name: 'notFound', page };
    if (third === 'new') return { name: 'planCreate', page, filters };
    if (!ID.test(third)) return { name: 'notFound', page };
    const occurrenceId = positiveInt(query.get('occurrence'), null);
    return {
      name: 'plan',
      id: Number(third),
      page,
      filters,
      ...(occurrenceId && { occurrenceId }),
    };
  }
  if (first === 'schedule' || (first === 'my-week' && !second)) {
    // Week scheduler and My week (D48, Phase 19): /schedule?week=2026-W41 and its panels.
    const value = query.get('week');
    const week = value && /^\d{4}-W\d{2}$/.test(value) ? value : null;
    if (first === 'my-week') return { name: 'myWeek', page, week };
    const panel = parseSchedulePanel([second, ...rest].filter(Boolean), query);
    return panel === undefined
      ? { name: 'notFound', page }
      : { name: 'schedule', page, week, panel };
  }
  if (first === 'admin' && second === 'feedback' && !rest.length) {
    const filters = parseFeedbackFilters(query);
    return { name: 'feedback', page, ...(filters.status && { filters }) };
  }
  if (rest.length) return { name: 'notFound', page };
  if (first === 'account' && !second) return { name: 'account', page };
  if (first === 'login' && !second)
    return { name: 'login', page, next: safeNext(query.get('next')) };
  if (first === 'dashboard') {
    // Personal dashboards of supervisors and admins (D59): /dashboard/:id.
    if (!second) return { name: 'dashboard', page };
    return ID.test(second)
      ? { name: 'dashboard', id: Number(second), page }
      : { name: 'notFound', page };
  }
  if (first === 'audit-log' && !second) {
    const type = query.get('type');
    return {
      name: 'audit',
      page,
      entityType: AUDIT_TYPES.some((t) => t.value === type) ? type : null,
    };
  }
  if (first === 'conflicts') {
    if (!second) return { name: 'conflicts', page };
    return ID.test(second)
      ? { name: 'conflict', id: Number(second), page }
      : { name: 'notFound', page };
  }

  if (first === 'requests') {
    if (!second) return { name: 'requests', scope: 'open', page };
    if (second === 'all') return { name: 'requests', scope: 'all', page };
    if (second === 'new') return { name: 'requestCreate', page };
    return ID.test(second)
      ? { name: 'request', id: Number(second), page }
      : { name: 'notFound', page };
  }

  const entity = entityForSegment(first);
  if (!entity) return { name: 'notFound', page };
  const filters = parseFilters(entity.key, query);
  const extra = isPlainList(filters) ? {} : { filters };
  if (!second) return { name: 'list', entity: entity.key, page, ...extra };
  if (second === 'new') {
    const assetId = entity.key === 'work_orders' ? positiveInt(query.get('asset_id'), null) : null;
    return { name: 'create', entity: entity.key, page, ...(assetId && { assetId }), ...extra };
  }
  if (ID.test(second))
    return { name: 'detail', entity: entity.key, id: Number(second), page, ...extra };
  if (TMP_ID.test(second) && entity.key === 'work_orders') {
    return { name: 'detail', entity: entity.key, id: second, page, ...extra };
  }
  return { name: 'notFound', page };
}

/**
 * Post-login destination: only same-site paths, never the login page itself
 * (prevents redirects to other sites through ?next=).
 */
export function safeNext(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/dashboard';
  }
  if (value === '/login' || value.startsWith('/login?')) return '/dashboard';
  return value;
}

/** Path + query of the filters, then the page (page 1 is implicit). */
function withQuery(path, entity, page, filters) {
  const query = new URLSearchParams(filtersQuery(entity, filters));
  if (page > 1) query.set('page', String(page));
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** URL of an entity table page, with its filters. */
export function listUrl(entity, page = 1, filters = {}) {
  return withQuery(ENTITIES[entity].ui, entity, page, filters);
}

/** URL of a record in split view, keeping the table page and filters. */
export function detailUrl(entity, id, page = 1, filters = {}) {
  return withQuery(`${ENTITIES[entity].ui}/${id}`, entity, page, filters);
}

let listener = () => {};
let guard = null;
let lastUrl = typeof location === 'undefined' ? '' : location.pathname + location.search;

/** Pages a record can be opened from, other than its own list, and their names (M8). */
const RETURN_PAGES = {
  dashboard: 'Dashboard',
  myWeek: 'My week',
  schedule: 'Week scheduler',
  planning: 'Year planner',
  plan: 'Year planner',
  conflicts: 'Conflicts',
  conflict: 'Conflicts',
  audit: 'Audit log',
};

/**
 * Name of the page a record was opened from, when "Back" should return there rather than to
 * the record's list (M8: a technician opening a work order from My week), else null. Pure.
 * @param {string | null | undefined} fromUrl path and query of the previous page in the app
 */
export function returnPage(fromUrl) {
  if (!fromUrl) return null;
  const at = fromUrl.indexOf('?');
  const from =
    at === -1 ? parseRoute(fromUrl) : parseRoute(fromUrl.slice(0, at), fromUrl.slice(at));
  return RETURN_PAGES[from.name] ?? null;
}

/** Path and query of the page the current one was opened from in the app, or null. */
export function cameFrom() {
  return history.state?.from ?? null;
}

/**
 * Called before leaving the current URL; resolves to false to stay (unsaved changes).
 * @param {((toUrl: string) => Promise<boolean> | boolean) | null} fn
 */
export function setNavigationGuard(fn) {
  guard = fn;
}

/** Current route from the browser location. */
export function currentRoute() {
  return parseRoute(location.pathname, location.search);
}

/**
 * Goes to a URL without reloading: pushState (or replaceState) then render. Resolves once the
 * new page is rendered, so a caller can then write a message on it (M1).
 * @param {string} url
 * @param {{ replace?: boolean }} [options]
 */
export async function navigate(url, { replace = false, force = false } = {}) {
  if (url === location.pathname + location.search && !replace) return;
  if (!force && guard && !(await guard(url))) return;
  // Each entry remembers the page it was opened from (M8); a replacement keeps it.
  if (replace) history.replaceState(history.state, '', url);
  else history.pushState({ from: lastUrl }, '', url);
  lastUrl = url;
  await listener(currentRoute());
}

/**
 * Starts routing: renders on back/forward, and turns clicks on internal links
 * (`<a data-link>` and the sidebar links) into navigate() calls.
 * @param {(route: Route) => void | Promise<void>} onRoute resolves when the route is rendered
 */
export function startRouter(onRoute) {
  listener = onRoute;
  lastUrl = location.pathname + location.search;
  window.addEventListener('popstate', async () => {
    const url = location.pathname + location.search;
    // Back/forward has already moved: if the user stays, put the previous URL back.
    if (guard && !(await guard(url))) {
      history.pushState(null, '', lastUrl);
      return;
    }
    lastUrl = url;
    listener(currentRoute());
  });
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-link]') : null;
    if (!link) return;
    // Let the browser handle new-tab and download gestures.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
  });
}
