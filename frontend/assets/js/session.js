// Session storage: JWT and the logged-in user, kept in localStorage (docs/architecture.md →
// Security). Kept apart from auth.js so api.js can read the token without a circular import.

const TOKEN_KEY = 'tacto.token';
const USER_KEY = 'tacto.user';

/** Decodes the payload of a JWT without verifying it (the server verifies). */
export function decodeTokenPayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part));
  } catch {
    return null;
  }
}

/** True when the token is missing, malformed, or past its expiry. */
export function isTokenExpired(token, now = Date.now()) {
  const payload = token ? decodeTokenPayload(token) : null;
  return !payload || typeof payload.exp !== 'number' || payload.exp * 1000 <= now;
}

/** Current token, or null when absent or expired. */
export function getToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token && !isTokenExpired(token) ? token : null;
}

/** Logged-in user ({ id, first_name, last_name, role, power_user, ... }) or null. */
export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
