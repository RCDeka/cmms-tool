// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Service levels (D86, D88, docs/data-model.md → BR-SLA1 to BR-SLA5): GET and PUT /api/sla,
// the holidays, the deadlines on the work orders and the `sla` list filter. The clock is
// NOW = Sunday 4 October 2026, 12:00 UTC; Paris is UTC+2.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSeededApp, expectNoSecrets } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const send = (method, username, url, body) =>
  request(ctx.app)
    [method](url)
    .set('Authorization', `Bearer ${ctx.tokenFor(username)}`)
    .send(body);
const row = (id) => ctx.db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
const slaVersion = () =>
  ctx.db.prepare('SELECT version FROM sla_settings WHERE id = 1').pluck().get();
const putSla = (body, username = 'admin') =>
  send('put', username, '/api/sla', { version: slaVersion(), ...body });

const CALENDAR = { hours_mode: 'CALENDAR', response_stop: 'START' };
const BUSINESS = {
  hours_mode: 'BUSINESS',
  response_stop: 'START',
  business_days: [1, 2, 3, 4, 5],
  business_start: '08:00',
  business_end: '18:00',
};

/** A corrective work order reported at `reportedAt`, unassigned. */
async function workOrder(reportedAt, extra = {}) {
  const res = await send('post', 'supervisor1', '/api/work-orders', {
    client_id: randomUUID(),
    title: `SLA test ${randomUUID().slice(0, 8)}`,
    type: 'CORRECTIVE',
    priority: 'NORMAL',
    asset_id: 20,
    edited_at: reportedAt,
    ...extra,
  }).expect(201);
  return res.body.item;
}
const update = (id, body, username = 'supervisor1') =>
  send('put', username, `/api/work-orders/${id}`, { version: row(id).version, ...body }).expect(
    200,
  );
const get = async (id) =>
  (await ctx.getAs('technician1', `/api/work-orders/${id}`).expect(200)).body;
/** Ids of the work orders the filter returns, among `ids`. */
async function filtered(flag, ids) {
  const res = await ctx
    .getAs('supervisor1', `/api/work-orders?sla=${flag}&q=SLA%20test&size=100`)
    .expect(200);
  return res.body.items.map((w) => w.id).filter((id) => ids.includes(id));
}

describe('GET /api/sla', () => {
  it('returns the targets, settings and holidays to the maintenance roles', async () => {
    const res = await ctx.getAs('technician1', '/api/sla').expect(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'business_days',
      'business_end',
      'business_start',
      'holidays',
      'hours_mode',
      'measured_from',
      'response_stop',
      'targets',
      'updated_at',
      'updated_by',
      'version',
    ]);
    expect(res.body.targets).toEqual([
      { priority: 'URGENT', response_hours: 1, resolution_hours: 4 },
      { priority: 'HIGH', response_hours: 4, resolution_hours: 24 },
      { priority: 'NORMAL', response_hours: 24, resolution_hours: 72 },
      { priority: 'LOW', response_hours: 72, resolution_hours: 240 },
    ]);
    expect(res.body).toMatchObject({
      response_stop: 'START',
      hours_mode: 'CALENDAR',
      business_days: [1, 2, 3, 4, 5],
      measured_from: '2026-09-13T00:00:00.000Z',
    });
    expect(res.body.holidays).toHaveLength(2);
    await ctx.getAs('supervisor1', '/api/sla').expect(200);
    expectNoSecrets(res.body);
  });

  it('is closed to staff members (403) and to anonymous calls (401)', async () => {
    await ctx.getAs('user1', '/api/sla').expect(403);
    await request(ctx.app).get('/api/sla').expect(401);
  });
});

