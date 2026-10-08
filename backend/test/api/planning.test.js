// Maintenance plans and the year planner (D48, Phase 17).
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
  };
};
const count = (sql, ...params) =>
  ctx.db
    .prepare(sql)
    .pluck()
    .get(...params);
const assetOf = (subcategory) =>
  ctx.db.prepare('SELECT * FROM assets WHERE subcategory = ? ORDER BY id LIMIT 1').get(subcategory);

// The test clock is Sunday 4 October 2026: the current week is 2026-W40 and the release
// horizon (4 weeks) ends with 2026-W44.
const quarterly = (o = {}) => ({
  title: 'Quarterly service',
  type: 'PREVENTIVE',
  asset_id: assetOf('Chiller').id,
  estimated_hours: 2,
  frequency_weeks: 13,
  anchor_week: '2026-W50',
  ...o,
});

describe('access', () => {
  it('closes plans and the planner to staff (403)', async () => {
    const staff = as('user1');
    for (const url of [
      '/api/plans',
      '/api/plans/1',
      '/api/planning/timeline',
      '/api/planning/settings',
    ]) {
      await staff.get(url).expect(403);
    }
    await staff.post('/api/plans', quarterly()).expect(403);
  });

  it('lets technicians read but not write', async () => {
    const tech = as('technician1');
    await tech.get('/api/plans').expect(200);
    await tech.get('/api/planning/timeline').expect(200);
    await tech.get('/api/planning/settings').expect(200);
    await tech.post('/api/plans', quarterly()).expect(403);
    await tech.put('/api/plans/1', { title: 'x', version: 1 }).expect(403);
    await tech.post('/api/planning/release').expect(403);
    await tech.put('/api/planning/settings', { reserve_percent: 10, version: 1 }).expect(403);
  });
});

describe('POST /api/plans', () => {
  it('creates a quarterly plan for an asset, with its 4 visits on the timeline', async () => {
    const asset = assetOf('Chiller');
    const res = await as('supervisor1').post('/api/plans', quarterly()).expect(201);
    const plan = res.body.item;
    expect(plan).toMatchObject({
      code: 'PM-0063', // after the 62 seeded plans
      site: asset.site,
      building: asset.building,
      category: 'HVAC', // the asset's trade
      tolerance_weeks: 3,
      schedule_mode: 'FIXED',
      performed_by: 'INTERNAL',
      is_active: true,
      version: 1,
      next_week: '2026-W50',
      asset: { id: asset.id, code: asset.code, name: asset.name },
      created_by: { first_name: 'Julien', last_name: 'Bernard' },
      warnings: [],
    });
    expect(plan.occurrences.map((o) => o.week)).toEqual([
      '2026-W50',
      '2027-W10',
      '2027-W23',
      '2027-W36',
      '2027-W49',
      '2028-W10', // 2027 has 52 weeks
      '2028-W23',
      '2028-W36',
    ]);

    const timeline = (await as('supervisor1').get('/api/planning/timeline').expect(200)).body;
    const row = timeline.groups.flatMap((g) => g.plans).find((p) => p.id === plan.id);
    expect(row.occurrences.map((o) => [o.week, o.status])).toEqual([
      ['2026-W50', 'PLANNED'],
      ['2027-W10', 'PLANNED'],
      ['2027-W23', 'PLANNED'],
      ['2027-W36', 'PLANNED'],
    ]);
    expect(
      count(
        'SELECT count(*) FROM audit_log WHERE entity_type = ? AND entity_id = ?',
        'maintenance_plans',
        plan.id,
      ),
    ).toBe(1);
  });

  it('flags a visit above 3 h 30 (BR-P8)', async () => {
    const res = await as('admin')
      .post('/api/plans', quarterly({ estimated_hours: 4 }))
      .expect(201);
    expect(res.body.item.warnings).toEqual(['LONG_VISIT']);
  });

  it('creates a plan on a site without an asset', async () => {
    const res = await as('supervisor2')
      .post('/api/plans', {
        title: 'Roof drains',
        type: 'PREVENTIVE',
        category: 'PLUMBING',
        site: 'Lyon Part-Dieu Branch',
        estimated_hours: 1,
        frequency_weeks: 26,
        anchor_week: '2027-W01',
      })
      .expect(201);
    expect(res.body.item).toMatchObject({ asset: null, building: null, tolerance_weeks: 6 });
  });

  it.each([
    [{ title: undefined }, 'title'],
    [{ colour: 'red' }, 'colour'],
    [{ anchor_week: '2027-W53' }, 'anchor_week'],
    [{ estimated_hours: 1.25 }, 'estimated_hours'],
    [{ frequency_weeks: 0 }, 'frequency_weeks'],
    [{ type: 'CORRECTIVE' }, 'type'],
    [{ end_week: '2026-W45' }, 'end_week'],
    [{ season_from_week: 14 }, 'season_to_week'],
    [{ performed_by: 'CONTRACTOR' }, 'supplier'],
    [{ asset_id: undefined, site: undefined, category: 'HVAC' }, 'site'],
    [{ asset_id: undefined, site: 'Lyon Part-Dieu Branch' }, 'category'],
  ])('refuses %o (400 on %s)', async (change, field) => {
    const res = await as('supervisor1').post('/api/plans', quarterly(change)).expect(400);
    expect(res.body.details.fields).toHaveProperty(field);
  });

  it('keeps the site and building of the asset (422 BR-P9)', async () => {
    let res = await as('supervisor1')
      .post('/api/plans', quarterly({ site: `${assetOf('Chiller').site} (annex)` }))
      .expect(422);
    expect(res.body.details.rule).toBe('BR-P9');
    res = await as('supervisor1')
      .post('/api/plans', quarterly({ asset_id: 99999 }))
      .expect(422);
    expect(res.body.details.rule).toBe('BR-P9');
  });
});

