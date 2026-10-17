// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// All HTTP calls go through apiFetch (AGENTS.md → Frontend).
import { API_BASE, REQUEST_TIMEOUT_MS } from './config.js';
import { reportOffline, reportOnline } from './network.js';
import { getToken } from './session.js';
import { serverText, t } from './i18n.js';

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
 * Puts the messages of an error body in the interface language (the server writes English,
 * D85): the message and the per-field messages of `details.fields`.
 * @param {{ message?: string, details?: { fields?: Record<string, string> } }} body
 */
export function translateErrorBody(body) {
  if (typeof body.message === 'string') body.message = serverText(body.message);
  const fields = body.details?.fields;
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    for (const [field, text] of Object.entries(fields)) fields[field] = serverText(text);
  }
}

/**
 * Calls the API and returns the parsed JSON body (null for 204).
 * @param {string} path path under /api, e.g. '/assets?page=2'
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal, timeoutMs?: number }} [options]
 */
export async function apiFetch(
  path,
  { method = 'GET', body, signal, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const timeout = AbortSignal.timeout(timeoutMs);
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
    reportOffline();
    throw new ApiError(0, null, t('The server cannot be reached.'));
  }
  reportOnline();

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = response.status === 204 || !isJson ? null : await response.json();
  if (response.ok) return data;
  if (data) translateErrorBody(data);

  if (response.status === 401 && token) unauthorizedHandler();
  throw new ApiError(
    response.status,
    data,
    data?.message ?? t('Request failed ({status})', { status: response.status }),
  );
}
