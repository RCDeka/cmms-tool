// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Week scheduler and My week (D48, Phase 19): blocks, capacity, open weekends, appointments,
// the tray and carry-over (BR-S1 to BR-S10).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededApp, expectNoSecrets } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const as = (username) => {
  const token = ctx.tokenFor(username);
  const send = (method) => (url, body) =>
    request(ctx.app)[method](url).set('Authorization', `Bearer ${token}`).send(body);
  return {
    get: (url) => request(ctx.app).get(url).set('Authorization', `Bearer ${token}`),
    post: send('post'),
    put: send('put'),
    delete: (url) => request(ctx.app).delete(url).set('Authorization', `Bearer ${token}`),
  };
};
const sup = () => as('supervisor1');
const userId = (username) =>
  ctx.db.prepare('SELECT id FROM users WHERE username = ?').pluck().get(username);

// Clock: Sunday 4 October 2026, current week 2026-W40 (the seeded week). Tests write in the
// following weeks: 2026-W41 is Monday 5 to Sunday 11 October.
const MON = '2026-10-05';
const TUE = '2026-10-06';
const SAT = '2026-10-10';

let woSeq = 0;
/** A new open corrective work order (supervisor1), unassigned and without a week. */
async function newWorkOrder(o = {}) {
  const site = o.site ?? 'Lyon Part-Dieu Branch';
  const res = await sup()
    .post('/api/work-orders', {
      client_id: crypto.randomUUID(),
      title: `Scheduler test ${++woSeq}`,
      type: 'CORRECTIVE',
      site,
      estimated_hours: 2,
      ...o,
    })
    .expect(201);
  return res.body.item;
}
const block = (wo, o = {}) => ({
  kind: 'WORK',
  work_order_id: wo.id,
  technician_id: userId('technician1'),
  day: MON,
  hours: 1,
  ...o,
});
async function allocate(...blocks) {
  const res = await sup().post('/api/schedule/allocations', { blocks }).expect(201);
  return res.body.items;
}
const week = async (w = '2026-W41', user = 'supervisor1') =>
  (await as(user).get(`/api/schedule?week=${w}`).expect(200)).body;
const personOf = (data, username) => data.people.find((p) => p.id === userId(username));
const dayOf = (data, username, day) => personOf(data, username).days.find((d) => d.day === day);
const trayItem = (data, wo) => data.tray.find((t) => t.id === wo.id);

describe('access', () => {
  it('lets every maintenance role read; only supervisors and admins write', async () => {
    await as('technician1').get('/api/schedule').expect(200);
    await as('admin').get('/api/schedule').expect(200);
    const wo = await newWorkOrder();
    await as('technician1')
      .post('/api/schedule/allocations', { blocks: [block(wo)] })
      .expect(403);
    await as('technician1')
      .put('/api/schedule/weeks/2026-W41', {
        saturday_open: true,
        sunday_open: false,
      })
      .expect(403);
    await as('technician1')
      .put('/api/schedule/capacity', {
        technician_id: userId('technician1'),
        day: MON,
        hours: 0,
        reason: 'LEAVE',
      })
      .expect(403);
  });

  it('refuses staff members (403) and anonymous calls (401)', async () => {
    await as('user1').get('/api/schedule').expect(403);
    await as('user1').get('/api/my-week').expect(403);
    await as('user1').put('/api/schedule/day-order', {}).expect(403);
    await request(ctx.app).get('/api/schedule').expect(401);
  });

  it('validates the week and unknown parameters (400)', async () => {
    await sup().get('/api/schedule?week=2027-W53').expect(400);
    await sup().get('/api/schedule?week=41').expect(400);
    await sup().get('/api/schedule?weeks=2026-W41').expect(400);
  });
});