describe('GET /api/plans', () => {
  it('lists plans with filters', async () => {
    const all = (await as('technician1').get('/api/plans?size=100').expect(200)).body;
    expect(all.total).toBeGreaterThanOrEqual(62);
    expect(all.items[0].code).toBe('PM-0001');
    const contractors = (
      await as('technician1').get('/api/plans?performed_by=CONTRACTOR').expect(200)
    ).body;
    expect(contractors.total).toBe(8);
    expect(contractors.items.every((p) => p.supplier)).toBe(true);
    const search = (await as('technician1').get('/api/plans?q=legionella').expect(200)).body;
    expect(search.total).toBe(3);
    const hvacParis = (
      await as('technician1')
        .get('/api/plans?category=HVAC&site=Paris La Défense Headquarters|Lyon Part-Dieu Branch')
        .expect(200)
    ).body;
    expect(hvacParis.items.every((p) => p.category === 'HVAC')).toBe(true);
    await as('technician1').get('/api/plans?category=GARDENING').expect(400);
    await as('technician1').get('/api/plans?sort=hours').expect(400);
  });

  it('reads one plan, 404 when unknown', async () => {
    const plan = (await as('technician1').get('/api/plans/1').expect(200)).body;
    expect(plan.code).toBe('PM-0001');
    expect(plan.occurrences.length).toBeGreaterThan(0);
    await as('technician1').get('/api/plans/99999').expect(404);
    await as('technician1').get('/api/plans/abc').expect(400);
  });
});

