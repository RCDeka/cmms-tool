// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Permission matrix check against a running server (docs/test-protocol.md → section 3,
// docs/api-design.md → Permission matrix): `npm run check:permissions`.
//
// Logs in as the demo accounts and calls every endpoint as each role. A role that must be
// refused has to get 403; an allowed role must get anything but 401, 403, 429 or 5xx. The
// writes send bodies the server refuses (400, 404, 409 or 422 for an allowed role), built so
// that even a broken permission check would not save anything. The only side effects are
// those of opening the screens: reading the planner and the scheduler releases the preventive
// work orders due (as the daily job does), and a supervisor or admin without dashboards gets
// "Overview". Four logins per run: the login limit (10 per 15 min per IP) allows two runs.
//
// Settings (environment, or the repository's .env):
//   CHECK_URL       server root (default http://127.0.0.1:3000)
//   CHECK_PASSWORD  password of the accounts (default SEED_PASSWORD)
//   CHECK_STAFF, CHECK_TECHNICIAN, CHECK_TECHNICIAN2, CHECK_SUPERVISOR, CHECK_ADMIN
//                   usernames (default user1, technician1, technician2, supervisor1, admin)
import { loadEnvFile } from '../src/config/index.js';

loadEnvFile();
const env = process.env;
const API = `${(env.CHECK_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')}/api`;
const PASSWORD = env.CHECK_PASSWORD ?? env.SEED_PASSWORD;
const USERNAMES = {
  ST: env.CHECK_STAFF ?? 'user1',
  TE: env.CHECK_TECHNICIAN ?? 'technician1',
  SU: env.CHECK_SUPERVISOR ?? 'supervisor1',
  AD: env.CHECK_ADMIN ?? 'admin',
};
const TECHNICIAN2 = env.CHECK_TECHNICIAN2 ?? 'technician2';
const ROLES = ['ST', 'TE', 'SU', 'AD'];

// Who may call an endpoint: A = allowed, D = denied (403).
const EVERYONE = { ST: 'A', TE: 'A', SU: 'A', AD: 'A' };
const STAFF = { ST: 'A', TE: 'D', SU: 'D', AD: 'D' };
const MAINT = { ST: 'D', TE: 'A', SU: 'A', AD: 'A' };
const SUP = { ST: 'D', TE: 'D', SU: 'A', AD: 'A' };
const ADMIN = { ST: 'D', TE: 'D', SU: 'D', AD: 'A' };

/** Sends one request; never throws for an HTTP status. */
async function call(method, path, { token, body, rawBody } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (e.g. an HTML error page from a proxy): kept as text.
  }
  return { status: res.status, text, json };
}

const results = [];
const tokens = {};
let leak = false;

/** Records one check. `expect`: 'A' (allowed), 'D' (403) or an exact status. */
function record(id, who, method, path, expect, res, extra) {
  let ok;
  if (expect === 'A') ok = ![401, 403, 429].includes(res.status) && res.status < 500;
  else if (expect === 'D') ok = res.status === 403;
  else ok = res.status === expect;
  let note = '';
  if (ok && extra) {
    note = extra(res) ?? '';
    ok = !note;
  }
  if (!ok && !note) note = res.json?.message ?? res.text.slice(0, 120);
  if (res.text.includes('password_hash')) {
    leak = true;
    ok = false;
    note = 'password_hash in the response';
  }
  const wanted = expect === 'A' ? 'allowed' : expect === 'D' ? '403' : String(expect);
  results.push({ id, who, method, path, wanted, got: res.status, ok, note });
}

/** One request as each role, against an access map such as MAINT. */
async function matrix(id, method, path, access, body) {
  for (const role of ROLES) {
    const res = await call(method, path, { token: tokens[role], body });
    record(id, role, method, path, access[role], res);
  }
}

/** One request as one role (or without a token: who = '-'). */
async function single(id, who, method, path, expect, { body, rawBody, extra } = {}) {
  const res = await call(method, path, { token: tokens[who], body, rawBody });
  record(id, who, method, path, expect, res, extra);
  return res;
}

