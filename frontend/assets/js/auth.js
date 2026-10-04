// Login, logout and the current user.
import { apiFetch } from './api.js';
import { clearSession, getToken, getUser, saveSession, saveUser } from './session.js';

export function isLoggedIn() {
  return getToken() !== null && getUser() !== null;
}

/** The logged-in user, or null. */
export function currentUser() {
  return isLoggedIn() ? getUser() : null;
}

/** True when the current user has one of the roles. */
export function hasRole(...roles) {
  return roles.includes(currentUser()?.role);
}

/** Logs in and stores the session. Throws ApiError (401 credentials, 429 rate limit, …). */
export async function login(username, password) {
  const { token, user } = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  saveSession(token, user);
  // /auth/me returns the full public user (site, specialty, …); best effort.
  try {
    saveUser(await apiFetch('/auth/me'));
  } catch {
    /* the login response already holds what the UI needs */
  }
  return currentUser();
}

/** Ends the session locally; the server call is best effort (JWTs are stateless, D22). */
export async function logout() {
  try {
    if (getToken()) await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    /* logging out must work offline too */
  } finally {
    clearSession();
  }
}
