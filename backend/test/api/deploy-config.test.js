// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Keeps the deployment files (deploy/) consistent with the code.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

describe('off-server backups (D72)', () => {
  it('start after a successful backup and run the script of deploy/', () => {
    expect(read('deploy/systemd/tacto-backup.service')).toMatch(
      /^OnSuccess=tacto-offsite-backup\.service$/m,
    );
    const unit = read('deploy/systemd/tacto-offsite-backup.service');
    expect(unit).toContain('ExecStart=/bin/bash /opt/tacto/deploy/tacto-offsite-backup.sh');
    expect(fs.existsSync(path.join(REPO_ROOT, 'deploy/tacto-offsite-backup.sh'))).toBe(true);
    expect(unit).toContain('EnvironmentFile=/etc/tacto/offsite.env');
  });

  it('are installed by the README with every other unit', () => {
    const readme = read('README.md');
    for (const file of fs.readdirSync(path.join(REPO_ROOT, 'deploy/systemd'))) {
      expect(readme, file).toContain(`/opt/tacto/deploy/systemd/${file}`);
    }
  });

  const restic = spawnSync('restic', ['version']).status === 0;
  it.skipIf(!restic)('store the newest backup, readable back, and fail on a wrong password', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-offsite-'));
    try {
      const backups = path.join(dir, 'backups');
      fs.mkdirSync(backups);
      fs.writeFileSync(path.join(backups, 'cmms-2026-10-13T00-30-00Z.sqlite'), 'older');
      fs.writeFileSync(path.join(backups, 'cmms-2026-10-14T00-30-00Z.sqlite'), 'newest');
      const env = {
        PATH: process.env.PATH,
        BACKUP_DIR: backups,
        RESTIC_REPOSITORY: path.join(dir, 'repo'),
        RESTIC_PASSWORD: 'test-password',
        RESTIC_CACHE_DIR: path.join(dir, 'cache'),
      };
      const run = (cmd, args, extra = {}) =>
        spawnSync(cmd, args, { env: { ...env, ...extra }, encoding: 'utf8' });
      expect(run('restic', ['init']).status).toBe(0);

      const script = path.join(REPO_ROOT, 'deploy/tacto-offsite-backup.sh');
      const ok = run('bash', [script]);
      expect(ok.stderr).toBe('');
      expect(ok.stdout).toContain('cmms-2026-10-14T00-30-00Z.sqlite stored and verified');
      expect(run('restic', ['dump', 'latest', 'cmms.sqlite']).stdout).toBe('newest');

      expect(run('bash', [script], { RESTIC_PASSWORD: 'wrong' }).status).not.toBe(0);
      expect(run('bash', [script], { BACKUP_DIR: path.join(dir, 'none') }).status).not.toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('deploy/systemd timers', () => {
  const zone = /^APP_TIMEZONE=(.+)$/m.exec(read('deploy/tacto.env.example'))[1];

  it.each(['deploy/systemd/tacto-backup.timer', 'deploy/systemd/tacto-pm-release.timer'])(
    '%s runs in APP_TIMEZONE, outside the hour skipped or repeated by daylight saving',
    (timer) => {
      const [, hour, zoneOfTimer] = /^OnCalendar=\*-\*-\* (\d\d):\d\d:\d\d (\S+)$/m.exec(
        read(timer),
      );
      expect(zoneOfTimer).toBe(zone);
      expect(hour).not.toBe('02');
    },
  );

  it('releases the preventive work orders after the backup', () => {
    const time = (timer) => /^OnCalendar=\*-\*-\* (\S+)/m.exec(read(timer))[1];
    expect(
      time('deploy/systemd/tacto-pm-release.timer') > time('deploy/systemd/tacto-backup.timer'),
    ).toBe(true);
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
