// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Screenshots of the README (docs/ui-guidelines.md → Screenshots, D78): `npm run docs:screenshots`.
//
// Creates a throwaway database with the mock data in a temporary folder, starts the server on
// it, takes the pictures listed in SHOTS with a headless Chromium driven over the DevTools
// protocol (Node's built-in WebSocket, no dependency), writes them to docs/img/ and stops
// everything. The database of .env is never opened.
//
// Settings (environment):
//   SHOTS_CHROME  browser command (default: the first of chromium, chromium-browser,
//                 google-chrome found on the PATH)
//   SHOTS_PORT    port of the throwaway server (default 3100)
//   SHOTS_OUT     output folder (default docs/img of the repository)
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.SHOTS_OUT ?? path.join(BACKEND, '..', 'docs', 'img'));
const PORT = Number(process.env.SHOTS_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const DEBUG_PORT = PORT + 1;

const COMPUTER = { width: 1440, height: 900, dpr: 1, mobile: false };
const PHONE = { width: 402, height: 874, dpr: 2, mobile: true }; // iPhone 17, at 2× to stay small

/** The pictures, grouped by user (one login each). `url` may use the ids found in the data. */
const SHOTS = [
  { name: 'dashboard', user: 'supervisor1', url: () => '/dashboard', size: COMPUTER },
  {
    name: 'work-orders',
    user: 'supervisor1',
    url: (ids) => `/work-orders/${ids.workOrder}`,
    size: COMPUTER,
  },
  {
    name: 'conflict',
    user: 'supervisor1',
    url: (ids) => `/conflicts/${ids.conflict}`,
    size: COMPUTER,
  },
  { name: 'year-planner', user: 'supervisor1', url: () => '/planning', size: COMPUTER, wait: 4000 },
  {
    name: 'week-scheduler',
    user: 'supervisor1',
    url: () => '/schedule',
    size: COMPUTER,
    wait: 4000,
  },
  { name: 'my-week-phone', user: 'technician1', url: () => '/my-week', size: PHONE },
  { name: 'requests-phone', user: 'user1', url: () => '/requests', size: PHONE },
  { name: 'request-phone', user: 'user1', url: (ids) => `/requests/${ids.request}`, size: PHONE },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  if (process.env.SHOTS_CHROME) return process.env.SHOTS_CHROME;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
    if (spawnSync('which', [name]).status === 0) return name;
  }
  throw new Error('No Chromium found: set SHOTS_CHROME to the browser command.');
}

/** Waits until `check` returns a truthy value (polled every 300 ms). */
async function waitFor(what, check, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      // Not ready yet.
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

/**
 * The records shown: a work order in progress on an asset (without a conflict), the work order
 * conflict, and a request of user1 in progress.
 */
function findIds(databasePath) {
  const db = new Database(databasePath, { readonly: true });
  try {
    const one = (sql) => db.prepare(sql).pluck().get();
    const ids = {
      workOrder: one(
        `SELECT id FROM work_orders WHERE status = 'IN_PROGRESS' AND asset_id IS NOT NULL
         AND has_conflict = 0 AND work_report IS NULL
         AND created_by IN (SELECT id FROM users WHERE role <> 'STAFF') ORDER BY id LIMIT 1`,
      ),
      conflict: one(
        `SELECT id FROM conflicts WHERE status = 'OPEN' AND entity_type = 'work_orders' LIMIT 1`,
      ),
      request: one(
        `SELECT w.id FROM work_orders w JOIN users u ON u.id = w.created_by
         WHERE u.username = 'user1' AND w.status = 'IN_PROGRESS' ORDER BY w.id LIMIT 1`,
      ),
    };
    for (const [key, value] of Object.entries(ids)) {
      if (!value) throw new Error(`The mock data has no record for "${key}".`);
    }
    return ids;
  } finally {
    db.close();
  }
}

/** Opens the DevTools protocol on the browser's page. */
async function connect() {
  const url = await waitFor('the browser', async () => {
    const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    return targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  });
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const waiting = pending.get(msg.id);
    if (!waiting) return;
    pending.delete(msg.id);
    if (msg.error) waiting.reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else waiting.resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close() };
}

