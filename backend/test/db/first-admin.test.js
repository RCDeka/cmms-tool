// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { afterEach, describe, expect, it } from 'vitest';
import { createFirstAdmin } from '../../src/db/first-admin.js';
import { openDb } from '../../src/db/connection.js';
import { createTestDb } from '../helpers/db.js';

const NOW = new Date('2026-10-14T09:00:00Z');
const INPUT = {
  username: ' Claire.Martin ',
  password: 'a-long-password',
  first_name: 'Claire',
  last_name: 'Martin',
};
const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('createFirstAdmin', () => {
  let ctx;
  afterEach(() => ctx?.cleanup());

  it('creates an active administrator who can log in, logged without an author', async () => {
    ctx = createTestDb();
    const user = await createFirstAdmin(ctx.db, INPUT, { now: NOW });
    expect(user).toMatchObject({
      username: 'claire.martin',
      role: 'ADMIN',
      is_active: true,
      power_user: true,
      site: null,
    });
    const hash = ctx.db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .pluck()
      .get(user.id);
    expect(await argon2.verify(hash, INPUT.password)).toBe(true);
    const entry = ctx.db
      .prepare("SELECT action, user_id, changes FROM audit_log WHERE entity_type = 'users'")
      .get();
    expect(entry).toMatchObject({ action: 'CREATE', user_id: null });
    expect(entry.changes).not.toContain('password');
  });

  it('is refused once an active administrator exists', async () => {
    ctx = createTestDb();
    await createFirstAdmin(ctx.db, INPUT, { now: NOW });
    await expect(
      createFirstAdmin(ctx.db, { ...INPUT, username: 'second' }, { now: NOW }),
    ).rejects.toThrow(/already exists/);
    expect(ctx.db.prepare('SELECT count(*) FROM users').pluck().get()).toBe(1);
  });

  it('is allowed again when every administrator is inactive', async () => {
    ctx = createTestDb();
    await createFirstAdmin(ctx.db, INPUT, { now: NOW });
    ctx.db.prepare('UPDATE users SET is_active = 0').run();
    const user = await createFirstAdmin(ctx.db, { ...INPUT, username: 'second' }, { now: NOW });
    expect(user.username).toBe('second');
  });

  it('applies the account rules: username format and password length', async () => {
    ctx = createTestDb();
    const error = await createFirstAdmin(
      ctx.db,
      { ...INPUT, username: 'a b', password: 'short' },
      { now: NOW },
    ).catch((err) => err);
    expect(error.status).toBe(400);
    expect(Object.keys(error.details.fields).sort()).toEqual(['password', 'username']);
    expect(ctx.db.prepare('SELECT count(*) FROM users').pluck().get()).toBe(0);
  });
});

describe('npm run user:create-admin', () => {
  let dir;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const run = (args, password) =>
    spawnSync(process.execPath, ['src/db/cli.js', 'create-admin', ...args], {
      cwd: BACKEND,
      input: `${password}\n`,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret-long-enough',
        DATABASE_PATH: path.join(dir, 'cmms.sqlite'),
      },
    });

  it('migrates an empty database and creates the administrator from piped input', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-cli-'));
    const args = ['--username', 'claire', '--first-name=Claire', '--last-name', 'Martin'];
    const ok = run(args, 'a-long-password');
    expect(ok.stderr).toBe('');
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('Administrator claire created');

    const db = openDb(path.join(dir, 'cmms.sqlite'));
    expect(db.prepare('SELECT username, role FROM users').all()).toEqual([
      { username: 'claire', role: 'ADMIN' },
    ]);
    db.close();

    const again = run(
      ['--username', 'other', '--first-name', 'A', '--last-name', 'B'],
      'x'.repeat(12),
    );
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('already exists');
  });

  it('lists the invalid fields', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-cli-'));
    const bad = run(['--username', 'claire'], 'short');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/password: At least 10 characters/);
    expect(bad.stderr).toMatch(/first_name: /);
  });
});
