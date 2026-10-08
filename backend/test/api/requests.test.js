import { randomUUID } from 'node:crypto';
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
const get = (username, url) => ctx.getAs(username, url);
const one = (sql, ...params) =>
  ctx.db
    .prepare(sql)
    .pluck()
    .get(...params);
const userId = (username) => one('SELECT id FROM users WHERE username = ?', username);

const newRequest = (overrides = {}) => ({
  client_id: randomUUID(),
  title: 'Door does not close',
  description: 'The door of meeting room 5.02 stays open.',
  site: 'Paris La Défense Headquarters',
  location: 'Tower B, floor 5, meeting room 5.02',
  ...overrides,
});

const REQUEST_KEYS = [
  'id',
  'number',
  'status',
  'priority',
  'title',
  'description',
  'site',
  'location',
  'category',
  'created_on',
  'due_on',
  'started_on',
  'closed_on',
  'work_report',
  'review_status',
  'review_note',
  'reviewed_at',
  'client_id',
  'created_at',
  'updated_at',
  'assignee',
  'comment_count',
  'last_comment_at',
].sort();

describe('staff access (D46)', () => {
  it.each([
    '/api/assets',
    '/api/assets/1',
    '/api/work-orders',
    '/api/work-orders/1',
    '/api/work-orders/stats',
    '/api/work-orders/1/history',
    '/api/work-orders/1/comments',
    '/api/assets/1/history',
    '/api/dashboard',
    '/api/conflicts',
    '/api/audit-log',
    '/api/users',
    '/api/admin/users',
  ])('refuses %s to staff (403)', async (url) => {
    await get('user1', url).expect(403);
  });

  it('refuses work order writes to staff', async () => {
    await send('post', 'user1', '/api/work-orders', {
      client_id: randomUUID(),
      title: 'x',
      type: 'CORRECTIVE',
      site: 'Lyon Part-Dieu Branch',
    }).expect(403);
    await send('put', 'user1', '/api/work-orders/1', { priority: 'URGENT', version: 1 }).expect(
      403,
    );
  });

  it('gives staff the reference data, their profile and the suggestion button', async () => {
    const ref = await get('user1', '/api/reference-data').expect(200);
    expect(ref.body.sites).toContain('Paris La Défense Headquarters');
    const me = await get('user1', '/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ username: 'user1', role: 'STAFF', power_user: false });
    await send('post', 'user1', '/api/feedback', {
      message: 'A photo field would help',
      page_path: '/requests/new',
      page_title: 'New request',
    }).expect(201);
  });

  it.each(['admin', 'supervisor1', 'technician1'])(
    'keeps /api/requests for staff only (%s gets 403)',
    async (username) => {
      await get(username, '/api/requests').expect(403);
      await send('post', username, '/api/requests', newRequest()).expect(403);
    },
  );
});

describe('GET /api/requests', () => {
  it("lists the user's unfinished requests by default, newest first", async () => {
    const res = await get('user1', '/api/requests').expect(200);
    expect(res.body).toMatchObject({ total: 4, page: 1, pages: 1 });
    expect(res.body.items.map((r) => r.status)).toEqual(['OPEN', 'OPEN', 'IN_PROGRESS', 'ON_HOLD']);
    const created = res.body.items.map((r) => r.created_at);
    expect(created).toEqual([...created].sort().reverse());
    expect(Object.keys(res.body.items[0]).sort()).toEqual(REQUEST_KEYS);
    expectNoSecrets(res.body);
  });

  it('gives the assignee and the comment count', async () => {
    const { body } = await get('user1', '/api/requests').expect(200);
    const noise = body.items.find((r) => r.title === 'Strange noise in the ceiling');
    expect(noise.assignee).toEqual({
      id: userId('technician1'),
      first_name: 'Karim',
      last_name: 'Benali',
    });
    expect(noise.comment_count).toBe(2);
    expect(noise.last_comment_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const cold = body.items.find((r) => r.title === 'Office too cold since this morning');
    expect(cold).toMatchObject({ assignee: null, comment_count: 0, last_comment_at: null });
  });

  it('lists finished requests too with scope=all', async () => {
    const res = await get('user1', '/api/requests?scope=all').expect(200);
    expect(res.body.total).toBe(7);
    expect(res.body.items.filter((r) => r.status === 'CLOSED')).toHaveLength(2);
    expect(res.body.items.find((r) => r.status === 'CANCELLED')).toMatchObject({
      review_status: 'REJECTED',
      review_note: expect.stringMatching(/workplace team/),
    });
  });

  it('pages the list', async () => {
    const res = await get('user1', '/api/requests?scope=all&size=4&page=2').expect(200);
    expect(res.body).toMatchObject({ total: 7, page: 2, pages: 2 });
    expect(res.body.items).toHaveLength(3);
  });

  it('refuses an unknown scope or parameter (400)', async () => {
    await get('user1', '/api/requests?scope=closed').expect(400);
    await get('user1', '/api/requests?mine=true').expect(400);
  });

  it('requires a token (401)', async () => {
    await request(ctx.app).get('/api/requests').expect(401);
  });
});

describe('GET /api/requests/:id', () => {
  const idOf = (title) => one('SELECT id FROM work_orders WHERE title = ?', title);

  it('returns the request with its status steps and the conversation', async () => {
    const id = idOf('Badge reader at the garage door does not work');
    const res = await get('user1', `/api/requests/${id}`).expect(200);
    expect(res.body).toMatchObject({ id, status: 'ON_HOLD', category: 'SECURITY' });
    expect(res.body.status_history.map((s) => s.status)).toEqual([
      'OPEN',
      'APPROVED',
      'IN_PROGRESS',
      'ON_HOLD',
    ]);
    expect(res.body.comments.map((c) => c.user_role)).toEqual(['SUPERVISOR', 'STAFF']);
    expect(res.body.comments[0]).toMatchObject({
      work_order_id: id,
      user: { first_name: 'Julien', last_name: 'Bernard' },
    });
    expectNoSecrets(res.body);
  });

  it("answers 404 for someone else's work order, so it reveals nothing", async () => {
    const other = one('SELECT id FROM work_orders WHERE created_by <> ? LIMIT 1', userId('user1'));
    await get('user1', `/api/requests/${other}`).expect(404);
    await get('user1', '/api/requests/99999').expect(404);
    await get('user1', '/api/requests/abc').expect(400);
  });
});

describe('POST /api/requests', () => {
  it('creates an unassigned corrective work order with the next number (201)', async () => {
    const before = one("SELECT max(number) FROM work_orders WHERE number LIKE 'WO-2026-%'");
    const body = newRequest();
    const res = await send('post', 'user1', '/api/requests', body).expect(201);
    expect(res.body.created).toBe(true);
    expect(res.body.item).toMatchObject({
      status: 'OPEN',
      priority: 'NORMAL', // "I don't know" → the default
      category: null, // "I don't know" → unspecified
      title: body.title,
      location: body.location,
      site: body.site,
      assignee: null,
      comment_count: 0,
    });
    expect(res.body.item.number > before).toBe(true);
    const row = ctx.db.prepare('SELECT * FROM work_orders WHERE id = ?').get(res.body.item.id);
    expect(row).toMatchObject({
      type: 'CORRECTIVE',
      created_by: userId('user1'),
      assignee_id: null,
      supervisor_id: null,
      asset_id: null,
    });
    // The maintenance team sees it as a work order, location included.
    const wo = await get('supervisor1', `/api/work-orders/${row.id}`).expect(200);
    expect(wo.body).toMatchObject({ location: body.location, created_by: { id: userId('user1') } });
    // Logged like any creation (BR-L1).
    expect(
      one(
        "SELECT count(*) FROM audit_log WHERE entity_type = 'work_orders' AND entity_id = ? AND action = 'CREATE'",
        row.id,
      ),
    ).toBe(1);
  });

  it('keeps the category and urgency the requester chose', async () => {
    const res = await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ category: 'PLUMBING', priority: 'HIGH' }),
    ).expect(201);
    expect(res.body.item).toMatchObject({ category: 'PLUMBING', priority: 'HIGH' });
  });

  it('returns the same request when the client_id is sent again (200)', async () => {
    const body = newRequest();
    const first = await send('post', 'user1', '/api/requests', body).expect(201);
    const again = await send('post', 'user1', '/api/requests', body).expect(200);
    expect(again.body).toEqual({ created: false, item: first.body.item });
  });

  it('requires a title, a site and a location (400)', async () => {
    for (const field of ['title', 'site', 'location', 'client_id']) {
      const res = await send(
        'post',
        'user1',
        '/api/requests',
        newRequest({ [field]: undefined }),
      ).expect(400);
      expect(Object.keys(res.body.details.fields)).toContain(field);
    }
    await send('post', 'user1', '/api/requests', newRequest({ location: '   ' })).expect(400);
  });

  it('refuses the fields the maintenance team sets (400)', async () => {
    for (const extra of [
      { assignee_id: userId('technician1') },
      { type: 'IMPROVEMENT' },
      { asset_id: 1 },
      { due_on: '2026-10-20' },
    ]) {
      const res = await send('post', 'user1', '/api/requests', newRequest(extra)).expect(400);
      expect(Object.values(res.body.details.fields)).toContain('Unknown field');
    }
  });

  it('makes the location searchable for the maintenance team', async () => {
    await send(
      'post',
      'user1',
      '/api/requests',
      newRequest({ location: 'Tower B, floor 3, Zanzibar room' }),
    ).expect(201);
    const res = await get('supervisor1', '/api/work-orders?q=zanzibar').expect(200);
    expect(res.body.items.map((w) => w.location)).toEqual(['Tower B, floor 3, Zanzibar room']);
  });
});

