// Year planner editing (D48, Phase 18): series and single moves, skips, blocked weeks.
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
  const send = (method) => (url, body) =>
    request(ctx.app)[method](url).set('Authorization', `Bearer ${token}`).send(body);
  return {
    get: (url) => request(ctx.app).get(url).set('Authorization', `Bearer ${token}`),
    post: send('post'),
    put: send('put'),
    delete: send('delete'),
  };
};
const sup = () => as('supervisor1');
const chiller = () =>
  ctx.db.prepare("SELECT * FROM assets WHERE subcategory = 'Chiller' ORDER BY id LIMIT 1").get();

// Clock: Sunday 4 October 2026, current week 2026-W40, release up to 2026-W44.
async function newPlan(o = {}) {
  const res = await sup()
    .post('/api/plans', {
      title: 'Quarterly service',
      type: 'PREVENTIVE',
      asset_id: chiller().id,
      estimated_hours: 2,
      frequency_weeks: 13,
      anchor_week: '2026-W50',
      ...o,
    })
    .expect(201);
  return res.body.item;
}
const visit = (plan, week) => plan.occurrences.find((o) => o.week === week);

describe('access', () => {
  it('lets technicians read a visit but not change it; staff get 403', async () => {
    const plan = await newPlan();
    const occ = plan.occurrences[0];
    await as('technician1').get(`/api/plan-occurrences/${occ.id}`).expect(200);
    await as('technician1')
      .put(`/api/plan-occurrences/${occ.id}`, { week: '2026-W49', version: 1 })
      .expect(403);
    await as('technician1')
      .post(`/api/plan-occurrences/${occ.id}/skip`, { reason: 'x', version: 1 })
      .expect(403);
    await as('technician1')
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2026-W51', version: 1 })
      .expect(403);
    await as('technician1')
      .post('/api/planning/blocked-weeks', { week: '2026-W52', reason: 'x' })
      .expect(403);
    await as('user1').get(`/api/plan-occurrences/${occ.id}`).expect(403);
    await as('user1').get('/api/planning/blocked-weeks').expect(403);
  });
});

describe('PUT /api/plans/:id/anchor (BR-P2)', () => {
  it('moves every future visit of the series, and back', async () => {
    const plan = await newPlan();
    const moved = await sup()
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2026-W52', version: 1 })
      .expect(200);
    expect(moved.body.item.occurrences.slice(0, 3).map((o) => o.week)).toEqual([
      '2026-W52',
      '2027-W12',
      '2027-W25',
    ]);
    const back = await sup()
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2026-W50', version: 2 })
      .expect(200);
    expect(back.body.item.occurrences.map((o) => o.week)).toEqual(
      plan.occurrences.map((o) => o.week),
    );
  });

  it('carries a visit moved on its own along, keeping its offset (D51)', async () => {
    const plan = await newPlan();
    const second = plan.occurrences[1]; // 2027-W10
    await sup()
      .put(`/api/plan-occurrences/${second.id}`, { week: '2027-W12', version: 1 })
      .expect(200);
    const res = await sup()
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2026-W51', version: 1 })
      .expect(200);
    expect(res.body.item.occurrences.slice(0, 3).map((o) => [o.due_week, o.week])).toEqual([
      ['2026-W51', '2026-W51'],
      ['2027-W11', '2027-W13'], // moved by hand 2 weeks late: still 2 weeks late
      ['2027-W24', '2027-W24'],
    ]);
  });

  it('drops a moved visit whose due week leaves the series when the frequency changes', async () => {
    const plan = await newPlan();
    const second = plan.occurrences[1]; // due 2027-W10
    await sup()
      .put(`/api/plan-occurrences/${second.id}`, { week: '2027-W11', version: 1 })
      .expect(200);
    const res = await sup()
      .put(`/api/plans/${plan.id}`, { frequency_weeks: 26, version: 1 })
      .expect(200);
    expect(res.body.item.occurrences.slice(0, 3).map((o) => o.week)).toEqual([
      '2026-W50',
      '2027-W23',
      '2027-W49',
    ]);
  });

  it('keeps the slot of a visit with a work order: no second visit next to it (D51)', async () => {
    const plan = await newPlan({ anchor_week: '2026-W44' });
    await sup().post('/api/planning/release').expect(200); // W44 gets its work order
    const res = await sup()
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2026-W46', version: 1 })
      .expect(200);
    expect(
      res.body.item.occurrences.slice(0, 3).map((o) => [o.status, o.due_week, o.week]),
    ).toEqual([
      ['RELEASED', '2026-W46', '2026-W44'], // stays in its week, holds the slot of W46
      ['PLANNED', '2027-W06', '2027-W06'],
      ['PLANNED', '2027-W19', '2027-W19'],
    ]);
    // The daily top-up does not bring a W46 visit back.
    await sup().post('/api/planning/release').expect(200);
    expect(
      (await sup().get(`/api/plans/${plan.id}`)).body.occurrences.filter(
        (o) => o.week < '2027-W01',
      ),
    ).toHaveLength(1);
    // And back: the slot follows the series again.
    const back = await sup()
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2026-W44', version: 2 })
      .expect(200);
    expect(back.body.item.occurrences.slice(0, 2).map((o) => [o.due_week, o.week])).toEqual([
      ['2026-W44', '2026-W44'],
      ['2027-W04', '2027-W04'], // 2026 has 53 weeks
    ]);
  });

  it('validates the body and the version', async () => {
    const plan = await newPlan();
    await sup()
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2027-W53', version: 1 })
      .expect(400);
    await sup()
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2026-W51', version: 1, title: 'x' })
      .expect(400);
    await sup()
      .put(`/api/plans/${plan.id}/anchor`, { anchor_week: '2026-W51', version: 9 })
      .expect(409);
    await sup().put('/api/plans/99999/anchor', { anchor_week: '2026-W51', version: 1 }).expect(404);
  });
});

