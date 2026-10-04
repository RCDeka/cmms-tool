import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const minimal = {
  name: 'Rooftop chiller',
  site: 'Lyon Part-Dieu Branch',
  category: 'HVAC',
  criticality: 'HIGH',
};
const one = (sql, ...p) =>
  ctx.db
    .prepare(sql)
    .pluck()
    .get(...p);

describe('POST /api/assets', () => {
  it('creates an asset with the next automatic code and defaults', async () => {
    const res = await send('post', 'supervisor1', '/api/assets', minimal).expect(201);
    expect(res.body.created).toBe(true);
    expect(res.body.item).toMatchObject({
      code: 'AST-0501',
      ...minimal,
      status: 'IN_SERVICE',
      maintenance_contract: false,
      comment: null,
      version: 1,
      has_conflict: false,
      updated_by: { id: 2, first_name: 'Julien' },
    });
    expectNoSecrets(res.body);
    const next = await send('post', 'admin', '/api/assets', minimal).expect(201);
    expect(next.body.item.code).toBe('AST-0502');
  });

  it('accepts a typed code in capitals, and every optional field', async () => {
    const res = await send('post', 'admin', '/api/assets', {
      ...minimal,
      code: ' cta-lyon-01 ',
      status: 'UNDER_MAINTENANCE',
      building: 'Main building',
      floor: 'R',
      maintenance_contract: true,
      commissioned_on: '2024-03-01',
      comment: 'Installed during the 2024 works',
    }).expect(201);
    expect(res.body.item).toMatchObject({
      code: 'CTA-LYON-01',
      status: 'UNDER_MAINTENANCE',
      maintenance_contract: true,
      floor: 'R',
    });
    // Typed codes do not disturb the automatic numbering.
    expect((await send('post', 'admin', '/api/assets', minimal).expect(201)).body.item.code).toBe(
      'AST-0503',
    );
  });

  it('refuses a code already used (409)', async () => {
    const res = await send('post', 'supervisor1', '/api/assets', {
      ...minimal,
      code: 'ast-0042',
    }).expect(409);
    expect(res.body.details).toMatchObject({ rule: 'BR-A1', fields: { code: 'Already used' } });
  });

  it.each([
    ['no name', { ...minimal, name: '' }],
    ['no site', { site: undefined, name: 'x', category: 'HVAC', criticality: 'LOW' }],
    ['an unknown category', { ...minimal, category: 'GARDEN' }],
    ['an invalid code', { ...minimal, code: 'AST 42' }],
    ['a server-set field', { ...minimal, version: 3 }],
    ['an impossible date', { ...minimal, commissioned_on: '2025-02-30' }],
  ])('refuses %s (400)', async (_case, body) => {
    await send('post', 'admin', '/api/assets', body).expect(400);
  });

  it('is reserved to supervisors and admins (403)', async () => {
    await send('post', 'technician1', '/api/assets', minimal).expect(403);
  });
});

describe('DELETE /api/assets/:id', () => {
  it('deletes an asset created by mistake, at the version the user saw', async () => {
    const { item } = (
      await send('post', 'admin', '/api/assets', { ...minimal, name: 'Typo' }).expect(201)
    ).body;
    await send('delete', 'supervisor1', `/api/assets/${item.id}?version=1`).expect(204);
    await ctx.getAs('admin', `/api/assets/${item.id}`).expect(404);
  });

  it('keeps assets that have work orders (BR-A3)', async () => {
    const id = one('SELECT asset_id FROM work_orders WHERE asset_id IS NOT NULL LIMIT 1');
    const res = await send('delete', 'admin', `/api/assets/${id}?version=1`).expect(409);
    expect(res.body.details).toEqual({ rule: 'BR-A3' });
    expect(res.body.message).toMatch(/Out of service/);
  });

  it('refuses a stale version (BR-V1) and needs the version', async () => {
    const { item } = (await send('post', 'admin', '/api/assets', minimal).expect(201)).body;
    await send('put', 'admin', `/api/assets/${item.id}`, { comment: 'changed', version: 1 }).expect(
      200,
    );
    const res = await send('delete', 'admin', `/api/assets/${item.id}?version=1`).expect(409);
    expect(res.body.details).toEqual({ rule: 'BR-V1' });
    await send('delete', 'admin', `/api/assets/${item.id}`).expect(400);
    await send('delete', 'admin', `/api/assets/${item.id}?version=2`).expect(204);
  });

  it('removes the resolved conflicts of the asset with it', async () => {
    const { item } = (await send('post', 'admin', '/api/assets', minimal).expect(201)).body;
    await send('put', 'supervisor1', `/api/assets/${item.id}`, { comment: 'A', version: 1 }).expect(
      200,
    );
    const conflict = await send('put', 'technician1', `/api/assets/${item.id}`, {
      comment: 'B',
      version: 1,
    }).expect(409);
    await send('delete', 'admin', `/api/assets/${item.id}?version=2`).expect(409); // locked
    await send('put', 'admin', `/api/assets/${item.id}/resolve-conflict`, {
      conflict_id: conflict.body.conflict_id,
      choice: 'A',
    }).expect(200);
    await send('delete', 'admin', `/api/assets/${item.id}?version=3`).expect(204);
    expect(
      one("SELECT count(*) FROM conflicts WHERE entity_type = 'assets' AND entity_id = ?", item.id),
    ).toBe(0);
  });

  it('answers 404 and 403', async () => {
    await send('delete', 'admin', '/api/assets/99999?version=1').expect(404);
    await send('delete', 'technician1', '/api/assets/1?version=1').expect(403);
  });
});