describe('comments', () => {
  const requestId = () =>
    one("SELECT id FROM work_orders WHERE title = 'Office too cold since this morning'");

  it('lets the requester add a comment to their request (201)', async () => {
    const id = requestId();
    const res = await send('post', 'user1', `/api/requests/${id}/comments`, {
      body: '  Still 17 °C this afternoon.  ',
    }).expect(201);
    expect(res.body).toMatchObject({
      created: true,
      item: { work_order_id: id, body: 'Still 17 °C this afternoon.', user_role: 'STAFF' },
    });
    const detail = await get('user1', `/api/requests/${id}`).expect(200);
    expect(detail.body.comments.at(-1).body).toBe('Still 17 °C this afternoon.');
    expect(detail.body.comment_count).toBe(detail.body.comments.length);
  });

  it('shows the conversation to the maintenance team, who can answer', async () => {
    const id = requestId();
    const answer = await send('post', 'technician2', `/api/work-orders/${id}/comments`, {
      body: 'I will come by at 3 pm.',
    }).expect(201);
    expect(answer.body.item).toMatchObject({
      user_role: 'TECHNICIAN',
      user: { first_name: 'Lucas' },
    });
    const list = await get('supervisor1', `/api/work-orders/${id}/comments`).expect(200);
    expect(list.body.items.map((c) => c.body)).toContain('I will come by at 3 pm.');
    const seen = await get('user1', `/api/requests/${id}`).expect(200);
    expect(seen.body.comments.at(-1).body).toBe('I will come by at 3 pm.');
  });

  it("does not change the work order's version (no conflict with edits)", async () => {
    const id = requestId();
    const version = one('SELECT version FROM work_orders WHERE id = ?', id);
    await send('post', 'supervisor1', `/api/work-orders/${id}/comments`, { body: 'Noted.' }).expect(
      201,
    );
    expect(one('SELECT version FROM work_orders WHERE id = ?', id)).toBe(version);
  });

  it('refuses an empty, too long or malformed comment (400)', async () => {
    const id = requestId();
    for (const body of [
      { body: '   ' },
      { body: 'x'.repeat(2001) },
      {},
      { body: 'ok', extra: 1 },
    ]) {
      await send('post', 'user1', `/api/requests/${id}/comments`, body).expect(400);
    }
  });

  it("refuses comments on someone else's work order or a missing one (404)", async () => {
    const other = one('SELECT id FROM work_orders WHERE created_by <> ? LIMIT 1', userId('user1'));
    await send('post', 'user1', `/api/requests/${other}/comments`, { body: 'Hi' }).expect(404);
    await send('post', 'supervisor1', '/api/work-orders/99999/comments', { body: 'Hi' }).expect(
      404,
    );
    await get('supervisor1', '/api/work-orders/99999/comments').expect(404);
  });
});

