import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeededApp, expectNoSecrets } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const USERS = { supervisor1: 2, technician1: 4 };
const send = (method, username, url, body) =>
  request(ctx.app)
    [method](url)
    .set('Authorization', `Bearer ${ctx.tokenFor(username)}`)
    .send(body);
const row = (table, id) => ctx.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

/**
 * Supervisor 1 saves version A, then another user saves from the old version: conflict.
 * The other user must be allowed to edit the fields of B (technicians: status, comment, …).
 */
async function assetConflict(id, a, b, clientUser = 'technician1') {
  const { version } = row('assets', id);
  await send('put', 'supervisor1', `/api/assets/${id}`, { ...a, version }).expect(200);
  const res = await send('put', clientUser, `/api/assets/${id}`, { ...b, version }).expect(409);
  return res.body.conflict_id;
}
const resolve = (username, entity, id, body) =>
  send('put', username, `/api/${entity}/${id}/resolve-conflict`, body);

describe('GET /api/conflicts', () => {
  it('lists open conflicts for supervisors and admins only', async () => {
    const conflictId = await assetConflict(60, { comment: 'Checked' }, { status: 'BROKEN_DOWN' });
    await ctx.getAs('technician1', '/api/conflicts').expect(403);
    const res = await ctx.getAs('admin', '/api/conflicts').expect(200);
    const item = res.body.items.find((c) => c.id === conflictId);
    expect(item).toMatchObject({
      entity_type: 'assets',
      entity_id: 60,
      label: expect.stringMatching(/^AST-0060 — /),
      status: 'OPEN',
      server_updated_by: { id: USERS.supervisor1, first_name: 'Julien', last_name: 'Bernard' },
      client_user: { id: USERS.technician1, first_name: 'Karim', last_name: 'Benali' },
      resolution: null,
    });
    expectNoSecrets(res.body);
  });

  it('rejects an unknown status filter', async () => {
    await ctx.getAs('admin', '/api/conflicts?status=CLOSED').expect(400);
  });
});

describe('GET /api/conflicts/:id', () => {
  it('returns both versions, the current record and the divergent fields', async () => {
    const id = await assetConflict(
      61,
      { comment: 'Version A', floor: 'L9' },
      { comment: 'Version B', floor: 'L9', status: 'UNDER_MAINTENANCE' },
      'supervisor2',
    );
    const res = await ctx.getAs('supervisor1', `/api/conflicts/${id}`).expect(200);
    expect(res.body.version_a).toMatchObject({
      comment: 'Version A',
      floor: 'L9',
      status: 'IN_SERVICE',
    });
    expect(res.body.version_a).not.toHaveProperty('code');
    expect(typeof res.body.version_a.maintenance_contract).toBe('boolean');
    expect(res.body.version_b).toEqual({
      comment: 'Version B',
      floor: 'L9',
      status: 'UNDER_MAINTENANCE',
    });
    expect(res.body.divergent_fields).toEqual(['comment', 'status']);
    expect(res.body.current).toMatchObject({ id: 61, version: 2, has_conflict: true });
    expect(res.body).toMatchObject({ base_version: 1, server_version: 2 });
  });

  it('answers 404 and 403', async () => {
    await ctx.getAs('supervisor1', '/api/conflicts/9999').expect(404);
    await ctx.getAs('technician1', '/api/conflicts/1').expect(403);
  });
});

