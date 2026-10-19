// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../src/db/seed/index.js';
import { NOW, TODAY, createSeededApp, expectNoSecrets } from '../helpers/app.js';
import { TEST_PASSWORD, createTestDb } from '../helpers/db.js';

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
const history = async (url, username = 'technician1') =>
  (await ctx.getAs(username, url).expect(200)).body.items;
const count = (sql, ...p) =>
  ctx.db
    .prepare(sql)
    .pluck()
    .get(...p);

describe('history of the mock data', () => {
  it('has a creation entry for every asset and work order', () => {
    expect(
      count(
        "SELECT count(DISTINCT entity_id) FROM audit_log WHERE entity_type = 'assets' AND action = 'CREATE'",
      ),
    ).toBe(500);
    expect(
      count(
        "SELECT count(DISTINCT entity_id) FROM audit_log WHERE entity_type = 'work_orders' AND action = 'CREATE'",
      ),
    ).toBe(count('SELECT count(*) FROM work_orders'));
  });

  it('tells the status story of a closed work order, newest first', async () => {
    const id = count("SELECT id FROM work_orders WHERE status = 'CLOSED' ORDER BY id LIMIT 1");
    const items = await history(`/api/work-orders/${id}/history`);
    expect(items.map((e) => e.action)).toEqual(['UPDATE', 'UPDATE', 'UPDATE', 'CREATE']);
    expect(items[0].changes.status).toEqual({ from: 'COMPLETED', to: 'CLOSED' });
    expect(items[1].changes.status).toEqual({ from: 'IN_PROGRESS', to: 'COMPLETED' });
    expect(items[1].changes).toHaveProperty('work_report');
    expect(items[2].changes.status).toEqual({ from: 'OPEN', to: 'IN_PROGRESS' });
    expect(items.at(-1).changes.status).toEqual({ from: null, to: 'OPEN' });
    const times = items.map((e) => e.at);
    expect(times).toEqual([...times].sort().reverse());
    expect(items[0].user).toHaveProperty('first_name');
    expectNoSecrets(items);
  });

  it('sends the names of the people mentioned, even to technicians', async () => {
    const wo = count('SELECT id FROM work_orders WHERE assignee_id = 2 ORDER BY id LIMIT 1');
    const res = await ctx.getAs('technician1', `/api/work-orders/${wo}/history`).expect(200);
    expect(res.body.people).toEqual({ 2: { id: 2, first_name: 'Julien', last_name: 'Bernard' } });
    expectNoSecrets(res.body);
  });
});

