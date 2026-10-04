// Client router: URL ↔ route, history.pushState / popstate (docs/architecture.md → Client routes).
import { ENTITIES, entityForSegment } from './entities.js';
import { filtersQuery, hasFilters, parseFilters } from './filters.js';

const ID = /^[1-9]\d{0,15}$/;
/** Work orders created offline have a temporary id until the server answers (D26). */
const TMP_ID = /^tmp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * @typedef {object} Route
 * @property {'root'|'login'|'dashboard'|'list'|'detail'|'create'|'conflicts'|'conflict'|'notFound'} name
 * @property {string} [entity] 'assets' | 'work_orders'
 * @property {number | string} [id] number, or `tmp-<uuid>` for a work order not yet created
 * @property {number} [assetId] creation form: asset to pre-fill
 * @property {object} [filters] search and filters of the table (only when some are set)
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
  if (rest.length) return { name: 'notFound', page };
  if (first === 'login' && !second)
    return { name: 'login', page, next: safeNext(query.get('next')) };
  if (first === 'dashboard' && !second) return { name: 'dashboard', page };
  if (first === 'audit-log' && !second) {
    const type = query.get('type');
    return {
      name: 'audit',
      page,
      entityType: ['assets', 'work_orders'].includes(type) ? type : null,
    };
  }
  if (first === 'conflicts') {
    if (!second) return { name: 'conflicts', page };
    return ID.test(second)
      ? { name: 'conflict', id: Number(second), page }
      : { name: 'notFound', page };
  }

  const entity = entityForSegment(first);
  if (!entity) return { name: 'notFound', page };
  const filters = parseFilters(entity.key, query);
  const extra = hasFilters(filters) ? { filters } : {};
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
 * Goes to a URL without reloading: pushState (or replaceState) then render.
 * @param {string} url
 * @param {{ replace?: boolean }} [options]
 */
export async function navigate(url, { replace = false, force = false } = {}) {
  if (url === location.pathname + location.search && !replace) return;
  if (!force && guard && !(await guard(url))) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  lastUrl = url;
  listener(currentRoute());
}

/**
 * Starts routing: renders on back/forward, and turns clicks on internal links
 * (`<a data-link>` and the sidebar links) into navigate() calls.
 * @param {(route: Route) => void} onRoute
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