describe('PUT /api/sla', () => {
  beforeEach(async () => {
    await putSla(CALENDAR).expect(200);
  });

  it('saves targets and settings under one version, logged', async () => {
    const before = slaVersion();
    const res = await putSla({
      targets: [{ priority: 'LOW', response_hours: 48, resolution_hours: 200 }],
      business_days: [5, 1, 2],
    }).expect(200);
    expect(res.body.version).toBe(before + 1);
    expect(res.body.business_days).toEqual([1, 2, 5]);
    expect(res.body.targets.at(-1)).toEqual({
      priority: 'LOW',
      response_hours: 48,
      resolution_hours: 200,
    });
    expect(res.body.updated_by.id).toBe(1);
    const entry = ctx.db
      .prepare("SELECT * FROM audit_log WHERE entity_type = 'sla_settings' ORDER BY id DESC")
      .get();
    expect(JSON.parse(entry.changes)).toEqual({
      business_days: { from: '1,2,3,4,5', to: '1,2,5' },
      'LOW.response_hours': { from: 72, to: 48 },
      'LOW.resolution_hours': { from: 240, to: 200 },
    });
    await putSla({
      targets: [{ priority: 'LOW', response_hours: 72, resolution_hours: 240 }],
      business_days: [1, 2, 3, 4, 5],
    }).expect(200);
  });

  it('refuses a stale version (409)', async () => {
    const res = await send('put', 'admin', '/api/sla', {
      version: slaVersion() - 1,
      hours_mode: 'BUSINESS',
    }).expect(409);
    expect(res.body.details.rule).toBe('BR-V1');
  });

  it('refuses invalid values (400)', async () => {
    for (const body of [
      { targets: [{ priority: 'HIGH', response_hours: 10, resolution_hours: 5 }] },
      { targets: [{ priority: 'HIGH', response_hours: 0, resolution_hours: 5 }] },
      { business_start: '18:00', business_end: '08:00' },
      { business_start: '19:00' },
      { business_days: [] },
      { measured_from: '2020-01-01T00:00:00.000Z' },
      { hours_mode: 'NIGHT' },
    ]) {
      await putSla(body).expect(400);
    }
    await send('put', 'admin', '/api/sla', { hours_mode: 'BUSINESS' }).expect(400);
  });

  it('is for admins only (403); a supervisor reads but cannot edit', async () => {
    await putSla({ hours_mode: 'BUSINESS' }, 'technician1').expect(403);
    await putSla({ hours_mode: 'BUSINESS' }, 'supervisor1').expect(403);
    await send('post', 'supervisor1', '/api/sla/holidays', { day: '2026-12-25', name: 'X' }).expect(
      403,
    );
    await send('delete', 'technician1', '/api/sla/holidays/1').expect(403);
  });
});

describe('holidays', () => {
  it('adds and removes a day without business hours', async () => {
    const res = await send('post', 'admin', '/api/sla/holidays', {
      day: '2026-12-25',
      name: 'Christmas Day',
    }).expect(201);
    const added = res.body.holidays.find((h) => h.day === '2026-12-25');
    expect(added).toMatchObject({ name: 'Christmas Day' });
    await send('post', 'admin', '/api/sla/holidays', { day: '2026-12-25', name: 'Again' }).expect(
      409,
    );
    await send('post', 'admin', '/api/sla/holidays', { day: '25/12/2026', name: 'X' }).expect(400);
    await send('post', 'admin', '/api/sla/holidays', { day: '2026-12-26', name: ' ' }).expect(400);
    const removed = await send('delete', 'admin', `/api/sla/holidays/${added.id}`).expect(200);
    expect(removed.body.holidays.some((h) => h.day === '2026-12-25')).toBe(false);
    await send('delete', 'admin', `/api/sla/holidays/${added.id}`).expect(404);
  });
});