describe('GET /api/schedule: the seeded week', () => {
  let data;
  beforeAll(async () => {
    data = (await sup().get('/api/schedule').expect(200)).body;
  });

  it('defaults to the current week, Monday to Friday, people with their days', () => {
    expectNoSecrets(data);
    expect(data.week).toBe('2026-W40');
    expect(data.current_week).toBe('2026-W40');
    expect(data.days.map((d) => d.day)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(data.saturday_open).toBe(false);
    expect(data.settings).toEqual({ daily_hours: 7, max_block_hours: 3.5 });
    // Technicians first, then supervisors (P17).
    expect(data.people.map((p) => p.role)).toEqual([
      'TECHNICIAN',
      'TECHNICIAN',
      'SUPERVISOR',
      'SUPERVISOR',
    ]);
    expect(personOf(data, 'technician1').week_capacity).toBe(35);
  });

  it('shows the split job, the appointment, the travel time and the absence', () => {
    const tech1 = personOf(data, 'technician1');
    const split = tech1.blocks.filter((b) => b.work_order_id === tech1.blocks[0].work_order_id);
    expect(split.map((b) => [b.day, b.hours])).toEqual([
      ['2026-09-28', 3.5],
      ['2026-09-29', 2.5],
    ]);
    const appointment = tech1.blocks.find((b) => b.locked_start);
    expect(appointment).toMatchObject({ locked_start: '10:00', note: 'Keys at reception' });
    expect(appointment.locked_by.last_name).toBeTruthy();
    // Appointments come first in their day.
    expect(tech1.blocks.filter((b) => b.day === '2026-09-29')[0].id).toBe(appointment.id);
    const wednesday = dayOf(data, 'technician1', '2026-09-30');
    expect(wednesday.sites).toHaveLength(2);
    expect(wednesday.warnings).toContain('SEVERAL_SITES');
    expect(tech1.blocks.some((b) => b.kind === 'TRAVEL' && b.day === '2026-09-30')).toBe(true);
    const leave = dayOf(data, 'technician2', '2026-10-01');
    expect(leave).toMatchObject({ capacity: 0, override: { hours: 0, reason: 'LEAVE' } });
    expect(tiles(data).booked_hours).toBeGreaterThan(0);
  });

  it('lists the tray: planned this week first, without requests waiting for review', () => {
    expect(data.tray.length).toBeGreaterThan(0);
    const groups = data.tray.map((t) => t.group);
    expect(groups.indexOf('NOT_PLANNED')).toBeGreaterThan(groups.lastIndexOf('PLANNED'));
    const pending = ctx.db
      .prepare("SELECT id FROM work_orders WHERE review_status = 'PENDING'")
      .pluck()
      .all();
    expect(data.tray.some((t) => pending.includes(t.id))).toBe(false);
    expect(data.tray.every((t) => ['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(t.status))).toBe(
      true,
    );
  });

  it('releases the visits due first, so the preventive work of the week is in the tray (BR-P6)', () => {
    const visits = data.tray.filter((t) => t.plan_id !== null);
    const released = visits.filter((t) => t.planned_week === '2026-W40');
    expect(released.length).toBeGreaterThan(0);
    expect(released.every((t) => t.group === 'PLANNED')).toBe(true);
    // A late visit of an earlier week, still going on, is carried over (BR-S9, demo history D64).
    const late = visits.filter((t) => t.planned_week < '2026-W40');
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((t) => t.group === 'CARRIED_OVER')).toBe(true);
  });
});
const tiles = (data) => data.tiles;

describe('POST /api/schedule/allocations', () => {
  it('stores a 6 h job split as 3 h 30 + 2 h 30 in one call (BR-S1)', async () => {
    const wo = await newWorkOrder({ estimated_hours: 6 });
    const items = await allocate(block(wo, { hours: 3.5 }), block(wo, { day: TUE, hours: 2.5 }));
    expect(items.map((b) => [b.day, b.hours])).toEqual([
      [MON, 3.5],
      [TUE, 2.5],
    ]);
    const data = await week();
    expect(trayItem(data, wo)).toMatchObject({
      group: 'PLANNED',
      needed_hours: 6,
      scheduled_hours: 6,
      hours_left: 0,
    });
  });

  it('refuses a block longer than 3 h 30 (BR-S1) and steps other than half hours (400)', async () => {
    const wo = await newWorkOrder({ estimated_hours: 6 });
    const long = await sup()
      .post('/api/schedule/allocations', { blocks: [block(wo, { hours: 4 })] })
      .expect(422);
    expect(long.body.details.rule).toBe('BR-S1');
    await sup()
      .post('/api/schedule/allocations', { blocks: [block(wo, { hours: 1.25 })] })
      .expect(400);
    await sup()
      .post('/api/schedule/allocations', { blocks: [block(wo, { extra: 1 })] })
      .expect(400);
    await sup().post('/api/schedule/allocations', { blocks: [] }).expect(400);
    // A split refused as a whole: nothing stored.
    await sup()
      .post('/api/schedule/allocations', {
        blocks: [block(wo, { hours: 3.5 }), block(wo, { day: TUE, hours: 4 })],
      })
      .expect(422);
    expect((await week()).tray.find((t) => t.id === wo.id).scheduled_hours).toBe(0);
  });

  it('shows "30 min left" for a 2 h job with a 1 h 30 block (BR-S2)', async () => {
    const wo = await newWorkOrder({ estimated_hours: 2 });
    await allocate(block(wo, { hours: 1.5 }));
    expect(trayItem(await week(), wo)).toMatchObject({ hours_left: 0.5, scheduled_hours: 1.5 });
  });

  it('gives a week and an assignee to the work order with its first block (BR-S3)', async () => {
    const wo = await newWorkOrder();
    expect(wo.assignee_id).toBeNull();
    await allocate(block(wo, { technician_id: userId('technician2') }));
    // A second person on the job is a helper: the assignee stays.
    await allocate(block(wo, { technician_id: userId('technician1'), day: TUE }));
    const after = (await sup().get(`/api/work-orders/${wo.id}`).expect(200)).body;
    expect(after.assignee_id).toBe(userId('technician2'));
    expect(after.planned_week).toBe('2026-W41');
    expect(after.version).toBe(wo.version + 1);
    const history = (await sup().get(`/api/work-orders/${wo.id}/history`).expect(200)).body;
    expect(history.items[0].changes).toEqual({
      planned_week: { from: null, to: '2026-W41' },
      assignee_id: { from: null, to: userId('technician2') },
    });
  });

  it('refuses work that cannot be scheduled (BR-S2, BR-S4)', async () => {
    const pending = ctx.db
      .prepare("SELECT id FROM work_orders WHERE review_status = 'PENDING' LIMIT 1")
      .get();
    const closed = ctx.db
      .prepare("SELECT id FROM work_orders WHERE status = 'CLOSED' LIMIT 1")
      .get();
    const noEstimate = await newWorkOrder({ estimated_hours: null });
    for (const [wo, rule] of [
      [pending, 'BR-S4'],
      [closed, 'BR-S4'],
      [noEstimate, 'BR-S2'],
    ]) {
      const res = await sup()
        .post('/api/schedule/allocations', { blocks: [block(wo)] })
        .expect(422);
      expect(res.body.details.rule).toBe(rule);
    }
    const unknown = await sup()
      .post('/api/schedule/allocations', { blocks: [block({ id: 999999 })] })
      .expect(422);
    expect(unknown.body.message).toMatch(/does not exist/);
  });

  it('gives time only to active technicians and supervisors', async () => {
    const wo = await newWorkOrder();
    for (const username of ['admin', 'user1']) {
      await sup()
        .post('/api/schedule/allocations', {
          blocks: [block(wo, { technician_id: userId(username) })],
        })
        .expect(422);
    }
    await allocate(block(wo, { technician_id: userId('supervisor2') }));
  });

  it('adds travel, preparation and other time with a note, without a work order (P10)', async () => {
    const [travel] = await allocate({
      kind: 'TRAVEL',
      technician_id: userId('technician2'),
      day: TUE,
      hours: 1,
      note: 'Lyon → Saclay',
    });
    expect(travel).toMatchObject({ kind: 'TRAVEL', work_order: null, note: 'Lyon → Saclay' });
    await sup()
      .post('/api/schedule/allocations', {
        blocks: [
          {
            kind: 'TRAVEL',
            technician_id: userId('technician2'),
            day: TUE,
            hours: 1,
            work_order_id: 1,
          },
        ],
      })
      .expect(400);
    await sup()
      .post('/api/schedule/allocations', {
        blocks: [{ kind: 'WORK', technician_id: userId('technician2'), day: TUE, hours: 1 }],
      })
      .expect(400);
    const log = (await sup().get('/api/audit-log?entity_type=allocations').expect(200)).body;
    expect(log.items[0]).toMatchObject({ action: 'CREATE', entity_id: travel.id });
    expect(log.items[0].label).toMatch(/^Travel · /);
  });
});

describe('warnings of a day', () => {
  it('shows a day at 8 h 30 as over its 7 h capacity, without refusing it (BR-S5)', async () => {
    const tech = userId('supervisor2');
    const day = '2026-10-07';
    const a = await newWorkOrder({ estimated_hours: 3.5 });
    const b = await newWorkOrder({ estimated_hours: 3.5 });
    await allocate(
      block(a, { technician_id: tech, day, hours: 3.5 }),
      block(b, { technician_id: tech, day, hours: 3.5 }),
      { kind: 'PREPARATION', technician_id: tech, day, hours: 1.5 },
    );
    const wednesday = dayOf(await week(), 'supervisor2', day);
    expect(wednesday).toMatchObject({ total: 8.5, capacity: 7 });
    expect(wednesday.warnings).toContain('OVER_CAPACITY');
  });

  it('flags two sites in a day (BR-S10)', async () => {
    const tech = userId('technician2');
    const day = '2026-10-08';
    await allocate(
      block(await newWorkOrder({ site: 'Lyon Part-Dieu Branch' }), { technician_id: tech, day }),
      block(await newWorkOrder({ site: 'Saclay Data Center' }), { technician_id: tech, day }),
    );
    const thursday = dayOf(await week(), 'technician2', day);
    expect(thursday.sites).toEqual(['Lyon Part-Dieu Branch', 'Saclay Data Center']);
    expect(thursday.warnings).toEqual(['SEVERAL_SITES']);
  });

  it('marks blocks on an absent day (BR-S8)', async () => {
    const tech = userId('technician2');
    const day = '2026-10-09';
    await sup()
      .put('/api/schedule/capacity', { technician_id: tech, day, hours: 0, reason: 'LEAVE' })
      .expect(200);
    await allocate(block(await newWorkOrder(), { technician_id: tech, day }));
    const friday = dayOf(await week(), 'technician2', day);
    expect(friday.warnings).toEqual(['OVER_CAPACITY', 'ABSENT']);
    // Back to the default day.
    await sup()
      .put('/api/schedule/capacity', { technician_id: tech, day, hours: null })
      .expect(200);
    expect(dayOf(await week(), 'technician2', day)).toMatchObject({ capacity: 7, override: null });
    await sup().put('/api/schedule/capacity', { technician_id: tech, day, hours: 3 }).expect(400);
  });
});

describe('open weekends (P11)', () => {
  it('shows Saturday only once opened, with hours given by an override', async () => {
    const w = '2026-W42';
    const saturday = '2026-10-17';
    expect((await week(w)).days).toHaveLength(5);
    const opened = await sup()
      .put(`/api/schedule/weeks/${w}`, { saturday_open: true, sunday_open: false })
      .expect(200);
    expect(opened.body).toEqual({ week: w, saturday_open: true, sunday_open: false });
    let data = await week(w);
    expect(data.days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(dayOf(data, 'technician1', saturday).capacity).toBe(0);
    await sup()
      .put('/api/schedule/capacity', {
        technician_id: userId('technician1'),
        day: saturday,
        hours: 4,
        reason: 'WEEKEND',
      })
      .expect(200);
    data = await week(w);
    expect(dayOf(data, 'technician1', saturday)).toMatchObject({
      capacity: 4,
      override: { reason: 'WEEKEND' },
    });
    expect(personOf(data, 'technician1').week_capacity).toBe(39);
    await sup()
      .put(`/api/schedule/weeks/${w}`, { saturday_open: false, sunday_open: false })
      .expect(200);
    expect((await week(w)).days).toHaveLength(5);
    await sup().put('/api/schedule/weeks/2026-W42', { saturday_open: true }).expect(400);
  });

  it('keeps a closed weekend day visible when it holds blocks, with a warning', async () => {
    await allocate(block(await newWorkOrder(), { day: SAT }));
    const data = await week();
    expect(data.days.at(-1)).toEqual({ day: SAT, weekday: 6, open: false });
    expect(dayOf(data, 'technician1', SAT).warnings).toContain('WEEKEND_CLOSED');
  });
});

describe('moving and removing blocks', () => {
  it('moves a block to another day or person and resizes it, at its version', async () => {
    const wo = await newWorkOrder({ estimated_hours: 3 });
    const [b] = await allocate(block(wo, { hours: 2 }));
    const moved = await sup()
      .put(`/api/schedule/allocations/${b.id}`, {
        day: TUE,
        technician_id: userId('technician2'),
        version: 1,
      })
      .expect(200);
    expect(moved.body.item).toMatchObject({ day: TUE, version: 2 });
    // A shrunk block sends the difference back to the tray.
    await sup().put(`/api/schedule/allocations/${b.id}`, { hours: 1, version: 2 }).expect(200);
    expect(trayItem(await week(), wo).hours_left).toBe(2);
    const stale = await sup()
      .put(`/api/schedule/allocations/${b.id}`, { hours: 2, version: 2 })
      .expect(409);
    expect(stale.body.details.rule).toBe('BR-V1');
    await sup().put(`/api/schedule/allocations/${b.id}`, { hours: 4, version: 3 }).expect(422);
    await sup().put(`/api/schedule/allocations/${b.id}`, { version: 3 }).expect(400);
    await sup().put('/api/schedule/allocations/999999', { hours: 1, version: 1 }).expect(404);
  });

  it('removes a block: its hours go back to the tray', async () => {
    const wo = await newWorkOrder({ estimated_hours: 2 });
    const [b] = await allocate(block(wo, { hours: 2 }));
    await sup().delete(`/api/schedule/allocations/${b.id}?version=2`).expect(409);
    await sup().delete(`/api/schedule/allocations/${b.id}`).expect(400);
    await sup().delete(`/api/schedule/allocations/${b.id}?version=1`).expect(204);
    expect(trayItem(await week(), wo).hours_left).toBe(2);
    await sup().delete(`/api/schedule/allocations/${b.id}?version=1`).expect(404);
    const log = (await sup().get('/api/audit-log?entity_type=allocations').expect(200)).body;
    expect(log.items[0]).toMatchObject({ action: 'DELETE', entity_id: b.id });
    expect(log.items[0].note.snapshot.hours).toBe(2);
  });

  it('keeps the blocks of a finished work order as history (BR-S4)', async () => {
    const wo = await newWorkOrder();
    const [b] = await allocate(block(wo));
    const current = (await sup().get(`/api/work-orders/${wo.id}`)).body;
    await sup()
      .put(`/api/work-orders/${wo.id}`, { status: 'CANCELLED', version: current.version })
      .expect(200);
    const res = await sup()
      .put(`/api/schedule/allocations/${b.id}`, { day: TUE, version: 1 })
      .expect(422);
    expect(res.body.details.rule).toBe('BR-S4');
    await sup().delete(`/api/schedule/allocations/${b.id}?version=1`).expect(422);
  });
});

describe('appointments (BR-S6, BR-S7)', () => {
  it('lets a technician lock their own 10:00 appointment, which the supervisor then cannot drag', async () => {
    const wo = await newWorkOrder();
    const [b] = await allocate(block(wo, { hours: 2, day: '2026-10-07' }));
    const locked = await as('technician1')
      .put(`/api/schedule/allocations/${b.id}/lock`, { locked_start: '10:00', version: 1 })
      .expect(200);
    expect(locked.body.item).toMatchObject({ locked_start: '10:00', version: 2 });
    expect(locked.body.item.locked_by.id).toBe(userId('technician1'));

    for (const change of [{ day: TUE }, { technician_id: userId('technician2') }, { hours: 1.5 }]) {
      const res = await sup()
        .put(`/api/schedule/allocations/${b.id}`, { ...change, version: 2 })
        .expect(422);
      expect(res.body.details.rule).toBe('BR-S6');
      expect(res.body.message).toMatch(/locked at 10:00/);
    }
    await sup().delete(`/api/schedule/allocations/${b.id}?version=2`).expect(422);
    // A note is still fine.
    await sup()
      .put(`/api/schedule/allocations/${b.id}`, { note: 'Badge needed', version: 2 })
      .expect(200);

    // Unlocked, it moves again.
    await sup()
      .put(`/api/schedule/allocations/${b.id}/lock`, { locked_start: null, version: 3 })
      .expect(200);
    await sup().put(`/api/schedule/allocations/${b.id}`, { day: TUE, version: 4 }).expect(200);
  });

  it('refuses another person’s block to a technician (403), and overlapping appointments (409)', async () => {
    const tech2 = userId('technician2');
    const day = '2026-10-06';
    const [a, b] = await allocate(
      block(await newWorkOrder(), { technician_id: tech2, day, hours: 2 }),
      block(await newWorkOrder(), { technician_id: tech2, day, hours: 1 }),
    );
    await as('technician1')
      .put(`/api/schedule/allocations/${a.id}/lock`, { locked_start: '09:00', version: 1 })
      .expect(403);
    await as('technician2')
      .put(`/api/schedule/allocations/${a.id}/lock`, { locked_start: '09:00', version: 1 })
      .expect(200);
    const clash = await sup()
      .put(`/api/schedule/allocations/${b.id}/lock`, { locked_start: '10:30', version: 1 })
      .expect(409);
    expect(clash.body.details.rule).toBe('BR-S6');
    await sup()
      .put(`/api/schedule/allocations/${b.id}/lock`, { locked_start: '11:00', version: 1 })
      .expect(200);
    await sup()
      .put(`/api/schedule/allocations/${b.id}/lock`, { locked_start: '11:15', version: 2 })
      .expect(400);
    // Technicians do not move blocks, even their own (BR-S7).
    await as('technician2')
      .put(`/api/schedule/allocations/${b.id}`, { note: 'x', version: 2 })
      .expect(403);
  });

  it('locks work blocks only', async () => {
    const [travel] = await allocate({
      kind: 'TRAVEL',
      technician_id: userId('technician1'),
      day: '2026-10-08',
      hours: 1,
    });
    const res = await sup()
      .put(`/api/schedule/allocations/${travel.id}/lock`, { locked_start: '08:00', version: 1 })
      .expect(422);
    expect(res.body.details.rule).toBe('BR-S6');
  });
});

describe('PUT /api/schedule/day-order (BR-S7)', () => {
  it('lets a technician order their own day, appointments staying first', async () => {
    const tech = userId('technician2');
    const day = '2026-10-13';
    const [a, b, c] = await allocate(
      block(await newWorkOrder(), { technician_id: tech, day }),
      block(await newWorkOrder(), { technician_id: tech, day }),
      { kind: 'TRAVEL', technician_id: tech, day, hours: 0.5 },
    );
    const res = await as('technician2')
      .put('/api/schedule/day-order', { technician_id: tech, day, ids: [c.id, b.id, a.id] })
      .expect(200);
    expect(res.body.items.map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    // Not a change of the blocks themselves: versions stay.
    expect(res.body.items.map((x) => x.version)).toEqual([1, 1, 1]);
    await as('technician1')
      .put('/api/schedule/day-order', { technician_id: tech, day, ids: [a.id, b.id, c.id] })
      .expect(403);
    await as('technician2')
      .put('/api/schedule/day-order', { technician_id: tech, day, ids: [a.id, b.id] })
      .expect(409);
    const mine = (await as('technician2').get('/api/my-week?week=2026-W42').expect(200)).body;
    const monday = mine.days.find((d) => d.day === day);
    expect(monday.blocks.map((x) => x.id)).toEqual([c.id, b.id, a.id]);
  });
});

describe('carry-over (BR-S9)', () => {
  it('shows unfinished work in the next week’s tray, marked carried over', async () => {
    const wo = await newWorkOrder({ estimated_hours: 3 });
    await allocate(block(wo, { hours: 2 }));
    const next = await week('2026-W42');
    expect(trayItem(next, wo)).toMatchObject({
      group: 'CARRIED_OVER',
      carried_from: '2026-W41',
      scheduled_hours: 2,
      week_hours: 0,
      hours_left: 1,
    });
    // The week before does not list it: it is planned later.
    expect(trayItem(await week('2026-W40'), wo)).toBeUndefined();
    // Finished, it leaves the trays; its blocks stay as history.
    const current = (await sup().get(`/api/work-orders/${wo.id}`)).body;
    await sup()
      .put(`/api/work-orders/${wo.id}`, {
        status: 'IN_PROGRESS',
        version: current.version,
      })
      .expect(200);
    await sup()
      .put(`/api/work-orders/${wo.id}`, {
        status: 'COMPLETED',
        work_report: 'Done',
        version: current.version + 1,
      })
      .expect(200);
    expect(trayItem(await week('2026-W42'), wo)).toBeUndefined();
    const thisWeek = await week();
    expect(personOf(thisWeek, 'technician1').blocks.some((x) => x.work_order_id === wo.id)).toBe(
      true,
    );
  });
});

describe('GET /api/my-week', () => {
  it('gives a technician their own days, blocks and complete work orders', async () => {
    const data = (await as('technician1').get('/api/my-week?week=2026-W40').expect(200)).body;
    expectNoSecrets(data);
    expect(data.week).toBe('2026-W40');
    expect(data.user.id).toBe(userId('technician1'));
    expect(data.days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5]);
    const tuesday = data.days[1];
    expect(tuesday.blocks[0].locked_start).toBe('10:00');
    const blocks = data.days.flatMap((d) => d.blocks);
    expect(blocks.every((b) => b.technician_id === userId('technician1'))).toBe(true);
    const ids = new Set(blocks.map((b) => b.work_order_id).filter(Boolean));
    expect(data.work_orders.map((w) => w.id).sort()).toEqual([...ids].sort());
    expect(data.work_orders[0]).toHaveProperty('version');
    expect(data.week_total).toBe(blocks.reduce((s, b) => s + b.hours, 0));
  });

  it('defaults to the current week; a supervisor gets their own (empty) week', async () => {
    const data = (await as('admin').get('/api/my-week').expect(200)).body;
    expect(data.week).toBe('2026-W40');
    expect(data.days.every((d) => d.blocks.length === 0)).toBe(true);
    expect(data.work_orders).toEqual([]);
  });
});

describe('GET /api/schedule/work-orders/:id (M10)', () => {
  it('lists the blocks of a work order from today on, appointments first, with their person', async () => {
    const wo = await newWorkOrder({ estimated_hours: 4 });
    const [, tuesday] = await allocate(
      block(wo, { hours: 1 }),
      block(wo, { day: TUE, hours: 1 }),
      block(wo, { day: TUE, hours: 1, technician_id: userId('technician2') }),
    );
    await sup()
      .put(`/api/schedule/allocations/${tuesday.id}/lock`, {
        locked_start: '14:00',
        version: tuesday.version,
      })
      .expect(200);
    // A block before today (Sunday 4 October) is history: not listed.
    ctx.db
      .prepare(
        `INSERT INTO allocations (kind, work_order_id, technician_id, day, hours, created_by, created_at, updated_at)
         VALUES ('WORK', ?, ?, '2026-10-01', 1, ?, '2026-10-01T08:00:00Z', '2026-10-01T08:00:00Z')`,
      )
      .run(wo.id, userId('technician1'), userId('supervisor1'));

    const data = (await as('technician1').get(`/api/schedule/work-orders/${wo.id}`).expect(200))
      .body;
    expectNoSecrets(data);
    expect(data.items.map((b) => [b.day, b.locked_start, b.technician.id])).toEqual([
      [MON, null, userId('technician1')],
      [TUE, '14:00', userId('technician1')],
      [TUE, null, userId('technician2')],
    ]);
    expect(Object.keys(data.items[0].technician).sort()).toEqual(['first_name', 'id', 'last_name']);
  });

  it('answers 404 for an unknown work order and 400 for a bad id', async () => {
    await sup().get('/api/schedule/work-orders/999999').expect(404);
    await sup().get('/api/schedule/work-orders/abc').expect(400);
  });
});
