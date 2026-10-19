// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Work order process (D86, D87, docs/data-model.md → BR-W4 to BR-W18): technical end apart
// from the administrative closing, holds with a reason, the report waiver, reopening and the
// admin override.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TODAY, createSeededApp } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const USERS = { admin: 1, supervisor1: 2, technician1: 4, technician2: 5 };
const send = (method, username, url, body) =>
  request(ctx.app)
    [method](url)
    .set('Authorization', `Bearer ${ctx.tokenFor(username)}`)
    .send(body);
const row = (id) => ctx.db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
const auditOf = (id) =>
  ctx.db
    .prepare(
      "SELECT * FROM audit_log WHERE entity_type = 'work_orders' AND entity_id = ? ORDER BY id",
    )
    .all(id);

/** A new corrective work order of technician1, in the given status, made through the API. */
async function workOrder(status = 'OPEN', extra = {}) {
  const created = await send('post', 'supervisor1', '/api/work-orders', {
    client_id: randomUUID(),
    title: 'Process test',
    type: 'CORRECTIVE',
    asset_id: 20,
    assignee_id: USERS.technician1,
    edited_at: '2026-10-04T07:00:00.000Z',
    ...extra,
  }).expect(201);
  const id = created.body.item.id;
  const steps = {
    OPEN: [],
    IN_PROGRESS: [{ status: 'IN_PROGRESS' }],
    ON_HOLD: [{ status: 'ON_HOLD', hold_reason: 'WAITING_PARTS' }],
    COMPLETED: [{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', work_report: 'Fixed.' }],
    CLOSED: [
      { status: 'IN_PROGRESS' },
      { status: 'COMPLETED', work_report: 'Fixed.' },
      { status: 'CLOSED' },
    ],
    CANCELLED: [{ status: 'CANCELLED' }],
  }[status];
  for (const step of steps) await update('supervisor1', id, step).expect(200);
  return row(id);
}

/** PUT at the stored version. */
const update = (username, id, body) =>
  send('put', username, `/api/work-orders/${id}`, { version: row(id).version, ...body });

describe('status transitions (BR-W4, BR-W16)', () => {
  const allowed = [
    ['OPEN', 'IN_PROGRESS'],
    ['OPEN', 'ON_HOLD'],
    ['OPEN', 'CANCELLED'],
    ['IN_PROGRESS', 'ON_HOLD'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['IN_PROGRESS', 'CANCELLED'],
    ['ON_HOLD', 'OPEN'],
    ['ON_HOLD', 'IN_PROGRESS'],
    ['ON_HOLD', 'CANCELLED'],
    ['COMPLETED', 'CLOSED'],
    ['COMPLETED', 'IN_PROGRESS'],
  ];
  const body = (to) => ({
    status: to,
    ...(to === 'ON_HOLD' && { hold_reason: 'OTHER' }),
    ...(to === 'COMPLETED' && { work_report: 'Done.' }),
  });

  it.each(allowed)('accepts %s → %s for a supervisor', async (from, to) => {
    // Back to OPEN only from a hold before the start.
    const wo = await workOrder(from);
    const res = await update('supervisor1', wo.id, body(to)).expect(200);
    expect(res.body.item.status).toBe(to);
  });

  const refused = [
    ['OPEN', 'COMPLETED'],
    ['OPEN', 'CLOSED'],
    ['IN_PROGRESS', 'OPEN'],
    ['IN_PROGRESS', 'CLOSED'],
    ['ON_HOLD', 'COMPLETED'],
    ['COMPLETED', 'OPEN'],
    ['COMPLETED', 'CANCELLED'],
    ['CLOSED', 'COMPLETED'],
    ['CANCELLED', 'OPEN'],
  ];
  it.each(refused)('refuses %s → %s with 422, for a supervisor', async (from, to) => {
    const wo = await workOrder(from);
    const res = await update('supervisor1', wo.id, body(to)).expect(422);
    expect(['BR-W4', 'BR-W7']).toContain(res.body.details.rule);
  });

  it('refuses closing to a technician (403 BR-W16)', async () => {
    const wo = await workOrder('COMPLETED');
    const res = await update('technician1', wo.id, { status: 'CLOSED' }).expect(403);
    expect(res.body.details).toEqual({ rule: 'BR-W16' });
  });

  it('puts work on hold before it started, and back to OPEN (BR-W5)', async () => {
    const wo = await workOrder('ON_HOLD');
    expect(wo.started_on).toBeNull();
    await update('technician1', wo.id, { status: 'OPEN' }).expect(200);
    const started = await workOrder('IN_PROGRESS');
    await update('technician1', started.id, { status: 'ON_HOLD', hold_reason: 'OTHER' }).expect(
      200,
    );
    const res = await update('technician1', started.id, { status: 'OPEN' }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-W5' });
  });
});

describe('technical end, reopening and closing (BR-W6, BR-W15)', () => {
  it('marks technically done with a report, reopens, then closes read-only', async () => {
    const wo = await workOrder('IN_PROGRESS');
    const noReport = await update('technician1', wo.id, { status: 'COMPLETED' }).expect(422);
    expect(noReport.body.details).toEqual({ rule: 'BR-W6' });

    const done = await update('technician1', wo.id, {
      status: 'COMPLETED',
      work_report: 'Belt replaced.',
      edited_at: '2026-10-04T10:00:00.000Z',
    }).expect(200);
    expect(done.body.item).toMatchObject({
      status: 'COMPLETED',
      completed_on: TODAY,
      completed_at: '2026-10-04T10:00:00.000Z',
      closed_on: null,
    });

    const reopened = await update('technician1', wo.id, { status: 'IN_PROGRESS' }).expect(200);
    expect(reopened.body.item).toMatchObject({
      status: 'IN_PROGRESS',
      completed_on: null,
      completed_at: null,
    });

    await update('technician1', wo.id, { status: 'COMPLETED' }).expect(200);
    const closed = await update('supervisor1', wo.id, { status: 'CLOSED' }).expect(200);
    expect(closed.body.item).toMatchObject({ status: 'CLOSED', closed_on: TODAY });
    const readOnly = await update('supervisor1', wo.id, { actual_hours: 2 }).expect(422);
    expect(readOnly.body.details).toEqual({ rule: 'BR-W7' });
  });

  it('keeps the time an offline completion was made when it syncs later (BR-W18)', async () => {
    // Started and done yesterday offline, synced today: both keep their day and time.
    const wo = await workOrder('OPEN', { edited_at: '2026-10-03T07:00:00.000Z' });
    const start = await update('technician1', wo.id, {
      status: 'IN_PROGRESS',
      edited_at: '2026-10-03T08:00:00.000Z',
    }).expect(200);
    expect(start.body.item).toMatchObject({
      started_on: '2026-10-03',
      first_started_at: '2026-10-03T08:00:00.000Z',
    });
    const res = await update('technician1', wo.id, {
      status: 'COMPLETED',
      work_report: 'Done offline.',
      edited_at: '2026-10-03T19:45:00.000Z',
    }).expect(200);
    expect(res.body.item).toMatchObject({
      completed_on: '2026-10-03',
      completed_at: '2026-10-03T19:45:00.000Z',
    });
    const entry = auditOf(wo.id).at(-1);
    expect(entry.edited_at).toBe('2026-10-03T19:45:00.000Z');
    expect(entry.at).not.toBe(entry.edited_at);
  });

  it('lets a supervisor waive the report, logged; a technician gets 403', async () => {
    const wo = await workOrder('IN_PROGRESS');
    const tech = await update('technician1', wo.id, {
      status: 'COMPLETED',
      report_waived: true,
    }).expect(403);
    expect(tech.body.details).toMatchObject({ rule: 'BR-W6', fields: ['report_waived'] });

    const res = await update('supervisor1', wo.id, {
      status: 'COMPLETED',
      report_waived: true,
    }).expect(200);
    expect(res.body.item).toMatchObject({
      status: 'COMPLETED',
      report_waived: true,
      work_report: null,
    });
    expect(JSON.parse(auditOf(wo.id).at(-1).changes).report_waived).toEqual({
      from: false,
      to: true,
    });
    // Writing the report later keeps the waiver.
    const later = await update('technician1', wo.id, { work_report: 'Report found.' }).expect(200);
    expect(later.body.item.report_waived).toBe(true);
  });

  it('refuses to reopen for an inactive assignee unless reassigned (BR-W15)', async () => {
    const id = Number(
      ctx.db
        .prepare(
          `INSERT INTO users (username, password_hash, first_name, last_name, role)
           VALUES ('leaver', 'x', 'Lee', 'Ver', 'TECHNICIAN')`,
        )
        .run().lastInsertRowid,
    );
    const wo = await workOrder('IN_PROGRESS', { assignee_id: id });
    await update('supervisor1', wo.id, { status: 'COMPLETED', work_report: 'Done.' }).expect(200);
    ctx.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    const res = await update('supervisor1', wo.id, { status: 'IN_PROGRESS' }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-W15' });
    await update('supervisor1', wo.id, {
      status: 'IN_PROGRESS',
      assignee_id: USERS.technician2,
    }).expect(200);
  });
});

describe('holds (BR-W14)', () => {
  it('needs a reason, keeps a note, and clears both when the work resumes', async () => {
    const wo = await workOrder('IN_PROGRESS');
    const res = await update('technician1', wo.id, { status: 'ON_HOLD' }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-W14' });
    const held = await update('technician1', wo.id, {
      status: 'ON_HOLD',
      hold_reason: 'WAITING_ACCESS',
      hold_note: 'The room is locked until Monday.',
    }).expect(200);
    expect(held.body.item).toMatchObject({
      hold_reason: 'WAITING_ACCESS',
      hold_note: 'The room is locked until Monday.',
    });
    const resumed = await update('technician1', wo.id, { status: 'IN_PROGRESS' }).expect(200);
    expect(resumed.body.item).toMatchObject({ hold_reason: null, hold_note: null });
    // The history keeps them.
    const changes = JSON.parse(auditOf(wo.id).at(-1).changes);
    expect(changes.hold_reason).toEqual({ from: 'WAITING_ACCESS', to: null });
  });
});

describe('admin override (BR-W17)', () => {
  it('moves a closed or cancelled work order to any status, marked in the history', async () => {
    const closed = await workOrder('CLOSED');
    const back = await update('admin', closed.id, { status: 'IN_PROGRESS' }).expect(200);
    expect(back.body.item).toMatchObject({
      status: 'IN_PROGRESS',
      completed_on: null,
      completed_at: null,
      closed_on: null,
    });
    const history = await ctx
      .getAs('technician1', `/api/work-orders/${closed.id}/history`)
      .expect(200);
    expect(history.body.items[0].note).toEqual({ status_override: true });

    const cancelled = await workOrder('CANCELLED');
    const done = await update('admin', cancelled.id, {
      status: 'CLOSED',
      report_waived: true,
    }).expect(200);
    expect(done.body.item).toMatchObject({
      status: 'CLOSED',
      started_on: TODAY,
      completed_on: TODAY,
      closed_on: TODAY,
      report_waived: true,
    });
    expect(done.body.item.first_started_at).not.toBeNull();
  });

  it('keeps BR-W6 and BR-W14, and refuses the same move to technicians and supervisors', async () => {
    const open = await workOrder('OPEN');
    expect(
      (await update('admin', open.id, { status: 'COMPLETED' }).expect(422)).body.details,
    ).toEqual({ rule: 'BR-W6' });
    const cancelled = await workOrder('CANCELLED');
    expect(
      (await update('admin', cancelled.id, { status: 'ON_HOLD' }).expect(422)).body.details,
    ).toEqual({ rule: 'BR-W14' });
    for (const username of ['supervisor1', 'technician1']) {
      const res = await update(username, open.id, {
        status: 'COMPLETED',
        work_report: 'x',
      }).expect(422);
      expect(res.body.details).toEqual({ rule: 'BR-W4' });
    }
  });

  it('cannot bring back a request withdrawn by its requester', async () => {
    const created = await send('post', 'user1', '/api/requests', {
      client_id: randomUUID(),
      title: 'Lamp out',
      site: 'Paris La Défense Headquarters',
      location: 'Lobby',
    }).expect(201);
    const id = created.body.item.id;
    await send('post', 'user1', `/api/requests/${id}/cancel`, {}).expect(200);
    const res = await update('admin', id, { status: 'OPEN' }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-W17' });
  });
});

describe('conflict resolution (BR-W18)', () => {
  it("keeps the client's time for a completion applied by a resolution", async () => {
    const wo = await workOrder('IN_PROGRESS');
    const version = row(wo.id).version;
    await update('supervisor1', wo.id, { priority: 'HIGH' }).expect(200);
    const conflict = await send('put', 'technician1', `/api/work-orders/${wo.id}`, {
      status: 'COMPLETED',
      work_report: 'Fixed on site.',
      version,
      edited_at: '2026-10-04T08:30:00.000Z',
    }).expect(409);
    const res = await send('put', 'supervisor1', `/api/work-orders/${wo.id}/resolve-conflict`, {
      conflict_id: conflict.body.conflict_id,
      choice: 'B',
    }).expect(200);
    expect(res.body.item).toMatchObject({
      status: 'COMPLETED',
      completed_at: '2026-10-04T08:30:00.000Z',
    });
    const entry = auditOf(wo.id).at(-1);
    expect(entry.action).toBe('RESOLVE');
    expect(entry.edited_at).toBe('2026-10-04T08:30:00.000Z');
  });
});

describe('lists and figures (D86)', () => {
  it('lists the "To close" queue, oldest technical end first', async () => {
    const res = await ctx
      .getAs(
        'supervisor1',
        '/api/work-orders?status=COMPLETED&sort=completed_on&order=asc&size=100',
      )
      .expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    const dates = res.body.items.map((w) => w.completed_on);
    expect(dates).toEqual([...dates].sort());
    expect(res.body.items.every((w) => w.status === 'COMPLETED' && !w.closed_on)).toBe(true);
    const tile = await ctx.getAs('supervisor1', '/api/dashboard').expect(200);
    expect(tile.body.kpis.to_close).toBe(
      ctx.db.prepare("SELECT count(*) FROM work_orders WHERE status = 'COMPLETED'").pluck().get(),
    );
    const tech = await ctx.getAs('technician1', '/api/dashboard').expect(200);
    expect(tech.body.kpis).not.toHaveProperty('to_close');
  });

  it('counts done work on its technical end: done in September, closed in October', async () => {
    const wo = await workOrder('IN_PROGRESS', {
      title: 'Zeppelin September job',
      edited_at: '2026-09-28T07:00:00.000Z',
    });
    ctx.db.prepare("UPDATE work_orders SET started_on = '2026-09-28' WHERE id = ?").run(wo.id);
    await update('technician1', wo.id, {
      status: 'COMPLETED',
      work_report: 'Done.',
      completed_on: '2026-09-30',
    }).expect(200);
    await update('supervisor1', wo.id, { status: 'CLOSED' }).expect(200);
    const october = await ctx
      .getAs('supervisor1', '/api/work-orders?drill=closed_this_month&q=zeppelin')
      .expect(200);
    expect(october.body.total).toBe(0);
    const flow = await ctx
      .getAs('supervisor1', '/api/work-orders?drill=opened_vs_closed:closed:2026-W40&q=zeppelin')
      .expect(200);
    expect(flow.body.items.map((w) => w.id)).toEqual([wo.id]);
  });
});