describe('PUT /api/assets/:id/resolve-conflict (BR-V5)', () => {
  it('A keeps the server version and unlocks the record', async () => {
    const id = await assetConflict(62, { comment: 'A' }, { comment: 'B' });
    const res = await resolve('supervisor1', 'assets', 62, { conflict_id: id, choice: 'A' }).expect(
      200,
    );
    expect(res.body).toMatchObject({
      resolved: true,
      version: 3,
      item: { comment: 'A', has_conflict: false },
    });
    expect(row('conflicts', id)).toMatchObject({
      status: 'RESOLVED',
      resolution: 'A',
      resolved_by: USERS.supervisor1,
    });
    // Unlocked: regular updates work again.
    await send('put', 'technician1', '/api/assets/62', { comment: 'After', version: 3 }).expect(
      200,
    );
  });

  it('B applies the client changes', async () => {
    const id = await assetConflict(63, { comment: 'A' }, { comment: 'B', status: 'BROKEN_DOWN' });
    const res = await resolve('admin', 'assets', 63, { conflict_id: id, choice: 'B' }).expect(200);
    expect(res.body.item).toMatchObject({
      comment: 'B',
      status: 'BROKEN_DOWN',
      version: 3,
      has_conflict: false,
      updated_by: { id: 1 },
    });
  });

  it('MERGE applies the chosen value of each field', async () => {
    const id = await assetConflict(
      64,
      { comment: 'A', criticality: 'CRITICAL' },
      { comment: 'B', criticality: 'LOW' },
      'supervisor2',
    );
    const res = await resolve('supervisor1', 'assets', 64, {
      conflict_id: id,
      choice: 'MERGE',
      fields: { comment: 'B', criticality: 'CRITICAL' },
    }).expect(200);
    expect(res.body.item).toMatchObject({ comment: 'B', criticality: 'CRITICAL', version: 3 });
    expect(row('conflicts', id).resolution).toBe('MERGE');
  });

  it('refuses a second resolution (409)', async () => {
    const id = await assetConflict(65, { comment: 'A' }, { comment: 'B' });
    await resolve('supervisor1', 'assets', 65, { conflict_id: id, choice: 'A' }).expect(200);
    const again = await resolve('supervisor1', 'assets', 65, {
      conflict_id: id,
      choice: 'B',
    }).expect(409);
    expect(again.body.message).toMatch(/already resolved/);
  });

  describe('with an open conflict on asset 66', () => {
    let open;
    beforeAll(async () => {
      open = await assetConflict(66, { comment: 'A' }, { comment: 'B' });
    });

    it.each([
      ['MERGE without fields', { choice: 'MERGE' }],
      ['a field outside the conflict', { choice: 'MERGE', fields: { name: 'x' } }],
      ['an invalid merged value', { choice: 'MERGE', fields: { comment: 42 } }],
      ['an unknown choice', { choice: 'C' }],
    ])('refuses %s (400)', async (_case, body) => {
      await resolve('supervisor1', 'assets', 66, { conflict_id: open, ...body }).expect(400);
      expect(row('conflicts', open).status).toBe('OPEN');
    });

    it('answers 404 when the conflict belongs to another record or entity', async () => {
      await resolve('supervisor1', 'assets', 67, { conflict_id: open, choice: 'A' }).expect(404);
      await resolve('supervisor1', 'work-orders', 66, { conflict_id: open, choice: 'A' }).expect(
        404,
      );
    });

    it('is reserved to supervisors and admins (403)', async () => {
      await resolve('technician1', 'assets', 66, { conflict_id: open, choice: 'B' }).expect(403);
    });
  });
});

describe('PUT /api/work-orders/:id/resolve-conflict', () => {
  /** In-progress work order of technician1; supervisor puts it on hold (A), technician closes it (B). */
  async function workOrderConflict() {
    const wo = ctx.db
      .prepare(
        "SELECT * FROM work_orders WHERE status = 'IN_PROGRESS' AND assignee_id = 4 AND has_conflict = 0 ORDER BY id LIMIT 1",
      )
      .get();
    const url = `/api/work-orders/${wo.id}`;
    await send('put', 'supervisor1', url, { status: 'ON_HOLD', version: wo.version }).expect(200);
    const res = await send('put', 'technician1', url, {
      status: 'CLOSED',
      work_report: 'Replaced the fuse.',
      version: wo.version,
    }).expect(409);
    return { wo, conflictId: res.body.conflict_id };
  }

  it('refuses B when it breaks the workflow on top of A (422)', async () => {
    const { wo, conflictId } = await workOrderConflict();
    const res = await resolve('supervisor1', 'work-orders', wo.id, {
      conflict_id: conflictId,
      choice: 'B',
    }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-W4' });
    expect(row('conflicts', conflictId).status).toBe('OPEN');
    expect(row('work_orders', wo.id).has_conflict).toBe(1);
  });

  it('merges the report while keeping the status of A', async () => {
    const { wo, conflictId } = await workOrderConflict();
    const res = await resolve('supervisor1', 'work-orders', wo.id, {
      conflict_id: conflictId,
      choice: 'MERGE',
      fields: { status: 'ON_HOLD', work_report: 'Replaced the fuse.' },
    }).expect(200);
    expect(res.body.item).toMatchObject({
      status: 'ON_HOLD',
      work_report: 'Replaced the fuse.',
      has_conflict: false,
    });
  });
});