describe('deadlines on the work order (BR-SLA1 to BR-SLA5)', () => {
  beforeEach(async () => {
    await putSla(CALENDAR).expect(200);
  });

  it('gives a new corrective work order its deadlines, shown to a technician', async () => {
    const wo = await workOrder('2026-10-04T08:00:00.000Z');
    expect((await get(wo.id)).sla).toEqual({
      response: {
        due_at: '2026-10-05T08:00:00.000Z',
        risk_at: '2026-10-05T02:00:00.000Z',
        at: null,
        met: null,
      },
      resolution: {
        due_at: '2026-10-07T08:00:00.000Z',
        risk_at: '2026-10-06T14:00:00.000Z',
        at: null,
        met: null,
      },
      paused: false,
      paused_at: null,
    });
  });

  it('tightens the deadline at once when the priority is raised', async () => {
    const wo = await workOrder('2026-10-04T08:00:00.000Z');
    await update(wo.id, { priority: 'URGENT' });
    expect((await get(wo.id)).sla.resolution.due_at).toBe('2026-10-04T12:00:00.000Z');
  });

  it('brings a work order into or out of the SLA with its type', async () => {
    const wo = await workOrder('2026-10-04T08:00:00.000Z');
    await update(wo.id, { type: 'IMPROVEMENT' });
    expect((await get(wo.id)).sla).toBeNull();
    await update(wo.id, { type: 'CORRECTIVE' });
    expect((await get(wo.id)).sla.response.due_at).toBe('2026-10-05T08:00:00.000Z');
  });

  it('pauses on a hold waiting for access, not for parts', async () => {
    const parts = await workOrder('2026-10-04T08:00:00.000Z');
    await update(parts.id, {
      status: 'ON_HOLD',
      hold_reason: 'WAITING_PARTS',
      edited_at: '2026-10-04T09:00:00.000Z',
    });
    expect((await get(parts.id)).sla.paused).toBe(false);

    const access = await workOrder('2026-10-04T08:00:00.000Z');
    await update(access.id, {
      status: 'ON_HOLD',
      hold_reason: 'WAITING_ACCESS',
      edited_at: '2026-10-04T09:00:00.000Z',
    });
    const paused = (await get(access.id)).sla;
    expect(paused).toMatchObject({ paused: true, paused_at: '2026-10-04T09:00:00.000Z' });
    // Resumed at 11:00: two hours on hold move both deadlines.
    await update(access.id, { status: 'OPEN', edited_at: '2026-10-04T11:00:00.000Z' });
    const resumed = (await get(access.id)).sla;
    expect(resumed.paused).toBe(false);
    expect(resumed.response.due_at).toBe('2026-10-05T10:00:00.000Z');
    expect(resumed.resolution.due_at).toBe('2026-10-07T10:00:00.000Z');
  });

  it('records whether the response and the resolution were met', async () => {
    const wo = await workOrder('2026-10-04T08:00:00.000Z', {
      priority: 'URGENT',
      assignee_id: 4,
    });
    await update(wo.id, { status: 'IN_PROGRESS', edited_at: '2026-10-04T08:30:00.000Z' });
    await update(wo.id, {
      status: 'COMPLETED',
      work_report: 'Fixed.',
      edited_at: '2026-10-04T12:30:00.000Z',
    });
    const { sla } = await get(wo.id);
    expect(sla.response).toMatchObject({ at: '2026-10-04T08:30:00.000Z', met: true });
    expect(sla.resolution).toMatchObject({ at: '2026-10-04T12:30:00.000Z', met: false });
  });

  it('leaves work reported before the SLA existed without one', async () => {
    const old = ctx.db
      .prepare(
        "SELECT id FROM work_orders WHERE type = 'CORRECTIVE' AND reported_at < '2026-09-13' LIMIT 1",
      )
      .get();
    expect((await get(old.id)).sla).toBeNull();
    await update(old.id, { priority: 'URGENT' });
    expect((await get(old.id)).sla).toBeNull();
    const counted = await ctx
      .getAs('supervisor1', '/api/dashboard/widgets/sla_compliance/rows?period=365')
      .expect(200);
    expect(counted.body.items.length).toBeGreaterThan(0);
    expect(counted.body.items.some((w) => w.id === old.id)).toBe(false);
  });
});

