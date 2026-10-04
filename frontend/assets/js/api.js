// All HTTP calls go through apiFetch (AGENTS.md → Frontend).
import { API_BASE, REQUEST_TIMEOUT_MS } from './config.js';
import { getToken } from './session.js';

/** API failure. `status` is 0 when the server could not be reached or timed out. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {object | null} body error body { statusCode, error, message, details? }
   * @param {string} message
   */
  constructor(status, body, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

let unauthorizedHandler = () => {};

/** Called when an authenticated request answers 401 (expired or revoked token). */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

/**
 * Calls the API and returns the parsed JSON body (null for 204).
 * @param {string} path path under /api, e.g. '/assets?page=2'
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [options]
 */
export async function apiFetch(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    // A caller's own abort is not a network failure: let it propagate.
    if (signal?.aborted) throw err;
    throw new ApiError(0, null, 'The server cannot be reached.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = response.status === 204 || !isJson ? null : await response.json();
  if (response.ok) return data;

  if (response.status === 401 && token) unauthorizedHandler();
  throw new ApiError(response.status, data, data?.message ?? `Request failed (${response.status})`);
}
