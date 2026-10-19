// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Service worker: keeps the app shell available offline (D9, D28).
// Strategy: network first with a short timeout, cache as fallback. Online users always get
// the current files (no version number to bump); offline, the last copy seen is used.
// API calls are never cached here: API data lives in IndexedDB.

const CACHE = 'tacto-shell';
const NETWORK_TIMEOUT_MS = 4000;

// Every file of the shell. test/sw.test.js fails if a file under assets/ is missing here.
const SHELL_FILES = [
  '/index.html',
  '/assets/css/base.css',
  '/assets/css/components.css',
  '/assets/css/dashboards.css',
  '/assets/css/detail.css',
  '/assets/css/layout.css',
  '/assets/css/planning.css',
  '/assets/css/schedule.css',
  '/assets/css/table.css',
  '/assets/img/flag-fr.svg',
  '/assets/img/flag-gb.svg',
  '/assets/img/logo.svg',
  '/assets/js/account.js',
  '/assets/js/admin-users.js',
  '/assets/js/api.js',
  '/assets/js/app.js',
  '/assets/js/asset-picker.js',
  '/assets/js/auth.js',
  '/assets/js/comments.js',
  '/assets/js/config.js',
  '/assets/js/conflicts.js',
  '/assets/js/dashboard.js',
  '/assets/js/dashboards-page.js',
  '/assets/js/db.js',
  '/assets/js/detail.js',
  '/assets/js/dom.js',
  '/assets/js/editor.js',
  '/assets/js/entities.js',
  '/assets/js/export.js',
  '/assets/js/feedback.js',
  '/assets/js/enums.js',
  '/assets/js/filters.js',
  '/assets/js/find-work-order.js',
  '/assets/js/form.js',
  '/assets/js/format.js',
  '/assets/js/history.js',
  '/assets/js/i18n.js',
  '/assets/js/i18n-fr.js',
  '/assets/js/labels.js',
  '/assets/js/layout.js',
  '/assets/js/login.js',
  '/assets/js/my-week.js',
  '/assets/js/network.js',
  '/assets/js/plan-panel.js',
  '/assets/js/planner-page.js',
  '/assets/js/planner-editing.js',
  '/assets/js/planning-rules.js',
  '/assets/js/planning.js',
  '/assets/js/planning-settings.js',
  '/assets/js/sla.js',
  '/assets/js/preload.js',
  '/assets/js/queue.js',
  '/assets/js/refs.js',
  '/assets/js/router.js',
  '/assets/js/requests.js',
  '/assets/js/review.js',
  '/assets/js/places.js',
  '/assets/js/rules.js',
  '/assets/js/save-modes.js',
  '/assets/js/schedule.js',
  '/assets/js/schedule-editing.js',
  '/assets/js/schedule-history.js',
  '/assets/js/schedule-page.js',
  '/assets/js/schedule-panel.js',
  '/assets/js/schedule-rules.js',
  '/assets/js/session.js',
  '/assets/js/sync.js',
  '/assets/js/table.js',
  '/assets/js/widget-charts.js',
  '/assets/js/widget-order.js',
  '/assets/js/widget-settings.js',
  '/assets/js/widgets-compliance.js',
  '/assets/js/widgets-flow.js',
  '/assets/js/widgets-people.js',
  '/assets/js/widgets.js',
  '/assets/js/work-order-schedule.js',
  '/assets/vendor/chart.js-4.5.1/chart.umd.min.js',
  '/assets/vendor/idb-8.0.4/index.js',
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