describe('PUT /api/plan-occurrences/:id (BR-P3, BR-P4)', () => {
  it('moves one visit within its tolerance, logged, and back to its due week', async () => {
    const plan = await newPlan(); // tolerance 3
    const occ = visit(plan, '2026-W50');
    const res = await sup()
      .put(`/api/plan-occurrences/${occ.id}`, { week: '2026-W53', version: 1 })
      .expect(200);
    expect(res.body.item).toMatchObject({
      due_week: '2026-W50',
      week: '2026-W53',
      version: 2,
      moved_by: { first_name: 'Julien' },
      warnings: [],
    });
    const log = (await sup().get('/api/audit-log?entity_type=plan_occurrences')).body.items[0];
    expect(log).toMatchObject({
      entity_id: occ.id,
      changes: { week: { from: '2026-W50', to: '2026-W53' } },
      label: `${plan.code} — 2026-W50`,
    });
    // The next visits do not move.
    expect((await sup().get(`/api/plans/${plan.id}`)).body.occurrences[1].week).toBe('2027-W10');
    const back = await sup()
      .put(`/api/plan-occurrences/${occ.id}`, { week: '2026-W50', version: 2 })
      .expect(200);
    expect(back.body.item).toMatchObject({ week: '2026-W50', moved_by: null, moved_at: null });
  });

  it('refuses a week beyond the tolerance, with the reason', async () => {
    const plan = await newPlan();
    const res = await sup()
      .put(`/api/plan-occurrences/${visit(plan, '2026-W50').id}`, {
        week: '2027-W01',
        version: 1,
      })
      .expect(422);
    expect(res.body).toMatchObject({
      message: "Week 1 is outside this visit's tolerance of ± 3 weeks around week 50.",
      details: { rule: 'BR-P3' },
    });
  });

  it('moves a regulatory visit earlier only', async () => {
    const plan = await newPlan({ type: 'REGULATORY' });
    const occ = visit(plan, '2026-W50');
    const later = await sup()
      .put(`/api/plan-occurrences/${occ.id}`, { week: '2026-W51', version: 1 })
      .expect(422);
    expect(later.body.message).toBe(
      'A regulatory visit can only move earlier: week 50 is its deadline.',
    );
    await sup()
      .put(`/api/plan-occurrences/${occ.id}`, { week: '2026-W48', version: 1 })
      .expect(200);
  });

  it('never moves a released visit or into the past', async () => {
    const plan = await newPlan({ anchor_week: '2026-W42' });
    await sup().post('/api/planning/release').expect(200);
    const released = (await sup().get(`/api/plans/${plan.id}`)).body.occurrences[0];
    expect(released.status).toBe('RELEASED');
    const res = await sup()
      .put(`/api/plan-occurrences/${released.id}`, { week: '2026-W43', version: released.version })
      .expect(422);
    expect(res.body.details.rule).toBe('BR-P4');

    const early = await newPlan({ anchor_week: '2026-W45' });
    const past = await sup()
      .put(`/api/plan-occurrences/${early.occurrences[0].id}`, { week: '2026-W39', version: 1 })
      .expect(422);
    expect(past.body.message).toBe('A visit cannot be moved into the past.');
  });

  it('checks the version, the week and the id', async () => {
    const plan = await newPlan();
    const occ = visit(plan, '2026-W50');
    await sup()
      .put(`/api/plan-occurrences/${occ.id}`, { week: '2026-W49', version: 5 })
      .expect(409);
    await sup().put(`/api/plan-occurrences/${occ.id}`, { week: '2026-49', version: 1 }).expect(400);
    await sup().put(`/api/plan-occurrences/${occ.id}`, { week: '2026-W49' }).expect(400);
    await sup().put('/api/plan-occurrences/99999', { week: '2026-W49', version: 1 }).expect(404);
  });
});

