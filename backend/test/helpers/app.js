// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { dateInZone } from '../../src/lib/dates.js';
import { seedDatabase } from '../../src/db/seed/index.js';
import { TEST_PASSWORD, createTestDb } from './db.js';

export const TEST_CONFIG = loadConfig({
  JWT_SECRET: 'test-secret-0123456789abcdef',
  APP_TIMEZONE: 'Europe/Paris',
  DATABASE_PATH: ':memory:',
});

/** Fixed clock: seeded dates and "today" in the API agree. */
export const NOW = new Date('2026-10-04T12:00:00Z');
export const TODAY = dateInZone(TEST_CONFIG.timeZone, NOW);

export const USERNAMES = [
  'admin',
  'supervisor1',
  'supervisor2',
  'technician1',
  'technician2',
  'user1',
];

/**
 * App on a freshly seeded database (6 users, 500 assets, 320 work orders with the history, D64). Every seeded user
 * is logged in once up front, so `getAs` can return a Supertest request synchronously.
 * @param {object} [options] extra createApp options, e.g. a lower loginRateLimit
 * @param {boolean} [options.preLogin] set false when the test counts login attempts
 */
export async function createSeededApp({ preLogin = true, ...options } = {}) {
  const ctx = createTestDb();
  await seedDatabase(ctx.db, { password: TEST_PASSWORD, today: TODAY, now: NOW });
  const app = createApp({
    db: ctx.db,
    config: TEST_CONFIG,
    now: () => NOW,
    loginRateLimit: { windowMs: 60_000, limit: 1000 },
    ...options,
  });

  const tokens = new Map();
  if (preLogin) {
    for (const username of USERNAMES) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username, password: TEST_PASSWORD })
        .expect(200);
      tokens.set(username, res.body.token);
    }
  }
  /** Bearer token of a seeded user. */
  const tokenFor = (username) => {
    if (!tokens.has(username)) throw new Error(`No token for ${username} (preLogin disabled?)`);
    return tokens.get(username);
  };
  /** GET as a seeded user; returns a Supertest request (chain .expect()). */
  const getAs = (username, url) =>
    request(app)
      .get(url)
      .set('Authorization', `Bearer ${tokenFor(username)}`);

  return { app, db: ctx.db, tokenFor, getAs, cleanup: ctx.cleanup };
}

/** Fails if a response body contains a password hash or the column name. */
export function expectNoSecrets(body) {
  const text = JSON.stringify(body);
  if (text.includes('password_hash') || text.includes('$argon2')) {
    throw new Error(`Response leaks password data: ${text.slice(0, 200)}`);
  }
}
