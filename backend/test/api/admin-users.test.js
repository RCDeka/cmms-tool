// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededApp, expectNoSecrets } from '../helpers/app.js';
import { TEST_PASSWORD } from '../helpers/db.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const as = (token) => ({
  get: (url) => request(ctx.app).get(url).set('Authorization', `Bearer ${token}`),
  send: (method, url, body) =>
    request(ctx.app)[method](url).set('Authorization', `Bearer ${token}`).send(body),
});
const admin = () => as(ctx.tokenFor('admin'));
const login = (username, password) =>
  request(ctx.app).post('/api/auth/login').send({ username, password });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const newUser = (o = {}) => ({
  username: `user${randomUUID().slice(0, 8)}`,
  password: 'a-long-password-1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  role: 'TECHNICIAN',
  ...o,
});

describe('access', () => {
  it.each(['supervisor1', 'technician1'])(
    'is reserved to administrators (%s → 403)',
    async (username) => {
      const user = as(ctx.tokenFor(username));
      await user.get('/api/admin/users').expect(403);
      await user.send('post', '/api/admin/users', newUser()).expect(403);
      await user.send('put', '/api/admin/users/4', { first_name: 'x' }).expect(403);
      await user
        .send('post', '/api/admin/users/4/password', { password: 'x'.repeat(12) })
        .expect(403);
    },
  );
});

describe('GET /api/admin/users', () => {
  it('lists every user with search and filters, without password data', async () => {
    const all = (await admin().get('/api/admin/users').expect(200)).body;
    expect(all.total).toBe(6);
    expect(all.items[0]).toHaveProperty('is_active', true);
    expectNoSecrets(all);
    expect((await admin().get('/api/admin/users?role=SUPERVISOR').expect(200)).body.total).toBe(2);
    expect(
      (await admin().get('/api/admin/users?q=bena').expect(200)).body.items.map((u) => u.username),
    ).toEqual(['technician1']);
    await admin().get('/api/admin/users?role=BOSS').expect(400);
  });
});

describe('POST /api/admin/users', () => {
  it('creates a user who can log in, with defaults and an audit entry', async () => {
    const body = newUser({ username: '  New.Tech ', role: 'SUPERVISOR' });
    const res = await admin().send('post', '/api/admin/users', body).expect(201);
    expect(res.body.item).toMatchObject({
      username: 'new.tech',
      role: 'SUPERVISOR',
      power_user: true,
      is_active: true,
      site: null,
    });
    expectNoSecrets(res.body);
    await login('new.tech', body.password).expect(200);
    const log = (await admin().get('/api/audit-log?entity_type=users').expect(200)).body.items[0];
    expect(log).toMatchObject({ action: 'CREATE', label: 'Ada Lovelace (new.tech)' });
    expect(JSON.stringify(log)).not.toMatch(/password/);
  });

  it('shows account changes in the audit log to admins only', async () => {
    const supervisor = as(ctx.tokenFor('supervisor1'));
    await supervisor.get('/api/audit-log?entity_type=users').expect(403);
    const seen = (await supervisor.get('/api/audit-log?size=100').expect(200)).body.items;
    expect(seen.some((e) => e.entity_type === 'users')).toBe(false);
    const all = (await admin().get('/api/audit-log?size=100').expect(200)).body.items;
    expect(all.some((e) => e.entity_type === 'users')).toBe(true);
  });

  it.each([
    ['a taken username', { username: 'admin' }, 409],
    ['a short password', { password: 'short' }, 400],
    ['an invalid username', { username: 'a b' }, 400],
    ['an unknown role', { role: 'BOSS' }, 400],
    ['an unknown field', { is_admin: true }, 400],
  ])('refuses %s', async (_case, override, status) => {
    await admin().send('post', '/api/admin/users', newUser(override)).expect(status);
  });
});

