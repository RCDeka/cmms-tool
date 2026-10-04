import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isOverdue } from '../../src/rules/kpi.js';
import { TODAY, createSeededApp } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const get = async (url, username = 'supervisor1') =>
  (await ctx.getAs(username, url).expect(200)).body;
const count = (sql, ...p) =>
  ctx.db
    .prepare(sql)
    .pluck()
    .get(...p);
const send = (method, username, url, body) =>
  request(ctx.app)
    [method](url)
    .set('Authorization', `Bearer ${ctx.tokenFor(username)}`)
    .send(body);

describe('GET /api/assets with search and filters', () => {
  it('finds words without their accents, across fields', async () => {
    const res = await get('/api/assets?q=defense&size=100');
    expect(res.total).toBe(
      count("SELECT count(*) FROM assets WHERE site = 'Paris La Défense Headquarters'"),
    );
    expect(res.items.every((a) => a.site === 'Paris La Défense Headquarters')).toBe(true);
  });

  it('matches word prefixes and requires every word', async () => {
    const chillers = count("SELECT count(*) FROM assets WHERE subcategory = 'Chiller'");
    expect((await get('/api/assets?q=chil')).total).toBeGreaterThanOrEqual(chillers);
    const lyon = await get('/api/assets?q=chiller%20lyon&size=100');
    expect(
      lyon.items.every(
        (a) => a.site === 'Lyon Part-Dieu Branch' && /chiller/i.test(`${a.name} ${a.subcategory}`),
      ),
    ).toBe(true);
  });

  it('combines exact filters, and the pages follow them', async () => {
    const broken = await get('/api/assets?status=BROKEN_DOWN&size=10');
    expect(broken).toMatchObject({ total: 20, pages: 2 });
    expect(broken.items.every((a) => a.status === 'BROKEN_DOWN')).toBe(true);
    const hvac = await get('/api/assets?status=BROKEN_DOWN&category=HVAC&size=100');
    expect(hvac.total).toBe(
      count("SELECT count(*) FROM assets WHERE status = 'BROKEN_DOWN' AND category = 'HVAC'"),
    );
    expect(
      (await get('/api/assets?site=Saclay%20Data%20Center&sort=criticality&order=desc')).items[0]
        .criticality,
    ).toBe('CRITICAL');
  });

  it('treats search syntax as plain words and refuses unknown values', async () => {
    expect((await get('/api/assets?q=NEAR(%22x%22%20OR')).total).toBe(0);
    await ctx.getAs('admin', '/api/assets?status=BROKEN').expect(400);
    await ctx.getAs('admin', `/api/assets?q=${'x'.repeat(101)}`).expect(400);
  });

  it('keeps the index in sync with creations, changes and deletions', async () => {
    const { item } = (
      await send('post', 'admin', '/api/assets', {
        name: 'Zebrafinch pump',
        site: 'Lille Grand Place Branch',
        category: 'PLUMBING',
        criticality: 'LOW',
      }).expect(201)
    ).body;
    expect((await get('/api/assets?q=zebrafinch')).items.map((a) => a.id)).toEqual([item.id]);
    await send('put', 'admin', `/api/assets/${item.id}`, {
      name: 'Kingfisher pump',
      version: 1,
    }).expect(200);
    expect((await get('/api/assets?q=zebrafinch')).total).toBe(0);
    expect((await get('/api/assets?q=kingfisher')).total).toBe(1);
    await send('delete', 'admin', `/api/assets/${item.id}?version=2`).expect(204);
    expect((await get('/api/assets?q=kingfisher')).total).toBe(0);
  });
});

