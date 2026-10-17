// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Screenshots of the README and of docs/showcase.md (docs/ui-guidelines.md → Screenshots, D78,
// D84): `npm run docs:screenshots`, or `npm run docs:screenshots -- showcase/` for the pictures
// whose name starts with `showcase/`.
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
const TALL = { width: 1440, height: 2400, dpr: 1, mobile: false }; // a whole dashboard
const PHONE = { width: 402, height: 874, dpr: 2, mobile: true }; // iPhone 17, at 2× to stay small

/** Fills a field of the page and tells the app (runs in the page). */
const FILL = `const fill = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};`;

/** Opens the collapsed sections of the detail panel (history) and scrolls to the last one. */
const OPEN_HISTORY = `(async () => {
  const panel = document.getElementById('detail-container');
  for (const details of panel.querySelectorAll('details')) details.open = true;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  panel.querySelector('details:last-of-type summary').scrollIntoView({ block: 'start' });
})()`;

/** Scrolls the dashboard to the widget titled `title` (runs in the page). */
const scrollToWidget = (
  title,
) => `[...document.querySelectorAll('#table-container h2, #table-container h3')]
  .find((el) => el.textContent.trim() === ${JSON.stringify(title)})
  ?.closest('section, article, li, div')
  .scrollIntoView({ block: 'start' });`;

/**
 * The pictures, grouped by user (one login each; the login is rate limited). `url(ids, call)`
 * gives the page (none: stay on the previous one); `call(method, path, body)` calls the API as the logged-in user. `action` runs
 * in the page once it has opened, `after` ms before the picture; `offline` cuts the network
 * first; `language: 'fr'` shows the interface in French for that picture (D85). README
 * pictures sit in docs/img/, the showcase ones (docs/showcase.md) in showcase/.
 */