function skip(id, reason) {
  results.push({
    id,
    who: '',
    method: '',
    path: '',
    wanted: '',
    got: 'SKIP',
    ok: true,
    note: reason,
  });
}

async function login(username) {
  const res = await call('POST', '/auth/login', { body: { username, password: PASSWORD } });
  if (res.status !== 200) {
    throw new Error(
      `Login of ${username} failed (${res.status}): ${res.json?.message ?? res.text}`,
    );
  }
  return res.json.token;
}

/** Ids of records the checks need, read as the administrator. */
async function discover() {
  const get = async (path, who = 'AD') => {
    const res = await call('GET', path, { token: tokens[who] });
    if (res.status !== 200) throw new Error(`Discovery: GET ${path} answered ${res.status}`);
    return res.json;
  };
  const ids = {};
  for (const role of ROLES) ids[role] = (await get('/auth/me', role)).id;
  const te2 = (await get(`/admin/users?q=${encodeURIComponent(TECHNICIAN2)}`)).items.find(
    (u) => u.username === TECHNICIAN2,
  );
  if (!te2) throw new Error(`Discovery: no user ${TECHNICIAN2}`);
  ids.TE2 = te2.id;

  ids.asset = (await get('/assets?size=1')).items[0]?.id;
  ids.ownWorkOrder = (
    await get(`/work-orders?assignee_id=${ids.TE}&status=OPEN,IN_PROGRESS,ON_HOLD&size=1`)
  ).items[0];
  ids.otherOpenWorkOrder = (
    await get(`/work-orders?assignee_id=${ids.TE2}&status=OPEN&size=1`)
  ).items[0];
  ids.request = (await get('/requests?scope=all&size=1', 'ST')).items[0]?.id;
  ids.plan = (await get('/plans?size=1&active=true')).items[0]?.id;
  if (ids.plan) ids.occurrence = (await get(`/plans/${ids.plan}`)).occurrences[0]?.id;
  ids.dashboardOfSupervisor = (await get('/dashboards', 'SU')).items[0]?.id;

  const schedule = await get('/schedule');
  ids.week = schedule.week;
  const freeWorkBlock = (personId) =>
    schedule.people
      .find((p) => p.id === personId)
      ?.blocks.find((b) => b.kind === 'WORK' && b.locked_start === null);
  ids.ownBlock = freeWorkBlock(ids.TE);
  ids.otherBlock = freeWorkBlock(ids.TE2);
  return ids;
}

