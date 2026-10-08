// Rescheduling a work order through its planned week (D55): supervisors and admins; a plan's
// visit follows its work order (BR-P4).
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededApp } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const as = (username) => {
  const token = ctx.tokenFor(username);
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url) => auth(request(ctx.app).get(url)),
    post: (url, body) => auth(request(ctx.app).post(url)).send(body),
    put: (url, body) => auth(request(ctx.app).put(url)).send(body),
  };
};
const sup = () => as('supervisor1');
const workOrder = async (id) => (await sup().get(`/api/work-orders/${id}`).expect(200)).body;

async function corrective() {
  const res = await sup()
    .post('/api/work-orders', {
      client_id: crypto.randomUUID(),
      title: 'Reschedule me',
      type: 'CORRECTIVE',
      site: 'Lyon Part-Dieu Branch',
      estimated_hours: 2,
    })
    .expect(201);
  return res.body.item;
}

// Clock: 2026-10-04, week 2026-W40; visits up to 2026-W44 are released.
async function releasedVisit(o = {}) {
  const asset = ctx.db
    .prepare("SELECT id FROM assets WHERE subcategory = 'Chiller' ORDER BY id DESC LIMIT 1")
    .pluck()
    .get();
  const plan = (
    await sup()
      .post('/api/plans', {
        title: 'Quarterly service',
        type: 'PREVENTIVE',
        asset_id: asset,
        estimated_hours: 2,
        frequency_weeks: 13,
        anchor_week: '2026-W43',
        ...o,
      })
      .expect(201)
  ).body.item;
  await sup().post('/api/planning/release', {}).expect(200);
  const visit = ctx.db
    .prepare('SELECT * FROM plan_occurrences WHERE plan_id = ? AND week = ?')
    .get(plan.id, '2026-W43');
  expect(visit.status).toBe('RELEASED');
  return { plan, visit, wo: await workOrder(visit.work_order_id) };
}

describe('PUT /api/work-orders/:id with planned_week', () => {
  it('lets a supervisor plan, move and clear the week of a work order; logged', async () => {
    const wo = await corrective();
    const planned = await sup()
      .put(`/api/work-orders/${wo.id}`, { planned_week: '2026-W42', version: wo.version })
      .expect(200);
    expect(planned.body.item.planned_week).toBe('2026-W42');
    // In that week's tray now.
    const tray = (await sup().get('/api/schedule?week=2026-W42').expect(200)).body.tray;
    expect(tray.find((t) => t.id === wo.id)).toMatchObject({ group: 'PLANNED' });
    const cleared = await sup()
      .put(`/api/work-orders/${wo.id}`, { planned_week: '', version: wo.version + 1 })
      .expect(200);
    expect(cleared.body.item.planned_week).toBeNull();
    const history = (await sup().get(`/api/work-orders/${wo.id}/history`)).body.items;
    expect(history[1].changes).toEqual({ planned_week: { from: null, to: '2026-W42' } });
  });

  it('refuses technicians (403) and weeks that do not exist (400)', async () => {
    const wo = await corrective();
    await sup()
      .put(`/api/work-orders/${wo.id}`, { assignee_id: 4, version: wo.version })
      .expect(200);
    const res = await as('technician1')
      .put(`/api/work-orders/${wo.id}`, { planned_week: '2026-W42', version: wo.version + 1 })
      .expect(403);
    expect(res.body.details.fields).toEqual(['planned_week']);
    await sup()
      .put(`/api/work-orders/${wo.id}`, { planned_week: '2027-W53', version: wo.version + 1 })
      .expect(400);
    await sup()
      .put(`/api/work-orders/${wo.id}`, { planned_week: 'W42', version: wo.version + 1 })
      .expect(400);
  });

  it('moves the plan visit with its work order, beyond its tolerance too (BR-P4)', async () => {
    const { visit, wo } = await releasedVisit();
    await sup()
      .put(`/api/work-orders/${wo.id}`, { planned_week: '2026-W50', version: wo.version })
      .expect(200);
    const moved = (await sup().get(`/api/plan-occurrences/${visit.id}`).expect(200)).body;
    expect(moved).toMatchObject({ week: '2026-W50', due_week: '2026-W43', status: 'RELEASED' });
    expect(moved.moved_by.first_name).toBeTruthy();
    const log = (await sup().get('/api/audit-log?entity_type=plan_occurrences').expect(200)).body
      .items[0];
    expect(log).toMatchObject({
      entity_id: visit.id,
      changes: { week: { from: '2026-W43', to: '2026-W50' } },
      note: { work_order: wo.number },
    });
    // Back on its due week: no longer a moved visit.
    await sup()
      .put(`/api/work-orders/${wo.id}`, { planned_week: '2026-W43', version: wo.version + 1 })
      .expect(200);
    const back = (await sup().get(`/api/plan-occurrences/${visit.id}`).expect(200)).body;
    expect(back).toMatchObject({ week: '2026-W43', moved_by: null, moved_at: null });
  });

  it('keeps a week on a visit and a regulatory visit by its deadline (422)', async () => {
    const { wo } = await releasedVisit();
    const none = await sup()
      .put(`/api/work-orders/${wo.id}`, { planned_week: null, version: wo.version })
      .expect(422);
    expect(none.body.details.rule).toBe('BR-P4');

    const regulatory = await releasedVisit({ type: 'REGULATORY' });
    const late = await sup()
      .put(`/api/work-orders/${regulatory.wo.id}`, {
        planned_week: '2026-W44',
        version: regulatory.wo.version,
      })
      .expect(422);
    expect(late.body).toMatchObject({
      message: 'A regulatory visit can only move earlier: week 43 is its deadline.',
      details: { rule: 'BR-P3' },
    });
    await sup()
      .put(`/api/work-orders/${regulatory.wo.id}`, {
        planned_week: '2026-W41',
        version: regulatory.wo.version,
      })
      .expect(200);
  });

  it('records a stale edit as a conflict, like any other field (BR-V3)', async () => {
    const wo = await corrective();
    await sup()
      .put(`/api/work-orders/${wo.id}`, { planned_week: '2026-W45', version: wo.version })
      .expect(200);
    const stale = await as('supervisor2')
      .put(`/api/work-orders/${wo.id}`, { planned_week: '2026-W46', version: wo.version })
      .expect(409);
    expect(stale.body).toMatchObject({ conflict: true });
  });
});