describe('GET /api/work-orders with search and filters', () => {
  it('searches titles and work reports', async () => {
    const res = await get('/api/work-orders?q=leak&size=100');
    expect(res.total).toBeGreaterThan(0);
    expect(
      res.items.every((w) => /leak/i.test(`${w.title} ${w.description} ${w.work_report}`)),
    ).toBe(true);
    const report = await get('/api/work-orders?q=compliance');
    expect(report.items.every((w) => /compliance/i.test(w.work_report ?? ''))).toBe(true);
  });

  it('filters by several statuses at once', async () => {
    const res = await get('/api/work-orders?status=OPEN,IN_PROGRESS,ON_HOLD&size=100');
    expect(res.total).toBe(
      count("SELECT count(*) FROM work_orders WHERE status IN ('OPEN','IN_PROGRESS','ON_HOLD')"),
    );
    await ctx.getAs('admin', '/api/work-orders?status=OPEN,DONE').expect(400);
  });

  it('accepts several values for every list filter', async () => {
    const wo = await get('/api/work-orders?priority=URGENT,HIGH&category=HVAC,PLUMBING&size=100');
    expect(wo.total).toBe(
      count(
        "SELECT count(*) FROM work_orders WHERE priority IN ('URGENT','HIGH') AND category IN ('HVAC','PLUMBING')",
      ),
    );
    expect(wo.total).toBeGreaterThan(0);
    const people = await get('/api/work-orders?assignee_id=4,5&size=100');
    expect(people.total).toBe(
      count('SELECT count(*) FROM work_orders WHERE assignee_id IN (4, 5)'),
    );
    const sites = ctx.db.prepare('SELECT DISTINCT site FROM assets ORDER BY site LIMIT 2').all();
    const joined = encodeURIComponent(sites.map((s) => s.site).join('|'));
    const assets = await get(`/api/assets?site=${joined}&status=IN_SERVICE,BROKEN_DOWN&size=100`);
    expect(assets.total).toBe(
      count(
        "SELECT count(*) FROM assets WHERE site IN (SELECT DISTINCT site FROM assets ORDER BY site LIMIT 2) AND status IN ('IN_SERVICE','BROKEN_DOWN')",
      ),
    );
    expect(assets.total).toBeGreaterThan(0);
    await ctx.getAs('admin', '/api/assets?category=HVAC,NOPE').expect(400);
    await ctx.getAs('admin', '/api/work-orders?priority=URGENT,NOPE').expect(400);
    await ctx.getAs('admin', '/api/work-orders?assignee_id=4,x').expect(400);
  });

  it("filters the user's own work and overdue work like the dashboard", async () => {
    const mine = await get('/api/work-orders?mine=true&size=100', 'technician1');
    expect(mine.total).toBe(count('SELECT count(*) FROM work_orders WHERE assignee_id = 4'));
    expect(mine.items.every((w) => w.assignee_id === 4)).toBe(true);
    const overdue = await get('/api/work-orders?overdue=true&size=100');
    const expected = ctx.db
      .prepare('SELECT status, due_on FROM work_orders')
      .all()
      .filter((w) => isOverdue(w, TODAY)).length;
    expect(overdue.total).toBe(expected);
    expect((await get('/api/dashboard')).kpis.overdue_work_orders).toBe(expected);
    await ctx.getAs('admin', '/api/work-orders?mine=yes').expect(400);
  });

  it('combines priority, type, category, site and assignee filters', async () => {
    const res = await get(
      '/api/work-orders?priority=URGENT&type=CORRECTIVE&assignee_id=4&size=100',
    );
    expect(
      res.items.every(
        (w) => w.priority === 'URGENT' && w.type === 'CORRECTIVE' && w.assignee_id === 4,
      ),
    ).toBe(true);
    expect(res.total).toBe(
      count(
        "SELECT count(*) FROM work_orders WHERE priority = 'URGENT' AND type = 'CORRECTIVE' AND assignee_id = 4",
      ),
    );
  });

  it('finds a new work order by its number', async () => {
    const { item } = (
      await send('post', 'supervisor1', '/api/work-orders', {
        client_id: randomUUID(),
        type: 'CORRECTIVE',
        title: 'Flickering lights',
        site: 'Lyon Part-Dieu Branch',
      }).expect(201)
    ).body;
    expect((await get(`/api/work-orders?q=${item.number}`)).items.map((w) => w.id)).toEqual([
      item.id,
    ]);
  });
});
