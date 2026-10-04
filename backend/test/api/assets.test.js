import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CRITICALITIES } from '../../src/rules/enums.js';
import { createSeededApp, expectNoSecrets } from '../helpers/app.js';

let ctx;
const get = (url, username = 'technician1') => ctx.getAs(username, url);

beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const ASSET_KEYS = [
  'id',
  'code',
  'name',
  'site',
  'building',
  'floor',
  'category',
  'subcategory',
  'criticality',
  'status',
  'brand',
  'model',
  'serial_number',
  'commissioned_on',
  'last_serviced_on',
  'supplier',
  'maintenance_contract',
  'responsible_technician',
  'exact_location',
  'comment',
  'version',
  'has_conflict',
  'updated_by',
  'created_at',
  'updated_at',
].sort();

describe('GET /api/assets', () => {
  it('requires a token', async () => {
    await request(ctx.app).get('/api/assets').expect(401);
  });

  it('returns the first page of 50, sorted by code, with the documented shape', async () => {
    const res = await get('/api/assets').expect(200);
    expect(res.body).toMatchObject({ total: 500, page: 1, pages: 10 });
    expect(res.body.items).toHaveLength(50);
    expect(res.body.items[0].code).toBe('AST-0001');
    expect(res.body.items[49].code).toBe('AST-0050');
    const asset = res.body.items[0];
    expect(Object.keys(asset).sort()).toEqual(ASSET_KEYS);
    expect(typeof asset.maintenance_contract).toBe('boolean');
    expect(asset.has_conflict).toBe(false);
    expectNoSecrets(res.body);
  });

  it('returns complete records, identical to GET /:id (D7)', async () => {
    const list = await get('/api/assets?page=2&size=5').expect(200);
    for (const item of list.body.items) {
      const detail = await get(`/api/assets/${item.id}`).expect(200);
      expect(detail.body).toEqual(item);
    }
  });

  it('pages through the end and past it', async () => {
    const last = await get('/api/assets?page=10').expect(200);
    expect(last.body.items.at(-1).code).toBe('AST-0500');
    const beyond = await get('/api/assets?page=11').expect(200);
    expect(beyond.body).toMatchObject({ total: 500, page: 11, pages: 10, items: [] });
    const small = await get('/api/assets?size=100').expect(200);
    expect(small.body.pages).toBe(5);
  });

  it('sorts criticality in business order, not alphabetically', async () => {
    const res = await get('/api/assets?sort=criticality&order=desc&size=100').expect(200);
    const ranks = res.body.items.map((a) => CRITICALITIES.indexOf(a.criticality));
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(res.body.items[0].criticality).toBe('CRITICAL');
  });

  it.each([
    ['size above 100', '?size=101', 'size'],
    ['unknown sort', '?sort=password_hash', 'sort'],
    ['bad order', '?order=up', 'order'],
    ['unknown parameter', '?pagesize=10', 'pagesize'],
  ])('answers 400 for %s', async (_case, query, field) => {
    const res = await get(`/api/assets${query}`).expect(400);
    expect(res.body.details.fields).toHaveProperty(field);
  });
});

describe('GET /api/assets/:id', () => {
  it('returns one asset', async () => {
    const res = await get('/api/assets/123').expect(200);
    expect(res.body).toMatchObject({ id: 123, code: 'AST-0123' });
  });

  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    const missing = await get('/api/assets/9999').expect(404);
    expect(missing.body.message).toBe('Asset not found');
    await get('/api/assets/abc').expect(400);
    await get('/api/assets/0').expect(400);
  });
});

describe('GET /api/assets/search', () => {
  it('matches code text, case-insensitively, ordered by code', async () => {
    const res = await get('/api/assets/search?q=ast-001').expect(200);
    expect(res.body.total).toBe(10);
    expect(res.body.items.map((a) => a.code)).toEqual(
      Array.from({ length: 10 }, (_, i) => `AST-001${i}`),
    );
  });

  it('combines text and exact filters', async () => {
    const site = 'Saclay Data Center';
    const res = await get(
      `/api/assets/search?category=HVAC&site=${encodeURIComponent(site)}&limit=200`,
    ).expect(200);
    const expected = ctx.db
      .prepare("SELECT count(*) FROM assets WHERE category = 'HVAC' AND site = ?")
      .pluck()
      .get(site);
    expect(res.body.total).toBe(expected);
    expect(res.body.items).toHaveLength(expected);
    expect(res.body.items.every((a) => a.category === 'HVAC' && a.site === site)).toBe(true);
  });

  it('searches brand, model and serial number', async () => {
    const asset = (await get('/api/assets/42').expect(200)).body;
    for (const field of ['brand', 'model', 'serial_number']) {
      const res = await get(`/api/assets/search?q=${encodeURIComponent(asset[field])}&limit=200`);
      expect(res.body.items.map((a) => a.id)).toContain(42);
    }
  });

  it('applies the limit but reports the full total', async () => {
    const res = await get('/api/assets/search?category=HVAC&limit=5').expect(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.total).toBeGreaterThan(5);
  });

  it('treats LIKE wildcards literally', async () => {
    const res = await get('/api/assets/search?q=%25').expect(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });

  it.each(['?status=BROKEN', '?category=hvac', '?limit=201', '?q=x&foo=1'])(
    'answers 400 for %s',
    async (query) => {
      await get(`/api/assets/search${query}`).expect(400);
    },
  );
});
