import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, onUnauthorized } from '../assets/js/api.js';
import { currentUser, isLoggedIn, login, logout } from '../assets/js/auth.js';
import { isOnline, reportOnline } from '../assets/js/network.js';
import { navigate, setNavigationGuard, startRouter } from '../assets/js/router.js';

const json = (status, body) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? {} : { 'Content-Type': 'application/json' },
  });
const b64url = (o) =>
  btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = (exp = Math.floor(Date.now() / 1000) + 3600) => `h.${b64url({ sub: '2', exp })}.s`;

let fetchMock;
beforeEach(() => {
  localStorage.clear();
  reportOnline();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  reportOnline();
  vi.unstubAllGlobals();
  onUnauthorized(() => {});
});

describe('apiFetch', () => {
  it('sends the token and parses JSON', async () => {
    localStorage.setItem('fast-cmms.token', token());
    fetchMock.mockResolvedValue(json(200, { ok: 1 }));
    expect(await apiFetch('/assets?page=2')).toEqual({ ok: 1 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/assets?page=2');
    expect(options.headers.Authorization).toMatch(/^Bearer h\./);
  });

  it('sends JSON bodies and returns null for 204', async () => {
    fetchMock.mockResolvedValue(json(204, null));
    expect(await apiFetch('/auth/logout', { method: 'POST', body: { a: 1 } })).toBeNull();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"a":1}' });
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
  });

  it('turns error answers into ApiError with the server message', async () => {
    fetchMock.mockResolvedValue(
      json(422, { statusCode: 422, message: 'Not allowed', details: { rule: 'BR-W4' } }),
    );
    const err = await apiFetch('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 422,
      message: 'Not allowed',
      body: { details: { rule: 'BR-W4' } },
    });
    expect(err.isNetworkError).toBe(false);
  });

  it('reports the app offline when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await apiFetch('/x').catch((e) => e);
    expect(err).toMatchObject({ status: 0, isNetworkError: true });
    expect(isOnline()).toBe(false);
  });

  it("lets the caller's own abort through, without going offline", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    const err = await apiFetch('/x', { signal: controller.signal }).catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(isOnline()).toBe(true);
  });

  it('calls the 401 handler only when a token was sent', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    // A new Response per call: a body can only be read once.
    fetchMock.mockImplementation(async () =>
      json(401, { message: 'Invalid username or password' }),
    );
    await apiFetch('/auth/login', { method: 'POST', body: {} }).catch(() => {});
    expect(handler).not.toHaveBeenCalled();
    localStorage.setItem('fast-cmms.token', token());
    await apiFetch('/assets').catch(() => {});
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('auth', () => {
  it('stores the session and the full user after login', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(200, { token: token(), expires_in: 3600, user: { id: 2, role: 'SUPERVISOR' } }),
      )
      .mockResolvedValueOnce(
        json(200, { id: 2, role: 'SUPERVISOR', first_name: 'Julien', site: 'Paris' }),
      );
    const user = await login('supervisor1', 'secret-password');
    expect(user).toMatchObject({ id: 2, first_name: 'Julien', site: 'Paris' });
    expect(isLoggedIn()).toBe(true);
  });

  it('treats an expired token as logged out', () => {
    localStorage.setItem('fast-cmms.token', token(Math.floor(Date.now() / 1000) - 10));
    localStorage.setItem('fast-cmms.user', '{"id":2}');
    expect(isLoggedIn()).toBe(false);
    expect(currentUser()).toBeNull();
  });

  it('logs out locally even when the server cannot be reached', async () => {
    localStorage.setItem('fast-cmms.token', token());
    localStorage.setItem('fast-cmms.user', '{"id":2}');
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await logout();
    expect(localStorage.getItem('fast-cmms.token')).toBeNull();
    expect(isLoggedIn()).toBe(false);
  });
});

describe('navigation guard', () => {
  it('stays on the page when the guard refuses, and moves when it accepts', async () => {
    const onRoute = vi.fn();
    history.replaceState(null, '', '/assets/5');
    startRouter(onRoute);
    setNavigationGuard(() => false);
    await navigate('/assets/6');
    expect(location.pathname).toBe('/assets/5');
    expect(onRoute).not.toHaveBeenCalled();

    setNavigationGuard(async () => true);
    await navigate('/assets/6');
    expect(location.pathname).toBe('/assets/6');
    expect(onRoute).toHaveBeenCalledWith(expect.objectContaining({ name: 'detail', id: 6 }));

    await navigate('/assets/7', { force: true }); // forced moves skip the guard
    setNavigationGuard(null);
    expect(location.pathname).toBe('/assets/7');
  });
});
