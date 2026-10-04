// Online/offline state (docs/architecture.md → Network state).
// Offline when the browser says so, or when an API call fails with a network error or a
// timeout. While offline, /api/health is pinged until the server answers again.
import { API_BASE, REQUEST_TIMEOUT_MS } from './config.js';

const PING_INTERVAL_MS = 15_000;

let online = typeof navigator === 'undefined' ? true : navigator.onLine;
let pingTimer = null;
const listeners = new Set();

export function isOnline() {
  return online;
}

/**
 * Subscribes to changes; the callback receives the new state (true = online).
 * @returns {() => void} unsubscribe
 */
export function onNetworkChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function setOnline(value) {
  if (value === online) return;
  online = value;
  applyToPage();
  if (online) stopPinging();
  else startPinging();
  for (const callback of listeners) callback(online);
}

/** An API response arrived (any status): the server is reachable. */
export function reportOnline() {
  setOnline(true);
}

/** An API call failed without a response (network error or timeout). */
export function reportOffline() {
  setOnline(false);
}

/** Asks the server directly; resolves to true when it answers. */
export async function ping() {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function startPinging() {
  if (pingTimer) return;
  pingTimer = setInterval(async () => {
    if (navigator.onLine && (await ping())) setOnline(true);
  }, PING_INTERVAL_MS);
}

function stopPinging() {
  clearInterval(pingTimer);
  pingTimer = null;
}

/**
 * Reflects the state on the page: `is-offline` on <body>, the status bar message, and
 * `.ai-only` buttons disabled offline (AI needs the server). Call again after rendering
 * new `.ai-only` buttons.
 */
export function applyToPage(root = document) {
  document.body.classList.toggle('is-offline', !online);
  const status = document.getElementById('network-status');
  if (status) {
    status.textContent = online ? 'Online' : 'Offline mode — local data';
    status.classList.toggle('is-offline', !online);
  }
  for (const button of root.querySelectorAll('.ai-only')) {
    button.disabled = !online;
    if (online) {
      button.removeAttribute('aria-disabled');
      button.removeAttribute('title');
    } else {
      button.setAttribute('aria-disabled', 'true');
      button.title = 'Not available offline: AI features need a connection.';
    }
  }
}

/** Starts listening to the browser's online/offline events. */
export function initNetwork() {
  window.addEventListener('offline', () => setOnline(false));
  // The 'online' event only means a network exists: confirm the server answers.
  window.addEventListener('online', async () => {
    if (await ping()) setOnline(true);
    else startPinging();
  });
  if (!online) startPinging();
  applyToPage();
}