describe('review by a supervisor (D47)', () => {
  const sendRequest = async (overrides = {}) =>
    (await send('post', 'user1', '/api/requests', newRequest(overrides)).expect(201)).body.item;
  const workOrder = (id) => ctx.db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
  const review = (username, id, body) =>
    send('put', username, `/api/work-orders/${id}/review`, body);
  const toReview = async (username = 'supervisor1') =>
    (await get(username, '/api/dashboard').expect(200)).body.kpis.requests_to_review;

  it('puts every new request in the review queue, counted on the dashboard', async () => {
    const before = await toReview();
    const item = await sendRequest();
    expect(item.review_status).toBe('PENDING');
    expect(await toReview()).toBe(before + 1);
    expect(await toReview('admin')).toBe(before + 1);
    const tech = await get('technician1', '/api/dashboard').expect(200);
    expect(tech.body.kpis).not.toHaveProperty('requests_to_review');
    const list = await get('supervisor1', '/api/work-orders?to_review=true&size=100').expect(200);
    expect(list.body.total).toBe(before + 1);
    expect(list.body.items.every((w) => w.review_status === 'PENDING')).toBe(true);
    expect(list.body.items.map((w) => w.id)).toContain(item.id);
  });

  it('refuses to assign, start or cancel a request before its review (422 BR-R7)', async () => {
    const { id } = await sendRequest();
    for (const change of [
      { assignee_id: userId('technician1') },
      { status: 'IN_PROGRESS' },
      { status: 'CANCELLED' },
    ]) {
      const res = await send('put', 'supervisor1', `/api/work-orders/${id}`, {
        ...change,
        version: 1,
      }).expect(422);
      expect(res.body.details.rule).toBe('BR-R7');
    }
    // Other fields can be corrected while triaging.
    const res = await send('put', 'supervisor1', `/api/work-orders/${id}`, {
      location: 'Tower A, floor 12, open space west',
      category: 'HVAC',
      version: 1,
    }).expect(200);
    expect(res.body.item).toMatchObject({
      location: 'Tower A, floor 12, open space west',
      version: 2,
    });
  });

  it('approves a request and allocates it in one step', async () => {
    const { id } = await sendRequest();
    const before = await toReview();
    const res = await review('supervisor2', id, {
      decision: 'APPROVE',
      version: 1,
      assignee_id: userId('technician2'),
      priority: 'HIGH',
      category: 'PLUMBING',
      type: 'IMPROVEMENT',
      due_on: '2026-10-10',
    }).expect(200);
    expect(res.body).toMatchObject({ reviewed: true, version: 2 });
    expect(res.body.item).toMatchObject({
      status: 'OPEN',
      review_status: 'APPROVED',
      reviewed_by: { id: userId('supervisor2') },
      assignee: { id: userId('technician2') },
      supervisor: { id: userId('supervisor2') }, // the reviewer, by default
      priority: 'HIGH',
      category: 'PLUMBING',
      type: 'IMPROVEMENT',
      due_on: '2026-10-10',
      review_note: null,
    });
    expect(res.body.item.reviewed_at).toMatch(/^\d{4}-/);
    expect(await toReview()).toBe(before - 1);
    const history = await get('supervisor1', `/api/work-orders/${id}/history`).expect(200);
    expect(history.body.items[0]).toMatchObject({
      action: 'UPDATE',
      note: { review: 'APPROVED' },
      user: { id: userId('supervisor2') },
      version: 2,
    });
    expect(history.body.items[0].changes.review_status).toEqual({
      from: 'PENDING',
      to: 'APPROVED',
    });
    // The requester sees who will do it, and the approval in the steps.
    const seen = await get('user1', `/api/requests/${id}`).expect(200);
    expect(seen.body.assignee).toMatchObject({ first_name: 'Lucas' });
    expect(seen.body.status_history.map((s) => s.status)).toEqual(['OPEN', 'APPROVED']);
    // The assigned technician can now start it.
    await send('put', 'technician2', `/api/work-orders/${id}`, {
      status: 'IN_PROGRESS',
      version: 2,
    }).expect(200);
  });

  it('lets the reviewer choose another supervisor, or a supervisor as the resource', async () => {
    const { id } = await sendRequest();
    const res = await review('admin', id, {
      decision: 'APPROVE',
      version: 1,
      assignee_id: userId('supervisor1'),
      supervisor_id: userId('supervisor2'),
    }).expect(200);
    expect(res.body.item).toMatchObject({
      assignee: { id: userId('supervisor1') },
      supervisor: { id: userId('supervisor2') },
      reviewed_by: { id: userId('admin') },
    });
  });

  it('requires a resource to approve (BR-R9), and an eligible one (BR-W3)', async () => {
    const { id } = await sendRequest();
    const missing = await review('supervisor1', id, { decision: 'APPROVE', version: 1 }).expect(
      400,
    );
    expect(missing.body.details.fields).toHaveProperty('assignee_id');
    const staff = await review('supervisor1', id, {
      decision: 'APPROVE',
      version: 1,
      assignee_id: userId('user1'),
    }).expect(422);
    expect(staff.body.details.rule).toBe('BR-W3');
    const early = await review('supervisor1', id, {
      decision: 'APPROVE',
      version: 1,
      assignee_id: userId('technician1'),
      due_on: '2020-01-01',
    }).expect(422);
    expect(early.body.details.rule).toBe('BR-W8');
    expect(workOrder(id)).toMatchObject({ review_status: 'PENDING', version: 1 });
  });

  it('rejects a request with a reason the requester sees', async () => {
    const { id } = await sendRequest();
    const noReason = await review('supervisor1', id, {
      decision: 'REJECT',
      version: 1,
      reason: '  ',
    }).expect(400);
    expect(noReason.body.details.fields).toHaveProperty('reason');
    const res = await review('supervisor1', id, {
      decision: 'REJECT',
      version: 1,
      reason: 'Already reported: see the request of your colleague.',
    }).expect(200);
    expect(res.body.item).toMatchObject({
      status: 'CANCELLED',
      review_status: 'REJECTED',
      review_note: 'Already reported: see the request of your colleague.',
      assignee: null,
      version: 2,
    });
    const seen = await get('user1', `/api/requests/${id}`).expect(200);
    expect(seen.body).toMatchObject({
      review_status: 'REJECTED',
      review_note: res.body.item.review_note,
    });
    expect(seen.body.status_history.map((s) => s.status)).toEqual(['OPEN', 'REJECTED']);
    const open = await get('user1', '/api/requests?size=100').expect(200);
    expect(open.body.items.map((r) => r.id)).not.toContain(id);
  });

  it('reviews a request only once, at the version seen (409)', async () => {
    const { id } = await sendRequest();
    await send('put', 'supervisor1', `/api/work-orders/${id}`, {
      priority: 'HIGH',
      version: 1,
    }).expect(200);
    const stale = await review('supervisor2', id, {
      decision: 'REJECT',
      version: 1,
      reason: 'No',
    }).expect(409);
    expect(stale.body.details.rule).toBe('BR-V1');
    await review('supervisor2', id, { decision: 'REJECT', version: 2, reason: 'No' }).expect(200);
    const again = await review('supervisor1', id, {
      decision: 'APPROVE',
      version: 3,
      assignee_id: userId('technician1'),
    }).expect(409);
    expect(again.body.details.rule).toBe('BR-R6');
  });

  it('is for supervisors and admins, on staff requests only', async () => {
    const { id } = await sendRequest();
    const body = { decision: 'REJECT', version: 1, reason: 'No' };
    await review('technician1', id, body).expect(403);
    await review('user1', id, body).expect(403);
    await review('supervisor1', 99999, body).expect(404);
    await review('supervisor1', id, { ...body, decision: 'MAYBE' }).expect(400);
    await review('supervisor1', id, { ...body, assignee_id: 4 }).expect(400);
    const regular = one('SELECT id FROM work_orders WHERE review_status IS NULL LIMIT 1');
    const res = await review('supervisor1', regular, body).expect(422);
    expect(res.body.details.rule).toBe('BR-R6');
  });

  it('refuses review fields in a regular update (403)', async () => {
    const { id } = await sendRequest();
    const res = await send('put', 'supervisor1', `/api/work-orders/${id}`, {
      review_status: 'APPROVED',
      version: 1,
    }).expect(403);
    expect(res.body.details.fields).toEqual(['review_status']);
  });
});

describe('staff accounts', () => {
  it('lets an admin create a staff member, without auto-save by default', async () => {
    const res = await send('post', 'admin', '/api/admin/users', {
      username: 'user2',
      password: 'a-long-password',
      first_name: 'Hugo',
      last_name: 'Lefèvre',
      role: 'STAFF',
      site: 'Lyon Part-Dieu Branch',
    }).expect(201);
    expect(res.body.item).toMatchObject({ role: 'STAFF', power_user: false });
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'user2', password: 'a-long-password' })
      .expect(200);
    expect(login.body.user.role).toBe('STAFF');
  });

  it('never offers a staff member as an assignee (BR-W3)', async () => {
    const users = await get('supervisor1', '/api/users').expect(200);
    expect(users.body.some((u) => u.role === 'STAFF')).toBe(false);
    const wo = ctx.db
      .prepare("SELECT id, version FROM work_orders WHERE status = 'OPEN' LIMIT 1")
      .get();
    const res = await send('put', 'supervisor1', `/api/work-orders/${wo.id}`, {
      assignee_id: userId('user1'),
      version: wo.version,
    }).expect(422);
    expect(res.body.details.rule).toBe('BR-W3');
  });
});