async function main() {
  if (!PASSWORD) throw new Error('Set CHECK_PASSWORD (or SEED_PASSWORD) to the accounts password.');
  const health = await call('GET', '/health');
  record('API-01', '-', 'GET', '/health', 200, health);

  for (const role of ROLES) tokens[role] = await login(USERNAMES[role]);
  tokens.BAD = `${tokens.TE.slice(0, -4)}xxxx`;
  const ids = await discover();
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  // Without a token, or with a forged one: 401, even on a path that does not exist.
  for (const path of ['/assets', '/work-orders', '/dashboard', '/nothing-here']) {
    await single('API-02', '-', 'GET', path, 401);
  }
  await single('API-02', 'BAD', 'GET', '/auth/me', 401);

  // Reading the maintenance data.
  const a = ids.asset;
  for (const path of [
    '/assets?size=1',
    `/assets/${a}`,
    '/assets/search?limit=1',
    `/assets/${a}/history`,
  ]) {
    await matrix('API-03', 'GET', path, MAINT);
  }
  const wo = ids.ownWorkOrder?.id ?? ids.otherOpenWorkOrder?.id;
  for (const path of [
    '/work-orders?size=1',
    `/work-orders/${wo}`,
    '/work-orders/stats',
    `/work-orders/${wo}/history`,
    `/work-orders/${wo}/comments`,
  ]) {
    await matrix('API-04', 'GET', path, MAINT);
  }
  await matrix('API-05', 'GET', '/dashboard', MAINT);
  await matrix('API-06', 'GET', '/dashboards', SUP);
  await matrix('API-06', 'GET', '/dashboard/widgets?keys=open_work_orders', SUP);
  await matrix('API-07', 'GET', '/dashboards/widgets', ADMIN);
  await matrix('API-07', 'PUT', '/dashboards/widgets/by_status', ADMIN, {});
  await matrix('API-08', 'GET', '/reference-data', EVERYONE);
  await matrix('API-09', 'GET', '/requests?size=1', STAFF);
  await matrix('API-09', 'POST', '/requests', STAFF, {});
  await matrix('API-10', 'GET', '/users', SUP);
  await matrix('API-11', 'GET', '/audit-log?size=1', SUP);
  await single('API-11', 'SU', 'GET', '/audit-log?size=100', 200, {
    extra: (res) =>
      res.json.items.some((e) => e.entity_type === 'users')
        ? 'a supervisor sees user account entries'
        : '',
  });
  await matrix('API-12', 'GET', '/audit-log?entity_type=users', ADMIN);
  await matrix('API-13', 'GET', '/conflicts', SUP);
  await matrix('API-13', 'GET', '/conflicts/999999999', SUP);
  await matrix('API-13', 'PUT', `/assets/${a}/resolve-conflict`, SUP, {});

  // Writes, with bodies the server refuses.
  await matrix('API-14', 'POST', '/assets', SUP, {});
  await matrix('API-14', 'DELETE', `/assets/${a}`, SUP);
  // A technician may not assign someone else (403); for the others, an edit date older than
  // 30 days is refused (422), so nothing is created either way.
  await matrix('API-15', 'POST', '/work-orders', SUP, {
    client_id: crypto.randomUUID(),
    title: 'Permission check (never saved)',
    type: 'CORRECTIVE',
    asset_id: a,
    assignee_id: ids.SU,
    edited_at: daysAgo(40),
  });
  await matrix('API-16', 'PUT', `/work-orders/${wo}/review`, SUP, {});
  await matrix('API-17', 'GET', '/admin/users', ADMIN);
  await matrix('API-17', 'POST', '/admin/users', ADMIN, {});
  await matrix('API-17', 'PUT', `/admin/users/${ids.TE2}`, ADMIN, {});
  await matrix('API-17', 'POST', `/admin/users/${ids.TE2}/password`, ADMIN, {});
  await matrix('API-18', 'GET', '/feedback', ADMIN);
  await matrix('API-18', 'PUT', '/feedback/999999999', ADMIN, {});
  await matrix('API-19', 'POST', '/feedback', EVERYONE, {});
  await matrix('API-20', 'POST', '/auth/change-password', EVERYONE, {});

  // Preventive maintenance.
  for (const path of [
    '/plans?size=1',
    '/planning/timeline?weeks=1',
    '/planning/settings',
    '/planning/blocked-weeks',
  ]) {
    await matrix('API-21', 'GET', path, MAINT);
  }
  if (ids.occurrence) await matrix('API-21', 'GET', `/plan-occurrences/${ids.occurrence}`, MAINT);
  else skip('API-21', 'no plan visit found: /plan-occurrences/:id not checked');
  await matrix('API-22', 'POST', '/plans', SUP, {});
  if (ids.plan) {
    await matrix('API-22', 'PUT', `/plans/${ids.plan}`, SUP, {});
    await matrix('API-22', 'PUT', `/plans/${ids.plan}/anchor`, SUP, {});
  } else skip('API-22', 'no active plan found: plan edits not checked');
  await matrix('API-22', 'POST', '/planning/release', SUP);
  await matrix('API-22', 'POST', '/planning/suggestions', SUP, { not_a_field: true });
  if (ids.occurrence) {
    for (const [method, suffix] of [
      ['PUT', ''],
      ['POST', '/skip'],
      ['POST', '/restore'],
    ]) {
      await matrix('API-22', method, `/plan-occurrences/${ids.occurrence}${suffix}`, SUP, {});
    }
  }
  await matrix('API-22', 'POST', '/planning/blocked-weeks', SUP, {});
  await matrix('API-22', 'DELETE', '/planning/blocked-weeks/999999999', SUP);
  await matrix('API-23', 'PUT', '/planning/settings', ADMIN, {});

  // Week scheduler.
  for (const path of ['/schedule', `/schedule/work-orders/${wo}`, '/my-week']) {
    await matrix('API-24', 'GET', path, MAINT);
  }
  const block = ids.ownBlock ?? ids.otherBlock;
  await matrix('API-25', 'POST', '/schedule/allocations', SUP, {});
  if (block) {
    await matrix('API-25', 'PUT', `/schedule/allocations/${block.id}`, SUP, {});
    await matrix('API-25', 'DELETE', `/schedule/allocations/${block.id}`, SUP);
  }
  await matrix('API-25', 'PUT', '/schedule/capacity', SUP, {});
  await matrix('API-25', 'PUT', `/schedule/weeks/${ids.week}`, SUP, {});
  // Locks: "unlocking" a block that has no appointment changes nothing.
  const unlock = (b) => ({ locked_start: null, version: b.version });
  if (ids.ownBlock && ids.otherBlock) {
    const own = `/schedule/allocations/${ids.ownBlock.id}/lock`;
    const other = `/schedule/allocations/${ids.otherBlock.id}/lock`;
    await single('API-26', 'ST', 'PUT', own, 'D', { body: unlock(ids.ownBlock) });
    await single('API-26', 'TE', 'PUT', own, 'A', { body: unlock(ids.ownBlock) });
    await single('API-26', 'TE', 'PUT', other, 'D', { body: unlock(ids.otherBlock) });
    await single('API-26', 'SU', 'PUT', other, 'A', { body: unlock(ids.otherBlock) });
    await single('API-26', 'AD', 'PUT', other, 'A', { body: unlock(ids.otherBlock) });
    // Day order with an empty list: refused as not the day's blocks (409) when allowed.
    const day = (b, person) => ({ technician_id: person, day: b.day, ids: [] });
    await single('API-27', 'ST', 'PUT', '/schedule/day-order', 'D', {
      body: day(ids.ownBlock, ids.TE),
    });
    await single('API-27', 'TE', 'PUT', '/schedule/day-order', 'A', {
      body: day(ids.ownBlock, ids.TE),
    });
    await single('API-27', 'TE', 'PUT', '/schedule/day-order', 'D', {
      body: day(ids.otherBlock, ids.TE2),
    });
    await single('API-27', 'SU', 'PUT', '/schedule/day-order', 'A', {
      body: day(ids.otherBlock, ids.TE2),
    });
    await single('API-27', 'AD', 'PUT', '/schedule/day-order', 'A', {
      body: day(ids.otherBlock, ids.TE2),
    });
  } else {
    skip(
      'API-26/27',
      'each technician needs an unlocked work block this week (demo data has them)',
    );
  }
  await matrix('API-28', 'POST', '/assistant/find-work-order', MAINT, {});

  // Staff are refused every maintenance path, whatever the method.
  for (const prefix of [
    '/assets',
    '/work-orders',
    '/conflicts',
    '/dashboard',
    '/dashboards',
    '/audit-log',
    '/plans',
    '/plan-occurrences/1',
    '/planning/timeline',
    '/schedule',
    '/my-week',
    '/assistant/find-work-order',
  ]) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      await single('API-29', 'ST', method, prefix, 'D', {
        body: method === 'GET' ? undefined : {},
      });
    }
  }

  // Fields and records.
  await single('API-30', 'TE', 'PUT', `/assets/${a}`, 'D', {
    body: { name: 'x' },
    extra: (res) =>
      res.json?.details?.fields?.includes?.('name') ? '' : 'details.fields lacks name',
  });
  await single('API-30', 'TE', 'PUT', `/assets/${a}`, 'A', { body: { comment: 'x' } });
  if (ids.otherOpenWorkOrder) {
    // Open → On hold is never allowed (422), so a broken check would still save nothing.
    await single('API-31', 'TE', 'PUT', `/work-orders/${ids.otherOpenWorkOrder.id}`, 'D', {
      body: { status: 'ON_HOLD', version: ids.otherOpenWorkOrder.version },
    });
  } else skip('API-31', `no open work order assigned to ${TECHNICIAN2}`);
  if (ids.ownWorkOrder) {
    const own = `/work-orders/${ids.ownWorkOrder.id}`;
    for (const field of [
      { priority: 'LOW' },
      { assignee_id: ids.SU },
      { due_on: '2030-01-01' },
      { planned_week: '2030-W01' },
    ]) {
      await single('API-32', 'TE', 'PUT', own, 'D', { body: field });
    }
    await single('API-32', 'TE', 'PUT', own, 'A', { body: { work_report: 'x' } });
  } else skip('API-32', `no unfinished work order assigned to ${USERNAMES.TE}`);
  for (const body of [
    { code: 'X-1', version: 1 },
    { has_conflict: false, version: 1 },
  ]) {
    await single('API-33', 'SU', 'PUT', `/assets/${a}`, 'D', { body });
  }
  for (const body of [
    { number: 'X', version: 1 },
    { review_status: 'APPROVED', version: 1 },
    { plan_id: 1, version: 1 },
  ]) {
    await single('API-33', 'SU', 'PUT', `/work-orders/${wo}`, 'D', { body });
  }
  if (ids.request) await single('API-34', 'ST', 'GET', `/requests/${ids.request}`, 200);
  await single('API-34', 'ST', 'GET', `/requests/${wo}`, 404);
  await single('API-35', 'ST', 'POST', '/requests', 400, {
    body: {
      client_id: crypto.randomUUID(),
      title: 'x',
      site: 'x',
      location: 'x',
      type: 'CORRECTIVE',
    },
  });
  if (ids.dashboardOfSupervisor) {
    // A stale version: even a broken ownership check would answer 409 and change nothing.
    const path = `/dashboards/${ids.dashboardOfSupervisor}`;
    await single('API-36', 'AD', 'GET', path, 404);
    await single('API-36', 'AD', 'PUT', path, 404, { body: { version: 999999, name: 'x' } });
    await single('API-36', 'AD', 'DELETE', `${path}?version=999999`, 404);
  }

  // Input validation (sample).
  for (const path of [
    '/assets?pagesize=10',
    '/assets?sort=password_hash',
    '/assets?sort=name%3BDROP%20TABLE%20assets',
    '/assets?order=sideways',
    '/assets/abc',
    '/assets/1.5',
    '/assets?size=101',
    '/assets?page=0',
    `/assets?q=${'a'.repeat(101)}`,
    '/schedule?week=2027-W53',
  ]) {
    await single('API-40', 'AD', 'GET', path, 400);
  }
  await single('API-46', 'AD', 'POST', '/feedback', 413, {
    rawBody: JSON.stringify({ message: 'x'.repeat(110 * 1024) }),
  });
  await single('API-47', 'AD', 'POST', '/feedback', 400, { rawBody: '{"message": ' });
}

function report() {
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.got === 'SKIP');
  const width = Math.max(...results.map((r) => `${r.method} ${r.path}`.length));
  for (const r of results) {
    const mark = r.got === 'SKIP' ? 'SKIP' : r.ok ? 'ok  ' : 'FAIL';
    if (r.got === 'SKIP') {
      console.log(`${mark} ${r.id.padEnd(9)} ${r.note}`);
      continue;
    }
    const line = `${mark} ${r.id.padEnd(9)} ${r.who.padEnd(4)} ${`${r.method} ${r.path}`.padEnd(width)}  want ${r.wanted.padEnd(7)} got ${r.got}`;
    console.log(r.ok ? line : `${line}  ${r.note}`);
  }
  console.log(
    `\n${results.length - skipped.length} checks against ${API}: ${failed.length} failed, ${skipped.length} skipped.` +
      (leak ? ' password_hash appeared in a response.' : ''),
  );
  return failed.length ? 1 : 0;
}

main()
  .then(() => process.exit(report()))
  .catch((err) => {
    if (results.length) report();
    console.error(`\n${err.message}`);
    process.exit(2);
  });