describe('PUT /api/admin/users/:id', () => {
  it('changes the profile, role and power-user mode, and logs it', async () => {
    const { item } = (await admin().send('post', '/api/admin/users', newUser()).expect(201)).body;
    const res = await admin()
      .send('put', `/api/admin/users/${item.id}`, {
        last_name: 'Byron',
        site: '  ',
        specialty: 'HVAC',
        power_user: true,
      })
      .expect(200);
    expect(res.body.item).toMatchObject({
      last_name: 'Byron',
      site: null,
      specialty: 'HVAC',
      power_user: true,
    });
    const history = (await admin().get(`/api/audit-log?entity_type=users`).expect(200)).body
      .items[0];
    expect(history.changes).toEqual({
      last_name: { from: 'Lovelace', to: 'Byron' },
      specialty: { from: null, to: 'HVAC' },
      power_user: { from: false, to: true },
    });
  });

  it('never changes the username', async () => {
    await admin().send('put', '/api/admin/users/4', { username: 'other' }).expect(400);
  });

  it('keeps the last active administrator (BR-U4) and refuses self-deactivation (BR-U6)', async () => {
    expect(
      (await admin().send('put', '/api/admin/users/1', { role: 'SUPERVISOR' }).expect(409)).body
        .details,
    ).toEqual({ rule: 'BR-U4' });
    expect(
      (await admin().send('put', '/api/admin/users/1', { is_active: false }).expect(409)).body
        .details,
    ).toEqual({ rule: 'BR-U6' });
  });

  it('refuses deactivating someone with unfinished work (BR-U5)', async () => {
    const res = await admin().send('put', '/api/admin/users/5', { is_active: false }).expect(409);
    expect(res.body.details).toEqual({ rule: 'BR-U5' });
    expect(res.body.message).toMatch(/reassign/);
  });

  it('deactivation ends access everywhere, reactivation restores it (BR-U7)', async () => {
    const body = newUser();
    const { item } = (await admin().send('post', '/api/admin/users', body).expect(201)).body;
    const token = (await login(body.username, body.password).expect(200)).body.token;
    await as(token).get('/api/auth/me').expect(200);

    await admin().send('put', `/api/admin/users/${item.id}`, { is_active: false }).expect(200);
    expect((await as(token).get('/api/auth/me').expect(401)).body.message).toBe(
      'This account is deactivated',
    );
    expect((await login(body.username, body.password).expect(401)).body.message).toBe(
      'Invalid username or password',
    );
    const assignable = (await as(ctx.tokenFor('supervisor1')).get('/api/users').expect(200)).body;
    expect(assignable.map((u) => u.id)).not.toContain(item.id);
    await as(ctx.tokenFor('supervisor1'))
      .send('post', '/api/work-orders', {
        client_id: randomUUID(),
        type: 'CORRECTIVE',
        title: 'x',
        site: 'Lyon Part-Dieu Branch',
        assignee_id: item.id,
      })
      .expect(422);

    await admin().send('put', `/api/admin/users/${item.id}`, { is_active: true }).expect(200);
    await login(body.username, body.password).expect(200);
  });
});

describe('passwords (BR-U8)', () => {
  it('admin reset ends the sessions and replaces the password', async () => {
    const body = newUser();
    const { item } = (await admin().send('post', '/api/admin/users', body).expect(201)).body;
    const token = (await login(body.username, body.password).expect(200)).body.token;
    await wait(1100); // JWT times are whole seconds
    await admin()
      .send('post', `/api/admin/users/${item.id}/password`, { password: 'brand-new-password' })
      .expect(204);
    expect((await as(token).get('/api/auth/me').expect(401)).body.message).toBe(
      'Your password changed: log in again',
    );
    await login(body.username, body.password).expect(401);
    await login(body.username, 'brand-new-password').expect(200);
    const log = (await admin().get(`/api/audit-log?entity_type=users`).expect(200)).body.items[0];
    expect(log).toMatchObject({ action: 'UPDATE', changes: {}, note: { password_reset: true } });
    await admin()
      .send('post', `/api/admin/users/${item.id}/password`, { password: 'short' })
      .expect(400);
    await admin()
      .send('post', '/api/admin/users/9999/password', { password: 'long-enough-pw' })
      .expect(404);
  });

  it('users change their own password and get a new token', async () => {
    const body = newUser();
    await admin().send('post', '/api/admin/users', body).expect(201);
    const token = (await login(body.username, body.password).expect(200)).body.token;
    const wrong = await as(token)
      .send('post', '/api/auth/change-password', {
        current_password: 'not-it',
        new_password: 'another-password',
      })
      .expect(400);
    expect(wrong.body.details.fields).toHaveProperty('current_password');
    await wait(1100);
    const res = await as(token)
      .send('post', '/api/auth/change-password', {
        current_password: body.password,
        new_password: 'another-password',
      })
      .expect(200);
    expect(res.body).toMatchObject({ token: expect.any(String), expires_in: expect.any(Number) });
    await as(token).get('/api/auth/me').expect(401);
    await as(res.body.token).get('/api/auth/me').expect(200);
    await login(body.username, 'another-password').expect(200);
    await as(res.body.token)
      .send('post', '/api/auth/change-password', {
        current_password: 'another-password',
        new_password: 'short',
      })
      .expect(400);
  });

  it('seeded users still log in with the seed password', async () => {
    await login('technician2', TEST_PASSWORD).expect(200);
  });
});