describe('skip and restore (BR-P7)', () => {
  it('skips a planned visit with a reason, out of the load, and restores it', async () => {
    const plan = await newPlan({ anchor_week: '2027-W20', estimated_hours: 50 });
    const occ = plan.occurrences[0];
    const load = async () =>
      (await sup().get('/api/planning/timeline?from=2027-W20&weeks=1')).body.figures[0]
        .planned_hours;
    const before = await load();
    await sup().post(`/api/plan-occurrences/${occ.id}/skip`, { version: 1 }).expect(400);
    const skipped = await sup()
      .post(`/api/plan-occurrences/${occ.id}/skip`, { reason: 'Building closed', version: 1 })
      .expect(200);
    expect(skipped.body.item).toMatchObject({ status: 'SKIPPED', skip_reason: 'Building closed' });
    expect(await load()).toBe(before - 50);
    await sup()
      .put(`/api/plan-occurrences/${occ.id}`, { week: '2027-W21', version: 2 })
      .expect(422);
    const restored = await sup()
      .post(`/api/plan-occurrences/${occ.id}/restore`, { version: 2 })
      .expect(200);
    expect(restored.body.item).toMatchObject({ status: 'PLANNED', skip_reason: null, version: 3 });
    expect(await load()).toBe(before);
    await sup().post(`/api/plan-occurrences/${occ.id}/restore`, { version: 3 }).expect(422);
  });

  it('skips a released visit only by cancelling its work order, for good', async () => {
    const plan = await newPlan({ anchor_week: '2026-W43' });
    await sup().post('/api/planning/release').expect(200);
    const occ = (await sup().get(`/api/plans/${plan.id}`)).body.occurrences[0];
    const refused = await sup()
      .post(`/api/plan-occurrences/${occ.id}/skip`, { reason: 'x', version: occ.version })
      .expect(422);
    expect(refused.body.message).toMatch(/cancel the work order/);
    const wo = ctx.db
      .prepare('SELECT id, version FROM work_orders WHERE id = ?')
      .get(occ.work_order.id);
    await sup()
      .put(`/api/work-orders/${wo.id}`, { status: 'CANCELLED', version: wo.version })
      .expect(200);
    const after = (await sup().get(`/api/plan-occurrences/${occ.id}`)).body;
    expect(after).toMatchObject({ status: 'SKIPPED', version: occ.version + 1 });
    await sup()
      .post(`/api/plan-occurrences/${occ.id}/restore`, { version: after.version })
      .expect(422);
  });
});

describe('blocked weeks (BR-P8)', () => {
  it('adds, lists, warns on the timeline and removes', async () => {
    const plan = await newPlan({ anchor_week: '2027-W30' });
    const added = await sup()
      .post('/api/planning/blocked-weeks', {
        week: '2027-W30',
        site: plan.site,
        reason: 'Change freeze',
      })
      .expect(201);
    expect(added.body.item).toMatchObject({
      week: '2027-W30',
      site: plan.site,
      reason: 'Change freeze',
      created_by: { first_name: 'Julien' },
    });
    await sup()
      .post('/api/planning/blocked-weeks', { week: '2027-W30', site: plan.site, reason: 'Again' })
      .expect(409);
    // Another site, and every site, are other entries.
    await sup()
      .post('/api/planning/blocked-weeks', { week: '2027-W30', reason: 'Summer holidays' })
      .expect(201);
    await sup().post('/api/planning/blocked-weeks', { week: '2027-W31' }).expect(400);

    const list = (
      await as('technician1').get('/api/planning/blocked-weeks?from=2027-W30&to=2027-W30')
    ).body.items;
    expect(list.map((b) => b.site)).toEqual([null, plan.site]);

    const t = (await sup().get('/api/planning/timeline?from=2027-W30&weeks=1')).body;
    expect(t.blocked_weeks).toHaveLength(2);
    const row = t.groups.flatMap((g) => g.plans).find((p) => p.id === plan.id);
    expect(row.occurrences[0].warnings).toEqual(['BLOCKED_WEEK']);
    expect(row).toMatchObject({ version: 1, end_week: null, season_from_week: null });

    // A warning, never a refusal: a visit can still move into a blocked week.
    const moved = await sup()
      .put(`/api/plan-occurrences/${row.occurrences[0].id}`, { week: '2027-W30', version: 1 })
      .expect(200);
    expect(moved.body.item.warnings).toEqual(['BLOCKED_WEEK']);

    for (const b of list) await sup().delete(`/api/planning/blocked-weeks/${b.id}`).expect(204);
    await sup().delete(`/api/planning/blocked-weeks/${list[0].id}`).expect(404);
    expect(
      (await sup().get('/api/planning/timeline?from=2027-W30&weeks=1')).body.blocked_weeks,
    ).toEqual([]);
  });
});