describe('PUT /api/plans/:id', () => {
  it('moves the series and keeps released visits (BR-P2)', async () => {
    const { item } = (
      await as('supervisor1').post('/api/plans', quarterly({ anchor_week: '2026-W42' }))
    ).body;
    // The visit of W42 is within the release horizon: opening the planner releases it.
    await as('supervisor1').get('/api/planning/timeline').expect(200);
    const res = await as('supervisor1')
      .put(`/api/plans/${item.id}`, { anchor_week: '2026-W45', version: 1 })
      .expect(200);
    expect(res.body).toMatchObject({
      updated: true,
      item: { version: 2, anchor_week: '2026-W45' },
    });
    expect(res.body.item.occurrences.slice(0, 3).map((o) => [o.week, o.status])).toEqual([
      ['2026-W42', 'RELEASED'],
      ['2026-W45', 'PLANNED'],
      ['2027-W05', 'PLANNED'],
    ]);
  });

  it('refuses a stale version (409) and saves nothing when nothing changes', async () => {
    const plan = (await as('supervisor1').get('/api/plans/2')).body;
    const res = await as('supervisor1')
      .put('/api/plans/2', { title: 'Changed', version: plan.version + 1 })
      .expect(409);
    expect(res.body.details.rule).toBe('BR-V1');
    const same = await as('supervisor1')
      .put('/api/plans/2', { title: plan.title, version: plan.version })
      .expect(200);
    expect(same.body).toMatchObject({ updated: false, item: { version: plan.version } });
    await as('supervisor1').put('/api/plans/2', { version: plan.version }).expect(400);
    await as('supervisor1').put('/api/plans/99999', { title: 'x', version: 1 }).expect(404);
  });

  it('removes the planned visits of a deactivated plan and gives them back on reactivation', async () => {
    const { item } = (await as('supervisor1').post('/api/plans', quarterly())).body;
    await as('supervisor1')
      .put(`/api/plans/${item.id}`, { is_active: false, version: 1 })
      .expect(200);
    expect(count('SELECT count(*) FROM plan_occurrences WHERE plan_id = ?', item.id)).toBe(0);
    const back = await as('supervisor1')
      .put(`/api/plans/${item.id}`, { is_active: true, version: 2 })
      .expect(200);
    expect(back.body.item.next_week).toBe('2026-W50');
  });
});

describe('release of work orders (BR-P6)', () => {
  it('creates exactly one work order four weeks before a visit, even when run twice', async () => {
    const { item } = (
      await as('supervisor2').post(
        '/api/plans',
        quarterly({ anchor_week: '2026-W44', estimated_hours: 3 }),
      )
    ).body;
    const first = (await as('supervisor2').post('/api/planning/release').expect(200)).body;
    expect(first.released).toBeGreaterThan(0);
    const again = (await as('supervisor2').post('/api/planning/release').expect(200)).body;
    expect(again).toEqual({ released: 0, work_order_ids: [] });
    await as('technician1').get('/api/planning/timeline').expect(200);

    expect(count('SELECT count(*) FROM work_orders WHERE plan_id = ?', item.id)).toBe(1);
    const wo = (
      await as('supervisor2').get(
        `/api/work-orders/${count('SELECT id FROM work_orders WHERE plan_id = ?', item.id)}`,
      )
    ).body;
    expect(wo).toMatchObject({
      type: 'PREVENTIVE',
      status: 'OPEN',
      title: 'Quarterly service – 2026-W44',
      site: item.site,
      category: 'HVAC',
      estimated_hours: 3,
      created_on: '2026-10-04',
      due_on: '2026-10-30', // Friday of 2026-W44
      planned_week: '2026-W44',
      plan_id: item.id,
      plan: { id: item.id, code: item.code, title: 'Quarterly service' },
      assignee: null,
      created_by: { first_name: 'Sophie' }, // asked by supervisor2
    });
    // The next visit (2027-W05) is beyond the horizon: nothing released yet.
    const plan = (await as('supervisor2').get(`/api/plans/${item.id}`)).body;
    expect(plan.occurrences.map((o) => o.status)).toEqual([
      'RELEASED',
      ...Array(plan.occurrences.length - 1).fill('PLANNED'),
    ]);
  });

  it('skips the visit when its work order is cancelled (BR-P7)', async () => {
    const { item } = (
      await as('supervisor1').post('/api/plans', quarterly({ anchor_week: '2026-W43' }))
    ).body;
    await as('supervisor1').post('/api/planning/release').expect(200);
    const wo = ctx.db.prepare('SELECT id, version FROM work_orders WHERE plan_id = ?').get(item.id);
    await as('supervisor1')
      .put(`/api/work-orders/${wo.id}`, { status: 'CANCELLED', version: wo.version })
      .expect(200);
    const occurrence = ctx.db
      .prepare('SELECT * FROM plan_occurrences WHERE work_order_id = ?')
      .get(wo.id);
    expect(occurrence).toMatchObject({ status: 'SKIPPED', week: '2026-W43' });
    expect(occurrence.skip_reason).toMatch(/cancelled/);
  });

  it('restarts a floating plan from the week its visit is closed (BR-P5)', async () => {
    const { item } = (
      await as('supervisor1').post(
        '/api/plans',
        quarterly({ anchor_week: '2026-W41', schedule_mode: 'FLOATING' }),
      )
    ).body;
    await as('supervisor1').post('/api/planning/release').expect(200);
    let wo = ctx.db.prepare('SELECT id, version FROM work_orders WHERE plan_id = ?').get(item.id);
    await as('supervisor1')
      .put(`/api/work-orders/${wo.id}`, { status: 'IN_PROGRESS', version: wo.version })
      .expect(200);
    wo = ctx.db.prepare('SELECT id, version FROM work_orders WHERE id = ?').get(wo.id);
    await as('supervisor1')
      .put(`/api/work-orders/${wo.id}`, {
        status: 'CLOSED',
        work_report: 'Done.',
        version: wo.version,
      })
      .expect(200);
    // Closed on 2026-10-04 (2026-W40): next visit 13 weeks later (2026 has 53 weeks).
    const plan = (await as('supervisor1').get(`/api/plans/${item.id}`)).body;
    expect(plan).toMatchObject({ anchor_week: '2026-W53', version: 2, next_week: '2026-W41' });
    expect(plan.occurrences.map((o) => o.week).slice(0, 3)).toEqual([
      '2026-W41',
      '2026-W53',
      '2027-W13',
    ]);
    const log = (await as('supervisor1').get('/api/audit-log?entity_type=maintenance_plans')).body;
    expect(log.items[0]).toMatchObject({
      entity_id: item.id,
      changes: { anchor_week: { from: '2026-W41', to: '2026-W53' } },
    });
  });
});