async function takeScreenshots(page, password, ids) {
  const { send } = page;
  /** Runs `expression` in the page; a JavaScript error there stops the script. */
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(
        `In the page: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
      );
    }
    return result.value;
  };
  const go = async (url, wait = 1500) => {
    await send('Page.navigate', { url: BASE + url });
    await sleep(wait);
  };

  await send('Page.enable');
  await send('Emulation.setLocaleOverride', { locale: 'en-GB' });
  fs.mkdirSync(OUT, { recursive: true });

  let currentUser = null;
  const seen = new Map();
  for (const shot of SHOTS) {
    const { width, height, dpr, mobile } = shot.size;
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    if (shot.user !== currentUser) {
      // A new session: forget the previous user's token and local cache.
      await go('/login');
      await evaluate(`(async () => {
        localStorage.clear();
        const names = (await indexedDB.databases()).map((d) => d.name);
        await Promise.all(names.map((name) => new Promise((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = request.onerror = request.onblocked = resolve;
        })));
      })()`);
      await go('/login');
      await evaluate(`(() => {
        const set = (id, value) => {
          const input = document.getElementById(id);
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set('login-username', ${JSON.stringify(shot.user)});
        set('login-password', ${JSON.stringify(password)});
        document.querySelector('.login-form').requestSubmit();
      })()`);
      await sleep(3000);
      const signedIn = await evaluate(`JSON.parse(localStorage.getItem('tacto.user'))?.username`);
      if (signedIn !== shot.user) throw new Error(`Logging in as ${shot.user} failed.`);
      currentUser = shot.user;
    }
    await go(shot.url(ids), shot.wait ?? 2500);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    // Two identical pictures mean a page did not open (e.g. a redirect): stop.
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    if (seen.has(hash)) throw new Error(`${shot.name} is the same picture as ${seen.get(hash)}.`);
    seen.set(hash, shot.name);
    const file = path.join(OUT, `${shot.name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`Saved ${path.relative(process.cwd(), file)}`);
  }
}

async function main() {
  const chrome = findChrome();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tacto-shots-'));
  const password = crypto.randomBytes(12).toString('hex');
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    DATABASE_PATH: path.join(tmp, 'shots.sqlite'),
    BACKUP_DIR: path.join(tmp, 'backups'),
    SEED_PASSWORD: password,
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  };
  const children = [];
  try {
    const reset = spawnSync('node', ['src/db/cli.js', 'reset', '--with-conflicts'], {
      cwd: BACKEND,
      env,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (reset.status !== 0) throw new Error('Creating the mock database failed.');
    const ids = findIds(env.DATABASE_PATH);

    const server = spawn('node', ['src/server.js'], { cwd: BACKEND, env, stdio: 'ignore' });
    children.push(server);
    await waitFor('the server', async () => (await fetch(`${BASE}/api/health`)).ok);

    const browser = spawn(
      chrome,
      [
        '--headless=new',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${path.join(tmp, 'profile')}`,
        '--no-first-run',
        '--hide-scrollbars',
        '--force-color-profile=srgb',
        '--lang=en-GB',
        'about:blank',
      ],
      // The browser's own date and week fields follow the system language (D69).
      {
        stdio: 'ignore',
        env: { ...env, LANG: 'en_GB.UTF-8', LANGUAGE: 'en_GB:en', LC_ALL: 'en_GB.UTF-8' },
      },
    );
    children.push(browser);
    const page = await connect();
    try {
      await takeScreenshots(page, password, ids);
    } finally {
      page.close();
    }
  } finally {
    for (const child of children) child.kill();
    await sleep(500);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