const SHOTS = [
  { name: 'showcase/login', user: null, url: () => '/login', size: COMPUTER },

  { name: 'dashboard', user: 'supervisor1', url: () => '/dashboard', size: COMPUTER },
  {
    name: 'showcase/dashboard-full',
    user: 'supervisor1',
    url: () => '/dashboard',
    size: TALL,
    wait: 5000,
  },
  {
    name: 'showcase/dashboard-flow',
    user: 'supervisor1',
    url: () => '/dashboard',
    size: COMPUTER,
    wait: 4000,
    // Ticks every widget of the sidebar, then shows the flow and backlog ones.
    action: `(async () => {
      // The sidebar is drawn again after each tick: look for the next box each time.
      const next = () =>
        document.querySelector('#widget-picker input[type=checkbox]:not(:checked)');
      for (let box = next(), n = 0; box && n < 40; box = next(), n++) {
        box.click();
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
      ${scrollToWidget('Opened vs closed')}
    })()`,
  },
  {
    name: 'showcase/dashboard-compliance',
    user: 'supervisor1',
    url: null,
    size: COMPUTER,
    action: scrollToWidget('Preventive maintenance compliance'),
  },
  {
    name: 'showcase/dashboard-assets',
    user: 'supervisor1',
    url: null,
    size: COMPUTER,
    action: scrollToWidget('Assets with the most breakdowns'),
  },
  {
    name: 'showcase/dashboard-people',
    user: 'supervisor1',
    url: null,
    size: COMPUTER,
    action: scrollToWidget('Workload per person'),
  },
  {
    name: 'showcase/dashboard-drill',
    user: 'supervisor1',
    url: () => '/work-orders?status=OPEN,IN_PROGRESS,ON_HOLD&overdue=true',
    size: COMPUTER,
  },
  {
    name: 'work-orders',
    user: 'supervisor1',
    url: (ids) => `/work-orders/${ids.workOrder}`,
    size: COMPUTER,
  },
  {
    name: 'showcase/work-order-history',
    user: 'supervisor1',
    url: (ids) => `/work-orders/${ids.workOrder}`,
    size: COMPUTER,
    action: OPEN_HISTORY,
    after: 500,
  },
  {
    name: 'showcase/french',
    user: 'supervisor1',
    url: (ids) => `/work-orders/${ids.workOrder}`,
    size: COMPUTER,
    language: 'fr',
  },
  {
    name: 'showcase/review-request',
    user: 'supervisor1',
    url: (ids) => `/work-orders/${ids.toReview}?to_review=true`,
    size: COMPUTER,
  },
  {
    name: 'showcase/request-conversation',
    user: 'supervisor1',
    url: (ids) => `/work-orders/${ids.conversation}?awaiting_reply=true`,
    size: COMPUTER,
    action: `(() => {
      const panel = document.getElementById('detail-container');
      panel.scrollTop = panel.scrollHeight;
      for (const el of panel.querySelectorAll('*')) el.scrollTop = el.scrollHeight;
    })()`,
  },
  {
    name: 'showcase/assets',
    user: 'supervisor1',
    url: () => '/assets?status=BROKEN_DOWN,OUT_OF_SERVICE',
    size: COMPUTER,
  },
  {
    name: 'showcase/asset',
    user: 'supervisor1',
    url: (ids) => `/assets/${ids.asset}`,
    size: COMPUTER,
  },
  {
    name: 'showcase/work-order-new',
    user: 'supervisor1',
    url: (ids) => `/work-orders/new?asset_id=${ids.asset}`,
    size: COMPUTER,
  },
  {
    name: 'showcase/find-work-order',
    user: 'supervisor1',
    url: () => '/work-orders',
    size: COMPUTER,
    action: `(() => {
      ${FILL}
      document.getElementById('find-button').click();
      const dialog = document.getElementById('find-dialog');
      fill(dialog.querySelector('textarea'), 'Air conditioning too noisy on the trading floor');
      dialog.querySelector('form').requestSubmit();
    })()`,
    after: 2500,
  },
  {
    name: 'showcase/conflicts',
    user: 'supervisor1',
    url: async (ids, call) => {
      await postFeedback(call, 'supervisor1');
      return '/conflicts';
    },
    size: COMPUTER,
  },
  {
    name: 'showcase/conflict-locked',
    user: 'supervisor1',
    url: (ids) => `/work-orders/${ids.conflictWorkOrder}`,
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
    name: 'showcase/plan',
    user: 'supervisor1',
    url: (ids) => `/planning/plans/${ids.plan}?occurrence=${ids.occurrence}`,
    size: COMPUTER,
    wait: 4000,
  },
  {
    name: 'showcase/blocked-weeks',
    user: 'supervisor1',
    url: async (ids, call) => {
      const blocks = [
        [10, null, 'Year-end closure'],
        [3, 'Saclay Data Center', 'Data center change freeze'],
      ];
      for (const [weeks, site, reason] of blocks) {
        await call('POST', '/api/planning/blocked-weeks', { week: isoWeek(weeks), site, reason });
      }
      return '/planning/blocked-weeks';
    },
    size: COMPUTER,
    wait: 4000,
  },
  {
    name: 'showcase/suggestions',
    user: 'supervisor1',
    url: () => '/planning/suggestions',
    size: COMPUTER,
    wait: 6000,
  },
  {
    name: 'week-scheduler',
    user: 'supervisor1',
    url: () => '/schedule',
    size: COMPUTER,
    wait: 4000,
  },
  {
    name: 'showcase/schedule-work-order',
    user: 'supervisor1',
    url: async (ids, call) =>
      `/schedule/work-orders/${(await call('GET', '/api/schedule')).tray[0].id}`,
    size: COMPUTER,
    wait: 4000,
  },
  { name: 'showcase/places', user: 'supervisor1', url: () => '/admin/locations', size: COMPUTER },
  { name: 'showcase/audit-log', user: 'supervisor1', url: () => '/audit-log', size: COMPUTER },

  {
    name: 'showcase/dashboard-technician',
    user: 'technician1',
    url: () => '/dashboard',
    size: COMPUTER,
  },
  { name: 'my-week-phone', user: 'technician1', url: () => '/my-week', size: PHONE },
  {
    name: 'showcase/work-orders-phone',
    user: 'technician1',
    url: () => '/work-orders',
    size: PHONE,
  },
  {
    name: 'showcase/work-order-phone',
    user: 'technician1',
    url: (ids) => `/work-orders/${ids.technicianWorkOrder}`,
    size: PHONE,
  },
  {
    name: 'showcase/menu-phone',
    user: 'technician1',
    url: () => '/my-week',
    size: PHONE,
    action: `document.getElementById('menu-button').click()`,
    after: 800,
  },
  {
    name: 'showcase/feedback',
    user: 'technician1',
    url: async (ids, call) => {
      await postFeedback(call, 'technician1');
      return '/my-week';
    },
    size: COMPUTER,
    action: `(() => {
      ${FILL}
      document.getElementById('feedback-button').click();
      fill(
        document.querySelector('#feedback-dialog textarea'),
        'Could My week also show the access code of each plant room?',
      );
    })()`,
    after: 800,
  },
  {
    name: 'showcase/offline',
    user: 'technician1',
    url: (ids) => `/work-orders/${ids.technicianWorkOrder}`,
    size: COMPUTER,
    offline: true,
    // A change saved offline waits in the queue.
    action: `(() => {
      ${FILL}
      const panel = document.getElementById('detail-container');
      fill(
        panel.querySelector('[name=work_report]'),
        'Access point replaced, PoE port tested. Network back up.',
      );
      [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save').click();
    })()`,
    after: 2000,
  },

  { name: 'requests-phone', user: 'user1', url: () => '/requests', size: PHONE },
  { name: 'request-phone', user: 'user1', url: (ids) => `/requests/${ids.request}`, size: PHONE },
  {
    name: 'showcase/request-new-phone',
    user: 'user1',
    url: async (ids, call) => {
      await postFeedback(call, 'user1');
      return '/requests/new';
    },
    size: PHONE,
  },
  { name: 'showcase/requests-all-phone', user: 'user1', url: () => '/requests/all', size: PHONE },
  {
    name: 'showcase/request-conversation-phone',
    user: 'user1',
    url: (ids) => `/requests/${ids.conversation}`,
    size: PHONE,
    action: `window.scrollTo(0, document.body.scrollHeight);
      for (const el of document.querySelectorAll('*')) el.scrollTop = el.scrollHeight;`,
  },

  {
    name: 'showcase/users',
    user: 'admin',
    url: (ids) => `/admin/users/${ids.technician}`,
    size: COMPUTER,
  },
  {
    name: 'showcase/place',
    user: 'admin',
    url: (ids) => `/admin/locations/${ids.site}`,
    size: COMPUTER,
  },
  {
    name: 'showcase/level-types',
    user: 'admin',
    url: () => '/admin/locations/types',
    size: COMPUTER,
  },
  {
    name: 'showcase/feedback-inbox',
    user: 'admin',
    url: () => '/admin/feedback',
    size: COMPUTER,
  },
  {
    name: 'showcase/planning-settings',
    user: 'admin',
    url: () => '/admin/planning',
    size: COMPUTER,
  },
  { name: 'showcase/widget-settings', user: 'admin', url: () => '/admin/widgets', size: COMPUTER },
];