describe('GET /api/planning/timeline', () => {
  it('shows 52 weeks from the current week with the figures (BR-Y1 to BR-Y4)', async () => {
    const t = (await as('supervisor1').get('/api/planning/timeline').expect(200)).body;
    expect(t).toMatchObject({ from: '2026-W40', to: '2027-W38', current_week: '2026-W40' });
    expect(t.weeks).toHaveLength(52);
    expect(t.weeks[1]).toEqual({ week: '2026-W41', monday: '2026-10-05' });
    expect(t.figures).toHaveLength(52);
    // Technicians and supervisors count, by specialty; supervisor1 has none (P17).
    expect(t.capacity).toEqual({
      weekly: 98,
      by_category: { HVAC: 24.5, ELECTRICAL: 49, GENERAL: 24.5 },
    });
    expect(t.figures.some((f) => f.level === 'OVER')).toBe(true);
    for (const f of t.figures) {
      const sum = Object.values(f.by_category).reduce((a, b) => a + b, 0);
      expect(f.planned_hours).toBeCloseTo(sum);
    }
    expect(t.tiles.workload.peak_load).toBeGreaterThan(1);
    expect(Object.keys(t.tiles)).toEqual([
      'workload',
      'trade_balance',
      'peak_week',
      'site_spread',
      'contractor_visits',
    ]);
    // Grouped by site, plans sorted inside, group hours aligned with the weeks.
    expect(t.groups.map((g) => g.site)).toEqual([...t.groups.map((g) => g.site)].sort());
    expect(t.groups[0].hours).toHaveLength(52);
  });

  it('keeps contractor visits out of the load (BR-Y4)', async () => {
    const before = (await as('supervisor1').get('/api/planning/timeline?from=2027-W30&weeks=1'))
      .body;
    await as('supervisor1')
      .post(
        '/api/plans',
        quarterly({
          anchor_week: '2027-W30',
          performed_by: 'CONTRACTOR',
          supplier: 'Coolair',
          estimated_hours: 20,
        }),
      )
      .expect(201);
    const after = (await as('supervisor1').get('/api/planning/timeline?from=2027-W30&weeks=1'))
      .body;
    expect(after.figures[0].planned_hours).toBe(before.figures[0].planned_hours);
    expect(after.figures[0].contractor_visits).toBe(before.figures[0].contractor_visits + 1);
  });

  it('counts the capacity of the trades and sites filtered', async () => {
    const t = (
      await as('supervisor1').get('/api/planning/timeline?category=ELECTRICAL&weeks=4').expect(200)
    ).body;
    // technician2 and supervisor2.
    expect(t.capacity.weekly).toBe(49);
    expect(t.groups.flatMap((g) => g.plans).every((p) => p.category === 'ELECTRICAL')).toBe(true);
    const lyon = (
      await as('supervisor1').get('/api/planning/timeline?site=Lyon Part-Dieu Branch&weeks=4')
    ).body;
    expect(lyon.capacity.weekly).toBe(24.5);
  });

  it('groups by building or trade, and shows a calendar year', async () => {
    const byBuilding = (await as('technician1').get('/api/planning/timeline?group_by=building'))
      .body;
    expect(
      byBuilding.groups.some(
        (g) => g.site === 'Paris La Défense Headquarters' && g.building === 'Tower A',
      ),
    ).toBe(true);
    const byTrade = (await as('technician1').get('/api/planning/timeline?group_by=category')).body;
    expect(byTrade.groups.map((g) => g.category)).toContain('HVAC');
    const year = (await as('technician1').get('/api/planning/timeline?year=2027')).body;
    expect(year).toMatchObject({ from: '2027-W01', to: '2027-W52' });
    expect(
      (await as('technician1').get('/api/planning/timeline?year=2026')).body.weeks,
    ).toHaveLength(53);
  });

  it('validates the query', async () => {
    const tech = as('technician1');
    await tech.get('/api/planning/timeline?from=2027-W01&year=2027').expect(400);
    await tech.get('/api/planning/timeline?from=2027-W53').expect(400);
    await tech.get('/api/planning/timeline?from=2030-W01').expect(400);
    await tech.get('/api/planning/timeline?weeks=60').expect(400);
    await tech.get('/api/planning/timeline?group_by=floor').expect(400);
    await tech.get('/api/planning/timeline?page=2').expect(400);
  });
});

