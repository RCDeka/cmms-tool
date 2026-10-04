import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, createSeededApp, expectNoSecrets } from '../helpers/app.js';
import { TEST_PASSWORD } from '../helpers/db.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const login = (body) => request(ctx.app).post('/api/auth/login').send(body);
const sign = (payload, options = {}) =>
  jwt.sign(payload, TEST_CONFIG.jwtSecret, { algorithm: 'HS256', expiresIn: '1h', ...options });

describe('POST /api/auth/login', () => {
  it('returns a token, its lifetime and the user', async () => {
    const res = await login({ username: 'supervisor1', password: TEST_PASSWORD }).expect(200);
    expect(res.body).toEqual({
      token: expect.any(String),
      expires_in: 8 * 3600,
      user: {
        id: 2,
        last_name: 'Bernard',
        first_name: 'Julien',
        role: 'SUPERVISOR',
        power_user: true,
      },
    });
    expectNoSecrets(res.body);
    const payload = jwt.verify(res.body.token, TEST_CONFIG.jwtSecret);
    expect(payload).toMatchObject({ sub: '2', role: 'SUPERVISOR' });
  });

  it('accepts the username in any case (BR-U1)', async () => {
    const res = await login({ username: '  Technician1 ', password: TEST_PASSWORD }).expect(200);
    expect(res.body.user).toMatchObject({ role: 'TECHNICIAN', power_user: false });
  });

  it('answers 401 with the same message for a wrong password or an unknown user', async () => {
    const wrong = await login({ username: 'admin', password: 'wrong-password' }).expect(401);
    const unknown = await login({ username: 'nobody', password: TEST_PASSWORD }).expect(401);
    expect(wrong.body.message).toBe('Invalid username or password');
    expect(unknown.body).toEqual(wrong.body);
  });

  it.each([
    [{ username: 'admin' }, 'password'],
    [{ password: TEST_PASSWORD }, 'username'],
    [{ username: '', password: TEST_PASSWORD }, 'username'],
    [{ username: 'admin', password: TEST_PASSWORD, role: 'ADMIN' }, 'role'],
  ])('answers 400 for %o', async (body, field) => {
    const res = await login(body).expect(400);
    expect(res.body.details.fields).toHaveProperty(field);
  });
});

describe('login rate limit', () => {
  it('answers 429 after the limit, even with the right password', async () => {
    const limited = await createSeededApp({
      preLogin: false,
      loginRateLimit: { windowMs: 60_000, limit: 3 },
    });
    try {
      for (let i = 0; i < 3; i++) {
        await request(limited.app)
          .post('/api/auth/login')
          .send({ username: 'admin', password: 'wrong-password' })
          .expect(401);
      }
      const res = await request(limited.app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: TEST_PASSWORD })
        .expect(429);
      expect(res.body).toMatchObject({ statusCode: 429, error: 'Too Many Requests' });
      expect(res.headers).toHaveProperty('ratelimit-policy');
    } finally {
      limited.cleanup();
    }
  });
});

describe('token checks', () => {
  const me = (token) => {
    const req = request(ctx.app).get('/api/auth/me');
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  };

  it('GET /api/auth/me returns the public user', async () => {
    const res = await me(ctx.tokenFor('admin')).expect(200);
    expect(res.body).toEqual({
      id: 1,
      last_name: 'Martin',
      first_name: 'Claire',
      username: 'admin',
      role: 'ADMIN',
      site: 'Paris La Défense Headquarters',
      specialty: null,
      power_user: true,
      is_active: true,
    });
    expectNoSecrets(res.body);
  });

  it.each([
    ['no header', undefined, 'Missing bearer token'],
    ['garbage', 'not-a-jwt', 'Invalid token'],
    ['another secret', jwt.sign({ sub: '1' }, 'another-secret-0123456789'), 'Invalid token'],
    ['expired', sign({ sub: '1' }, { expiresIn: -10 }), 'Token expired'],
    ['unknown user', sign({ sub: '9999' }), 'Invalid token'],
    ['non-numeric subject', sign({ sub: 'admin' }), 'Invalid token'],
    ['algorithm none', jwt.sign({ sub: '1' }, null, { algorithm: 'none' }), 'Invalid token'],
  ])('answers 401 for %s', async (_case, token, message) => {
    const res = await me(token).expect(401);
    expect(res.body.message).toBe(message);
  });

  it('rejects a header that is not a bearer token', async () => {
    await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', 'Basic YWRtaW46eA==')
      .expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('answers 204 with a token and 401 without', async () => {
    await request(ctx.app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${ctx.tokenFor('technician1')}`)
      .expect(204);
    await request(ctx.app).post('/api/auth/logout').expect(401);
  });
});
