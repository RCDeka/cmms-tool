import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../../src/lib/dates.js';
import {
  CATEGORIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from '../../src/rules/enums.js';
import { TODAY, createSeededApp, expectNoSecrets } from '../helpers/app.js';

let ctx;
const get = (url, username = 'technician2') => ctx.getAs(username, url);
const count = (sql, ...params) =>
  ctx.db
    .prepare(sql)
    .pluck()
    .get(...params);

beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const WORK_ORDER_KEYS = [
  'id',
  'number',
  'type',
  'status',
  'priority',
  'title',
  'description',
  'asset_id',
  'asset',
  'site',
  'location',
  'category',
  'assignee_id',
  'assignee',
  'supervisor_id',
  'supervisor',
  'created_on',
  'due_on',
  'started_on',
  'closed_on',
  'estimated_hours',
  'actual_hours',
  'work_report',
  'client_id',
  'created_by',
  'version',
  'has_conflict',
  'updated_by',
  'review_status',
  'reviewed_by',
  'reviewed_at',
  'review_note',
  'created_at',
  'updated_at',
].sort();

describe('GET /api/work-orders', () => {
  it('returns 5 pages, newest first, with the documented shape', async () => {
    const res = await get('/api/work-orders').expect(200);
    expect(res.body).toMatchObject({ total: 207, page: 1, pages: 5 });
    expect(res.body.items).toHaveLength(50);
    const dates = res.body.items.map((w) => w.created_on);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(Object.keys(res.body.items[0]).sort()).toEqual(WORK_ORDER_KEYS);
    expectNoSecrets(res.body);
  });

  it('sorts priority in business order', async () => {
    const res = await get('/api/work-orders?sort=priority&order=desc&size=100').expect(200);
    const ranks = res.body.items.map((w) => WORK_ORDER_PRIORITIES.indexOf(w.priority));
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    expect(res.body.items[0].priority).toBe('URGENT');
  });

  it('sorts by title, site and assignee name (table columns)', async () => {
    const names = (items) =>
      items.map((w) => (w.assignee ? `${w.assignee.first_name} ${w.assignee.last_name}` : ''));
    const byName = (await get('/api/work-orders?sort=assignee&order=asc&size=100').expect(200)).body
      .items;
    const named = names(byName).filter(Boolean);
    expect(names(byName)).toEqual([...named.sort(), ...names(byName).filter((n) => !n)]);
    const byDue = [];
    for (const page of [1, 2, 3]) {
      const url = `/api/work-orders?sort=due_on&order=desc&size=100&page=${page}`;
      byDue.push(...(await get(url).expect(200)).body.items);
    }
    const dates = byDue.map((w) => w.due_on);
    const firstEmpty = dates.indexOf(null);
    expect(firstEmpty).toBeGreaterThan(0);
    expect(dates.slice(firstEmpty).every((d) => d === null)).toBe(true); // undated last
    expect(dates.slice(0, firstEmpty)).toEqual([...dates.slice(0, firstEmpty)].sort().reverse());
    const byTitle = (
      await get('/api/work-orders?sort=title&order=desc&size=100').expect(200)
    ).body.items.map((w) => w.title);
    expect(byTitle).toEqual([...byTitle].sort().reverse());
    const bySite = (
      await get('/api/work-orders?sort=site&order=asc&size=100').expect(200)
    ).body.items.map((w) => w.site);
    expect(bySite).toEqual([...bySite].sort());
  });

  it('answers 400 for a sort key outside the whitelist', async () => {
    await get('/api/work-orders?sort=asset').expect(400);
  });
});

describe('GET /api/work-orders/:id', () => {
  it('includes the asset summary and user references', async () => {
    const id = count(
      'SELECT min(id) FROM work_orders WHERE asset_id IS NOT NULL AND assignee_id IS NOT NULL',
    );
    const res = await get(`/api/work-orders/${id}`).expect(200);
    const row = ctx.db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    const asset = ctx.db
      .prepare('SELECT id, code, name, site, status FROM assets WHERE id = ?')
      .get(row.asset_id);
    expect(res.body.asset).toEqual(asset);
    expect(res.body.assignee).toEqual({
      id: row.assignee_id,
      ...ctx.db
        .prepare('SELECT last_name, first_name FROM users WHERE id = ?')
        .get(row.assignee_id),
    });
    expect(res.body.created_by.id).toBe(row.created_by);
    expect(res.body.has_conflict).toBe(false);
  });

  it('returns asset: null for a work order without asset', async () => {
    const id = count('SELECT min(id) FROM work_orders WHERE asset_id IS NULL');
    const res = await get(`/api/work-orders/${id}`).expect(200);
    expect(res.body).toMatchObject({ asset_id: null, asset: null });
  });

  it('answers 404 and 400', async () => {
    await get('/api/work-orders/9999').expect(404);
    await get('/api/work-orders/stats2').expect(400);
  });
});

describe('GET /api/work-orders/stats', () => {
  const sum = (list) => list.reduce((s, x) => s + x.count, 0);

  it('covers every enum value, zeros included, and sums to the period count', async () => {
    const res = await get('/api/work-orders/stats').expect(200);
    expect(res.body.period).toBe(30);
    expect(res.body.by_status.map((s) => s.status)).toEqual(WORK_ORDER_STATUSES);
    expect(res.body.by_type.map((t) => t.type)).toEqual(WORK_ORDER_TYPES);
    expect(res.body.by_category.slice(0, CATEGORIES.length).map((c) => c.category)).toEqual(
      CATEGORIES,
    );
    // The seed creates every work order in the last 30 days.
    for (const list of [res.body.by_category, res.body.by_status, res.body.by_type]) {
      expect(sum(list)).toBe(207);
    }
  });

  it('counts work orders without category as UNSPECIFIED', async () => {
    const res = await get('/api/work-orders/stats').expect(200);
    const unspecified = count('SELECT count(*) FROM work_orders WHERE category IS NULL');
    expect(unspecified).toBeGreaterThan(0);
    expect(res.body.by_category.at(-1)).toEqual({ category: 'UNSPECIFIED', count: unspecified });
  });

  it('limits counts to the last N days, today included', async () => {
    const res = await get('/api/work-orders/stats?period=7').expect(200);
    const expected = count(
      'SELECT count(*) FROM work_orders WHERE created_on >= ?',
      addDays(TODAY, -6),
    );
    expect(sum(res.body.by_status)).toBe(expected);
    expect(expected).toBeLessThan(207);
  });

  it.each(['?period=0', '?period=366', '?period=abc', '?days=7'])(
    'answers 400 for %s',
    async (q) => {
      await get(`/api/work-orders/stats${q}`).expect(400);
    },
  );
});