describe('planning settings (P16)', () => {
  it('lets administrators lower the reserve: every week gains capacity, and it is logged', async () => {
    const admin = as('admin');
    const settings = (await admin.get('/api/planning/settings').expect(200)).body;
    expect(settings).toMatchObject({
      daily_hours: 7,
      reserve_percent: 30,
      release_weeks_ahead: 4,
      max_block_hours: 3.5,
      capacity_people: 4,
    });
    const before = (await admin.get('/api/planning/timeline?weeks=4')).body;
    expect(before.figures.every((f) => f.capacity === 98)).toBe(true);

    const res = await admin
      .put('/api/planning/settings', { reserve_percent: 20, version: settings.version })
      .expect(200);
    expect(res.body).toMatchObject({
      updated: true,
      item: {
        reserve_percent: 20,
        version: settings.version + 1,
        updated_by: { first_name: 'Claire' },
      },
    });
    const after = (await admin.get('/api/planning/timeline?weeks=4')).body;
    expect(after.figures.every((f) => f.capacity === 112)).toBe(true);

    const log = (await admin.get('/api/audit-log?entity_type=planning_settings').expect(200)).body;
    expect(log.items[0]).toMatchObject({
      action: 'UPDATE',
      label: 'Planning settings',
      changes: { reserve_percent: { from: 30, to: 20 } },
      user: { first_name: 'Claire' },
    });

    await admin
      .put('/api/planning/settings', { reserve_percent: 30, version: settings.version })
      .expect(409);
    await admin
      .put('/api/planning/settings', { reserve_percent: 90, version: settings.version + 1 })
      .expect(400);
    await admin
      .put('/api/planning/settings', { daily_hours: 7.25, version: settings.version + 1 })
      .expect(400);
    await admin.put('/api/planning/settings', { version: settings.version + 1 }).expect(400);
  });

  it('refuses supervisors (403)', async () => {
    await as('supervisor1')
      .put('/api/planning/settings', { reserve_percent: 10, version: 1 })
      .expect(403);
  });
});
