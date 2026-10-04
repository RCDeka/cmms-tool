import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { TEST_CONFIG } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';

let ctx;
let app;
let frontendDir;

beforeAll(() => {
  ctx = createTestDb();
  // A tiny frontend that reproduces the real layout: a static folder named assets/.
  frontendDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-cmms-frontend-'));
  fs.mkdirSync(path.join(frontendDir, 'assets', 'css'), { recursive: true });
  fs.writeFileSync(path.join(frontendDir, 'index.html'), '<!doctype html><title>shell</title>');
  fs.writeFileSync(path.join(frontendDir, 'assets', 'css', 'base.css'), 'body{}');
  app = createApp({ db: ctx.db, config: TEST_CONFIG, frontendDir });
});

afterAll(() => {
  ctx.cleanup();
  fs.rmSync(frontendDir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('returns ok with the server time', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(new Date(res.body.time).toISOString()).toBe(res.body.time);
  });
});

describe('API errors', () => {
  it('answers 401 with the uniform error body when no token is sent', async () => {
    // Unknown API routes also answer 401 without a token: the API doesn't reveal its routes.
    const res = await request(app).get('/api/nothing-here').expect(401);
    expect(res.body).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing bearer token',
    });
  });

  it('answers 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Malformed JSON body',
    });
  });

  it('answers 413 for bodies over 100 kB', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(110 * 1024) }))
      .expect(413);
    expect(res.body.statusCode).toBe(413);
  });
});

describe('security headers', () => {
  it('sets a strict Content-Security-Policy and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('frontend serving', () => {
  it('serves static files', async () => {
    const res = await request(app).get('/assets/css/base.css').expect(200);
    expect(res.text).toBe('body{}');
  });

  it.each(['/', '/dashboard', '/assets', '/assets/12', '/work-orders/new'])(
    'returns the shell for the client route %s (no redirect)',
    async (route) => {
      const res = await request(app).get(route).expect(200);
      expect(res.text).toContain('<title>shell</title>');
    },
  );

  it('answers 404 for a missing file instead of the shell', async () => {
    await request(app).get('/assets/js/missing.js').expect(404);
  });
});