/** Mock suggestions of the inbox picture, by user: message, page path, page title, width. */
const FEEDBACK = {
  technician1: [
    'A filter on the contractor would help in the work order list.',
    '/work-orders',
    'Work orders',
    402,
  ],
  supervisor1: [
    'The week scheduler could warn when two people book the same room.',
    '/schedule',
    'Week scheduler',
    1440,
  ],
  user1: ['Could I add a photo of the problem to my request?', '/requests/new', 'New request', 402],
};

/** Sends the user's mock suggestion, as the top bar button does. */
async function postFeedback(call, user) {
  const [message, page_path, page_title, viewport_width] = FEEDBACK[user];
  await call('POST', '/api/feedback', { message, page_path, page_title, viewport_width });
}

/** ISO week (2026-W45) `weeks` weeks from now. */
function isoWeek(weeks) {
  const day = new Date(Date.now() + weeks * 7 * 86400000);
  const date = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
const ONLINE = { ...OFFLINE, offline: false };

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
      // Showcase (docs/showcase.md).
      toReview: one(
        `SELECT id FROM work_orders WHERE review_status = 'PENDING' ORDER BY id LIMIT 1`,
      ),
      conversation: one(
        `SELECT w.id FROM work_orders w JOIN users u ON u.id = w.created_by
         WHERE u.username = 'user1' AND w.status = 'ON_HOLD'
         ORDER BY (SELECT count(*) FROM work_order_comments c WHERE c.work_order_id = w.id) DESC,
         w.id LIMIT 1`,
      ),
      asset: one(
        `SELECT asset_id FROM work_orders WHERE asset_id IS NOT NULL
         GROUP BY asset_id ORDER BY count(*) DESC, asset_id LIMIT 1`,
      ),
      conflictWorkOrder: one(
        `SELECT entity_id FROM conflicts WHERE status = 'OPEN' AND entity_type = 'work_orders'
         LIMIT 1`,
      ),
      plan: one(
        `SELECT plan_id FROM plan_occurrences WHERE status = 'PLANNED' ORDER BY week, id LIMIT 1`,
      ),
      occurrence: one(
        `SELECT id FROM plan_occurrences WHERE status = 'PLANNED' ORDER BY week, id LIMIT 1`,
      ),
      technicianWorkOrder: one(
        `SELECT id FROM work_orders WHERE status = 'IN_PROGRESS' AND has_conflict = 0
         AND asset_id IS NOT NULL
         AND assignee_id = (SELECT id FROM users WHERE username = 'technician1') ORDER BY id LIMIT 1`,
      ),
      technician: one(`SELECT id FROM users WHERE username = 'technician1'`),
      site: one(
        `SELECT site_id FROM locations GROUP BY site_id ORDER BY count(*) DESC, site_id LIMIT 1`,
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

  /** Calls the API as the logged-in user, from the page. */
  const call = (method, url, body) =>
    evaluate(`(async () => {
      const response = await fetch(${JSON.stringify(url)}, {
        method: ${JSON.stringify(method)},
        headers: {
          Authorization: 'Bearer ' + localStorage.getItem('tacto.token'),
          'Content-Type': 'application/json',
        },
        body: ${JSON.stringify(body ? JSON.stringify(body) : null)},
      });
      if (!response.ok) throw new Error(${JSON.stringify(`${method} ${url}`)} + ': ' + response.status);
      return response.json();
    })()`);

  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setLocaleOverride', { locale: 'en-GB' });
  fs.mkdirSync(OUT, { recursive: true });

  const only = process.argv[2];
  const shots = only ? SHOTS.filter((shot) => shot.name.startsWith(only)) : SHOTS;
  let currentUser;
  const seen = new Map();
  for (const shot of shots) {
    const { width, height, dpr, mobile } = shot.size;
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    if (shot.user === null) {
      // The login page: an empty session.
      await go('/login');
      await evaluate(`localStorage.clear()`);
      currentUser = null;
    } else if (shot.user !== currentUser) {
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
    // The language is read when the page loads: set it before opening the page.
    if (shot.language) await evaluate(`localStorage.setItem('tacto.language', '${shot.language}')`);
    // No `url`: the picture is taken on the page of the previous one.
    if (shot.url) await go(await shot.url(ids, call), shot.wait ?? 2500);
    if (shot.offline) {
      await send('Network.emulateNetworkConditions', OFFLINE);
      await sleep(1500);
    }
    if (shot.action) {
      await evaluate(shot.action);
      await sleep(shot.after ?? 1000);
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    if (shot.offline) await send('Network.emulateNetworkConditions', ONLINE);
    if (shot.language) await evaluate(`localStorage.removeItem('tacto.language')`);
    // Two identical pictures mean a page did not open (e.g. a redirect): stop.
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    if (seen.has(hash)) throw new Error(`${shot.name} is the same picture as ${seen.get(hash)}.`);
    seen.set(hash, shot.name);
    const file = path.join(OUT, `${shot.name}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
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
