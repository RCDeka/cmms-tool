// Service worker: keeps the app shell available offline (D9, D28).
// Strategy: network first with a short timeout, cache as fallback. Online users always get
// the current files (no version number to bump); offline, the last copy seen is used.
// API calls are never cached here: API data lives in IndexedDB.

const CACHE = 'fast-cmms-shell';
const NETWORK_TIMEOUT_MS = 4000;

// Every file of the shell. test/sw.test.js fails if a file under assets/ is missing here.
const SHELL_FILES = [
  '/index.html',
  '/assets/css/base.css',
  '/assets/css/components.css',
  '/assets/css/detail.css',
  '/assets/css/layout.css',
  '/assets/css/table.css',
  '/assets/img/logo.svg',
  '/assets/js/api.js',
  '/assets/js/app.js',
  '/assets/js/auth.js',
  '/assets/js/config.js',
  '/assets/js/conflicts.js',
  '/assets/js/dashboard.js',
  '/assets/js/db.js',
  '/assets/js/detail.js',
  '/assets/js/dom.js',
  '/assets/js/editor.js',
  '/assets/js/entities.js',
  '/assets/js/enums.js',
  '/assets/js/form.js',
  '/assets/js/format.js',
  '/assets/js/labels.js',
  '/assets/js/layout.js',
  '/assets/js/login.js',
  '/assets/js/network.js',
  '/assets/js/preload.js',
  '/assets/js/queue.js',
  '/assets/js/refs.js',
  '/assets/js/router.js',
  '/assets/js/rules.js',
  '/assets/js/save-modes.js',
  '/assets/js/session.js',
  '/assets/js/sync.js',
  '/assets/js/table.js',
  '/assets/vendor/chart.js-4.5.1/chart.umd.min.js',
  '/assets/vendor/idb-8.0.3/index.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      // Network first means a new worker can't serve stale files: take over at once.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Every client route (/assets/12, /work-orders, …) is the same shell.
    event.respondWith(networkFirst(request, '/index.html'));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(networkFirst(request, url.pathname));
  }
});

/** Network with a timeout; on success refresh the cache, on failure answer from the cache. */
async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    const cached = await cache.match(cacheKey);
    return cached ?? Response.error();
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
