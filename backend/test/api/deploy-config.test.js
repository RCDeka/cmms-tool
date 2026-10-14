// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Keeps the deployment files (deploy/) consistent with the code.
import { execFile, spawnSync } from 'node:child_process';
import http from 'node:http';
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

describe('backup before migrations (Phase 28)', () => {
  it.each([
    'deploy/systemd/tacto.service',
    'deploy/systemd/tacto-backup.service',
    'deploy/systemd/tacto-pm-release.service',
  ])('%s can write BACKUP_DIR', (unit) => {
    const backupDir = /^BACKUP_DIR=(.+)$/m.exec(read('deploy/tacto.env.example'))[1];
    expect(read(unit)).toMatch(new RegExp(`^ReadWritePaths=${backupDir}$`, 'm'));
  });
});

describe('off-server backups (D72)', () => {
  it('start after a successful backup and run the script of deploy/', () => {
    expect(read('deploy/systemd/tacto-backup.service')).toMatch(
      /^OnSuccess=.*\btacto-offsite-backup\.service\b/m,
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

describe('alerts (Phase 29, D75)', () => {
  const script = path.join(REPO_ROOT, 'deploy/tacto-monitor.sh');

  it.each([
    'tacto.service',
    'tacto-backup.service',
    'tacto-offsite-backup.service',
    'tacto-pm-release.service',
    'tacto-heartbeat.service',
    'tacto-disk-check.service',
  ])('%s sends an alert when it fails', (unit) => {
    expect(read(`deploy/systemd/${unit}`)).toMatch(/^OnFailure=tacto-notify@%n\.service$/m);
  });

  it('runs the monitoring script of deploy/ with the alert settings', () => {
    expect(fs.existsSync(script)).toBe(true);
    for (const [unit, mode] of [
      ['tacto-notify@.service', 'failed %i'],
      ['tacto-heartbeat.service', 'heartbeat'],
      ['tacto-disk-check.service', 'disk'],
    ]) {
      const content = read(`deploy/systemd/${unit}`);
      expect(content, unit).toContain(
        `ExecStart=/bin/bash /opt/tacto/deploy/tacto-monitor.sh ${mode}`,
      );
      expect(content, unit).toContain('EnvironmentFile=/etc/tacto/notify.env');
    }
    const settings = read('deploy/tacto-notify.env.example')
      .split('\n')
      .map((line) => /^#? ?([A-Z_]+)=/.exec(line)?.[1])
      .filter(Boolean);
    expect(settings.length).toBe(5);
    for (const key of settings) expect(read('deploy/tacto-monitor.sh'), key).toContain(`${key}:`);
  });

  it("pings the dead man's switch after each successful backup", () => {
    expect(read('deploy/systemd/tacto-backup.service')).toMatch(
      /^OnSuccess=.*\btacto-heartbeat\.service\b/m,
    );
  });

  it('stops a crash loop of the API, so that it sends a bounded number of alerts', () => {
    const unit = read('deploy/systemd/tacto.service');
    expect(unit).toMatch(/^StartLimitBurst=5$/m);
    expect(unit).toMatch(/^StartLimitIntervalSec=10min$/m);
  });

  const curl = spawnSync('curl', ['--version']).status === 0;
  describe.skipIf(!curl)('tacto-monitor.sh', () => {
    let server;
    let requests;
    let status;
    let url;
    let dir;
    beforeAll(async () => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          requests.push({ method: req.method, url: req.url, headers: req.headers, body });
          res.writeHead(status).end();
        });
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${server.address().port}`;
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-monitor-'));
    });
    afterAll(() => {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    /** Runs the script asynchronously, so that the server above can answer it. */
    const run = (args, env = {}) => {
      requests = [];
      status = status ?? 200;
      return new Promise((resolve) => {
        execFile(
          'bash',
          [script, ...args],
          {
            env: {
              PATH: process.env.PATH,
              NOTIFY_URL: `${url}/tacto-alerts`,
              SILENCE_FILE: path.join(dir, 'silence-until'),
              DISK_PATHS: `${dir} ${dir}`,
              ...env,
            },
          },
          (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }),
        );
      });
    };

    it('pushes the name of a failed unit to the ntfy topic', async () => {
      status = 200;
      const res = await run(['failed', 'tacto-backup.service'], { NOTIFY_TOKEN: 'tk_secret' });
      expect(res.code).toBe(0);
      expect(requests).toHaveLength(1);
      const [sent] = requests;
      expect(sent).toMatchObject({ method: 'POST', url: '/tacto-alerts' });
      expect(sent.headers.title).toMatch(/^Tacto: tacto-backup\.service failed on /);
      expect(sent.headers.priority).toBe('high');
      expect(sent.headers.authorization).toBe('Bearer tk_secret');
      expect(sent.body).toBe('See: journalctl -u tacto-backup.service -n 50');
    });

    it('sends no token header for a public topic', async () => {
      await run(['failed', 'tacto.service']);
      expect(requests[0].headers.authorization).toBeUndefined();
    });

    it('fails when the alert cannot be sent or is not configured', async () => {
      status = 500;
      expect((await run(['failed', 'tacto.service'])).code).not.toBe(0);
      status = 200;
      const res = await run(['failed', 'tacto.service'], { NOTIFY_URL: '' });
      expect(res.code).not.toBe(0);
      expect(res.stderr).toContain('NOTIFY_URL');
      expect((await run(['unknown'])).code).toBe(2);
    });

    it('only writes to the journal until the end of a silence', async () => {
      const silence = path.join(dir, 'silence-until');
      try {
        fs.writeFileSync(silence, `${new Date(Date.now() + 3600_000).toISOString()}\n`);
        const res = await run(['failed', 'tacto.service']);
        expect(res.code).toBe(0);
        expect(res.stdout).toMatch(/^Silenced until /);
        expect(requests).toHaveLength(0);

        fs.writeFileSync(silence, `${new Date(Date.now() - 60_000).toISOString()}\n`);
        await run(['failed', 'tacto.service']);
        expect(requests).toHaveLength(1);
      } finally {
        fs.rmSync(silence, { force: true });
      }
    });

    it('warns once per disk at the threshold, and not below it', async () => {
      const full = await run(['disk'], { DISK_ALERT_PERCENT: '0' });
      expect(full.code).toBe(0);
      expect(requests).toHaveLength(1);
      expect(requests[0].headers.title).toMatch(/^Tacto: disk almost full on /);
      expect(requests[0].body.match(/% full/g)).toHaveLength(1); // the same disk named twice
      expect(requests[0].body).toContain(`Database and backups: ${dir} ${dir}`);

      const below = await run(['disk'], { DISK_ALERT_PERCENT: '101' });
      expect(below.code).toBe(0);
      expect(below.stdout).toContain('Disks below 101 %');
      expect(requests).toHaveLength(0);

      const missing = await run(['disk'], { DISK_PATHS: path.join(dir, 'none') });
      expect(missing.code).not.toBe(0);
    });

    it('pings the heartbeat URL, and fails when the ping is refused', async () => {
      const res = await run(['heartbeat'], { HEARTBEAT_URL: `${url}/ping/abc` });
      expect(res.code).toBe(0);
      expect(requests).toMatchObject([{ method: 'GET', url: '/ping/abc' }]);
      status = 404;
      expect((await run(['heartbeat'], { HEARTBEAT_URL: `${url}/ping/abc` })).code).not.toBe(0);
      status = 200;
      expect((await run(['heartbeat'])).code).not.toBe(0);
    });
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
