// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Keeps the deployment files (deploy/) consistent with the code.
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { REPO_ROOT, loadConfig } from '../../src/config/index.js';
import { TEST_CONFIG } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';

const read = (file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');

let ctx;
beforeAll(() => {
  ctx = createTestDb();
});
afterAll(() => ctx.cleanup());

describe('deploy/nginx', () => {
  it('sends the same Content-Security-Policy as Express', async () => {
    const res = await request(createApp({ db: ctx.db, config: TEST_CONFIG })).get('/api/health');
    const nginxCsp = /Content-Security-Policy "([^"]+)"/.exec(
      read('deploy/nginx/tacto-headers.conf'),
    )[1];
    expect(nginxCsp).toBe(res.headers['content-security-policy']);
  });

  it('proxies the API to the default port on the loopback interface', () => {
    const config = loadConfig({ JWT_SECRET: 'x'.repeat(32) });
    expect(read('deploy/nginx/tacto.conf')).toContain(`server ${config.host}:${config.port};`);
  });

  it('never falls back to directories ($uri/), which would break the /assets route', () => {
    expect(read('deploy/nginx/tacto.conf')).not.toMatch(/try_files[^;]*\$uri\//);
  });
});

describe('deploy/systemd', () => {
  it.each([
    ['deploy/systemd/tacto.service', 'src/server.js'],
    ['deploy/systemd/tacto-backup.service', 'src/db/cli.js backup'],
    ['deploy/systemd/tacto-pm-release.service', 'src/db/cli.js release'],
  ])('%s starts a script that exists', (unit, command) => {
    const content = read(unit);
    expect(content).toContain(`ExecStart=/usr/bin/node ${command}`);
    expect(fs.existsSync(path.join(REPO_ROOT, 'backend', command.split(' ')[0]))).toBe(true);
    expect(content).toContain('WorkingDirectory=/opt/tacto/backend');
  });
});

describe('deploy/tacto.env.example', () => {
  it('only uses settings the application reads', () => {
    const source = read('backend/src/config/index.js');
    const keys = read('deploy/tacto.env.example')
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => line.split('=')[0]);
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(source, key).toContain(`${key}:`);
  });

  it('describes a configuration that passes the production checks once the secret is set', () => {
    const env = Object.fromEntries(
      read('deploy/tacto.env.example')
        .split('\n')
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => line.split(/=(.*)/s).slice(0, 2)),
    );
    expect(() => loadConfig(env)).toThrow(/JWT_SECRET/); // empty in the template
    const cfg = loadConfig({ ...env, JWT_SECRET: 'y'.repeat(48), SEED_PASSWORD: undefined });
    expect(cfg).toMatchObject({
      nodeEnv: 'production',
      host: '127.0.0.1',
      databasePath: '/var/lib/tacto/cmms.sqlite',
    });
  });
});