describe('entries written with each change', () => {
  it('logs an update with the exact field changes, author and version', async () => {
    const before = count('SELECT comment FROM assets WHERE id = 70');
    await send('put', 'technician1', '/api/assets/70', {
      comment: 'Belt checked',
      version: 1,
    }).expect(200);
    const [latest] = await history('/api/assets/70/history');
    expect(latest).toMatchObject({
      action: 'UPDATE',
      changes: { comment: { from: before, to: 'Belt checked' } },
      user: { id: 4, first_name: 'Karim', last_name: 'Benali' },
      version: 2,
      label: expect.stringMatching(/^AST-0070 — /),
    });
  });

  it('does not log a save that changes nothing', async () => {
    const before = count(
      "SELECT count(*) FROM audit_log WHERE entity_type = 'assets' AND entity_id = 70",
    );
    await send('put', 'technician1', '/api/assets/70', {
      comment: 'Belt checked',
      version: 2,
    }).expect(200);
    expect(
      count("SELECT count(*) FROM audit_log WHERE entity_type = 'assets' AND entity_id = 70"),
    ).toBe(before);
  });

  it('logs nothing when the change is refused', async () => {
    const wo = ctx.db
      .prepare("SELECT id, version FROM work_orders WHERE status = 'OPEN' ORDER BY id LIMIT 1")
      .get();
    const before = count(
      "SELECT count(*) FROM audit_log WHERE entity_type = 'work_orders' AND entity_id = ?",
      wo.id,
    );
    await send('put', 'supervisor1', `/api/work-orders/${wo.id}`, {
      status: 'CLOSED',
      version: wo.version,
    }).expect(422);
    expect(
      count(
        "SELECT count(*) FROM audit_log WHERE entity_type = 'work_orders' AND entity_id = ?",
        wo.id,
      ),
    ).toBe(before);
  });

  it('logs the rejected edit of a conflict, then its resolution', async () => {
    await send('put', 'supervisor1', '/api/assets/71', { comment: 'A', version: 1 }).expect(200);
    const conflict = await send('put', 'technician1', '/api/assets/71', {
      comment: 'B',
      version: 1,
    }).expect(409);
    await send('put', 'supervisor1', '/api/assets/71/resolve-conflict', {
      conflict_id: conflict.body.conflict_id,
      choice: 'B',
    }).expect(200);
    const [resolved, rejected] = await history('/api/assets/71/history');
    expect(rejected).toMatchObject({
      action: 'CONFLICT',
      changes: { comment: { from: 'A', to: 'B' } },
      note: { conflict_id: conflict.body.conflict_id, base_version: 1 },
      user: { id: 4 },
    });
    expect(resolved).toMatchObject({
      action: 'RESOLVE',
      changes: { comment: { from: 'A', to: 'B' } },
      note: { conflict_id: conflict.body.conflict_id, choice: 'B' },
      user: { id: 2 },
      version: 3,
    });
  });

  it('logs creations and keeps the history of a deleted asset', async () => {
    const { item } = (
      await send('post', 'admin', '/api/assets', {
        name: 'Temp',
        site: 'Lyon Part-Dieu Branch',
        category: 'HVAC',
        criticality: 'LOW',
      }).expect(201)
    ).body;
    await send('delete', 'admin', `/api/assets/${item.id}?version=1`).expect(204);
    const [deleted, created] = await history(`/api/assets/${item.id}/history`);
    expect(created).toMatchObject({
      action: 'CREATE',
      changes: { code: { from: null, to: item.code }, name: { from: null, to: 'Temp' } },
    });
    expect(deleted).toMatchObject({
      action: 'DELETE',
      label: `${item.code} — Temp`,
      note: { snapshot: { code: item.code } },
    });
  });

  it('logs work order creation with its number', async () => {
    const { item } = (
      await send('post', 'technician2', '/api/work-orders', {
        client_id: randomUUID(),
        type: 'CORRECTIVE',
        title: 'Noise',
        site: 'Lyon Part-Dieu Branch',
      }).expect(201)
    ).body;
    const [created] = await history(`/api/work-orders/${item.id}/history`);
    expect(created).toMatchObject({
      action: 'CREATE',
      label: `${item.number} — Noise`,
      changes: { number: { to: item.number }, status: { to: 'OPEN' } },
      user: { id: 5 },
    });
    expect(created.changes.created_on.to).toBe(TODAY);
  });

  it('answers 404 for a record that never existed', async () => {
    await ctx.getAs('admin', '/api/assets/99999/history').expect(404);
    await ctx.getAs('admin', '/api/work-orders/abc/history').expect(400);
  });
});

describe('GET /api/audit-log', () => {
  it('is reserved to supervisors and admins', async () => {
    await ctx.getAs('technician1', '/api/audit-log').expect(403);
  });

  it('lists every change, newest first, with a type filter', async () => {
    const all = (await ctx.getAs('supervisor1', '/api/audit-log?size=20').expect(200)).body;
    expect(all.items).toHaveLength(20);
    expect(all.total).toBe(count('SELECT count(*) FROM audit_log'));
    const times = all.items.map((e) => e.at);
    expect(times).toEqual([...times].sort().reverse());
    const wo = (await ctx.getAs('admin', '/api/audit-log?entity_type=work_orders').expect(200))
      .body;
    expect(wo.items.every((e) => e.entity_type === 'work_orders')).toBe(true);
    await ctx.getAs('admin', '/api/audit-log?entity_type=nope').expect(400);
  });
});

describe('seeded demo conflicts', () => {
  it('record the server change with the real old value, then the rejected edit', async () => {
    const db = createTestDb();
    try {
      await seedDatabase(db.db, {
        password: TEST_PASSWORD,
        today: TODAY,
        now: NOW,
        withConflicts: true,
      });
      const rows = db.db
        .prepare(
          "SELECT action, changes FROM audit_log WHERE entity_type = 'assets' AND entity_id = (SELECT entity_id FROM conflicts WHERE entity_type = 'assets' ORDER BY id LIMIT 1) ORDER BY at",
        )
        .all()
        .map((r) => ({ action: r.action, changes: JSON.parse(r.changes) }));
      expect(rows.map((r) => r.action)).toEqual(['CREATE', 'UPDATE', 'CONFLICT']);
      expect(rows[1].changes.comment.to).toBe('Annual check done, no remark.');
      // The "from" value is the comment the asset was created with (or no value).
      expect(rows[1].changes.comment.from).toBe(rows[0].changes.comment?.to ?? null);
    } finally {
      db.cleanup();
    }
  });
});
