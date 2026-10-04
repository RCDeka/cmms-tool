import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATEGORIES, WORK_ORDER_STATUSES } from '../../src/rules/enums.js';
import { createSeededApp, expectNoSecrets } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

describe('GET /api/reference-data', () => {
  it('returns sites from the data and enum lists', async () => {
    const res = await ctx.getAs('technician1', '/api/reference-data').expect(200);
    expect(res.body.sites).toEqual([
      'Lille Grand Place Branch',
      'Lyon Part-Dieu Branch',
      'Marseille Prado Branch',
      'Paris La Défense Headquarters',
      'Saclay Data Center',
    ]);
    expect(res.body.categories).toEqual(CATEGORIES);
    expect(res.body.work_order_statuses).toEqual(WORK_ORDER_STATUSES);
    expect(Object.keys(res.body).sort()).toEqual([
      'asset_statuses',
      'categories',
      'criticalities',
      'sites',
      'work_order_priorities',
      'work_order_statuses',
      'work_order_types',
    ]);
  });
});

describe('GET /api/users', () => {
  it('is forbidden to technicians', async () => {
    const res = await ctx.getAs('technician1', '/api/users').expect(403);
    expect(res.body).toMatchObject({ statusCode: 403, error: 'Forbidden' });
  });

  it.each(['supervisor1', 'admin'])('lists assignable users for %s', async (username) => {
    const res = await ctx.getAs(username, '/api/users').expect(200);
    expect(res.body.map((u) => u.role).sort()).toEqual([
      'SUPERVISOR',
      'SUPERVISOR',
      'TECHNICIAN',
      'TECHNICIAN',
    ]);
    expect(Object.keys(res.body[0]).sort()).toEqual(
      ['id', 'last_name', 'first_name', 'role', 'site', 'specialty'].sort(),
    );
    expectNoSecrets(res.body);
  });
});

describe('API with a valid token', () => {
  it('answers 404 for unknown routes', async () => {
    const res = await ctx.getAs('admin', '/api/nothing-here').expect(404);
    expect(res.body.message).toBe('No route for GET /api/nothing-here');
  });
});

describe('password data', () => {
  it('never appears in any read endpoint', async () => {
    for (const url of [
      '/api/auth/me',
      '/api/assets?size=100',
      '/api/assets/1',
      '/api/assets/search?q=a&limit=200',
      '/api/work-orders?size=100',
      '/api/work-orders/1',
      '/api/work-orders/stats',
      '/api/reference-data',
      '/api/users',
    ]) {
      const res = await ctx.getAs('admin', url).expect(200);
      expectNoSecrets(res.body);
    }
  });
});