describe('recomputing on a settings change (BR-SLA4)', () => {
  beforeEach(async () => {
    await putSla(CALENDAR).expect(200);
  });

  it('moves the unfinished work orders only, in business hours and around a holiday', async () => {
    // Friday 2 October, 16:00 Paris.
    const open = await workOrder('2026-10-02T14:00:00.000Z');
    const done = await workOrder('2026-10-02T14:00:00.000Z', { assignee_id: 4 });
    await update(done.id, { status: 'IN_PROGRESS', edited_at: '2026-10-02T15:00:00.000Z' });
    await update(done.id, {
      status: 'COMPLETED',
      work_report: 'Fixed.',
      edited_at: '2026-10-03T09:00:00.000Z',
    });
    expect(row(open.id).response_due_at).toBe('2026-10-03T14:00:00.000Z');
    const doneBefore = row(done.id);

    await putSla(BUSINESS).expect(200);
    // 24 business hours: 2 h on Friday, 10 h Monday and Tuesday, 2 h on Wednesday 7 October.
    expect(row(open.id).response_due_at).toBe('2026-10-07T08:00:00.000Z');
    expect(row(done.id).resolution_due_at).toBe(doneBefore.resolution_due_at);

    const holiday = await send('post', 'admin', '/api/sla/holidays', {
      day: '2026-10-05',
      name: 'Test holiday',
    }).expect(201);
    expect(row(open.id).response_due_at).toBe('2026-10-08T08:00:00.000Z');
    const id = holiday.body.holidays.find((h) => h.day === '2026-10-05').id;
    await send('delete', 'admin', `/api/sla/holidays/${id}`).expect(200);
    expect(row(open.id).response_due_at).toBe('2026-10-07T08:00:00.000Z');

    // A target: 12 business hours, 2 h on Friday and 10 h on Monday → Monday 18:00 Paris.
    await putSla({
      targets: [{ priority: 'NORMAL', response_hours: 12, resolution_hours: 72 }],
    }).expect(200);
    expect(row(open.id).response_due_at).toBe('2026-10-05T16:00:00.000Z');
    expect(row(done.id).resolution_due_at).toBe(doneBefore.resolution_due_at);
    await putSla({
      targets: [{ priority: 'NORMAL', response_hours: 24, resolution_hours: 72 }],
    }).expect(200);

    await putSla({ response_stop: 'ASSIGNMENT' }).expect(200);
    await update(open.id, { assignee_id: 4, edited_at: '2026-10-02T15:00:00.000Z' });
    expect((await get(open.id)).sla.response).toMatchObject({
      at: '2026-10-02T15:00:00.000Z',
      met: true,
    });
  });
});

describe('the sla filter (BR-SLA4)', () => {
  beforeEach(async () => {
    await putSla(BUSINESS).expect(200);
  });

  it('matches hand-computed cases in business hours', async () => {
    // Friday 08:00 Paris, urgent: response due at 09:00 Paris, not started → late.
    const late = await workOrder('2026-10-02T06:00:00.000Z', { priority: 'URGENT' });
    // Friday 15:00 Paris, high (4 h): 3 h used at the Friday closing → at risk, due on
    // Monday 09:00 Paris, so not late on Sunday.
    const atRisk = await workOrder('2026-10-02T13:00:00.000Z', { priority: 'HIGH' });
    // Friday 17:00 Paris, normal: 1 h of 24 used → neither.
    const fine = await workOrder('2026-10-02T15:00:00.000Z');
    const ids = [late.id, atRisk.id, fine.id];
    expect(row(atRisk.id)).toMatchObject({
      response_risk_at: '2026-10-02T16:00:00.000Z',
      response_due_at: '2026-10-05T07:00:00.000Z',
    });
    expect(await filtered('late', ids)).toEqual([late.id]);
    expect(await filtered('at_risk', ids)).toEqual([atRisk.id]);

    // In calendar hours all three are past their response target on Sunday.
    await putSla(CALENDAR).expect(200);
    expect((await filtered('late', ids)).sort()).toEqual([...ids].sort());
  });

  it('keeps a work order paused after missing its deadline late, not one paused in time', async () => {
    await putSla(CALENDAR).expect(200);
    // Urgent, reported at 08:00 UTC: response due at 09:00, paused at 10:00 → late.
    const missed = await workOrder('2026-10-04T08:00:00.000Z', { priority: 'URGENT' });
    await update(missed.id, {
      status: 'ON_HOLD',
      hold_reason: 'WAITING_APPROVAL',
      edited_at: '2026-10-04T10:00:00.000Z',
    });
    // Reported at 11:30 UTC, paused at 11:45: neither late nor at risk while paused.
    const inTime = await workOrder('2026-10-04T11:30:00.000Z', { priority: 'URGENT' });
    await update(inTime.id, {
      status: 'ON_HOLD',
      hold_reason: 'WAITING_ACCESS',
      edited_at: '2026-10-04T11:45:00.000Z',
    });
    const ids = [missed.id, inTime.id];
    expect(await filtered('late', ids)).toEqual([missed.id]);
    expect(await filtered('at_risk', ids)).toEqual([]);
  });

  it('refuses an unknown value (400)', async () => {
    await ctx.getAs('supervisor1', '/api/work-orders?sla=soon').expect(400);
  });
});
