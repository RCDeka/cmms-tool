import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { feedbackMarkdown } from '../../src/lib/feedback-report.js';
import { createSeededApp } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp({ feedbackRateLimit: { windowMs: 60_000, limit: 5 } });
});
afterAll(() => ctx.cleanup());

const as = (username) => {
  const token = ctx.tokenFor(username);
  return {
    get: (url) => request(ctx.app).get(url).set('Authorization', `Bearer ${token}`),
    send: (method, url, body) =>
      request(ctx.app)[method](url).set('Authorization', `Bearer ${token}`).send(body),
  };
};
const idea = (o = {}) => ({
  message: '  It would be interesting to add a pie chart of work orders by category  ',
  page_path: '/dashboard',
  page_title: 'Dashboard',
  viewport_width: 1400,
  ...o,
});

describe('POST /api/feedback', () => {
  it('records an idea from any role with the page, author and role', async () => {
    const res = await as('technician1').send('post', '/api/feedback', idea()).expect(201);
    expect(res.body.item).toMatchObject({
      message: 'It would be interesting to add a pie chart of work orders by category',
      page_path: '/dashboard',
      page_title: 'Dashboard',
      viewport_width: 1400,
      user_role: 'TECHNICIAN',
      status: 'NEW',
      user: { first_name: expect.any(String), last_name: expect.any(String) },
    });
    await as('supervisor1')
      .send('post', '/api/feedback', idea({ page_path: '/work-orders/3?page=2' }))
      .expect(201);
  });

  it.each([
    ['an empty message', { message: '   ' }],
    ['a too long message', { message: 'x'.repeat(2001) }],
    ['a page of another site', { page_path: '//evil.example/x' }],
    ['a full URL', { page_path: 'https://evil.example/' }],
    ['an unknown field', { user_id: 1 }],
  ])('refuses %s', async (_case, override) => {
    await as('technician2').send('post', '/api/feedback', idea(override)).expect(400);
  });

  it('needs a login', async () => {
    await request(ctx.app).post('/api/feedback').send(idea()).expect(401);
  });

  it('is rate limited per user', async () => {
    for (let i = 0; i < 5; i += 1) {
      await as('supervisor2').send('post', '/api/feedback', idea()).expect(201);
    }
    await as('supervisor2').send('post', '/api/feedback', idea()).expect(429);
    // Another user is not affected.
    await as('admin')
      .send('post', '/api/feedback', idea({ page_path: '/assets' }))
      .expect(201);
  });
});

describe('reading and triage (admins)', () => {
  it('is reserved to administrators', async () => {
    await as('supervisor1').get('/api/feedback').expect(403);
    await as('technician1').send('put', '/api/feedback/1', { status: 'DONE' }).expect(403);
  });

  it('lists newest first with filters', async () => {
    const all = (await as('admin').get('/api/feedback').expect(200)).body;
    expect(all.total).toBe(8);
    const technicians = (await as('admin').get('/api/feedback?role=TECHNICIAN').expect(200)).body;
    expect(technicians.items.map((i) => i.user_role)).toEqual(['TECHNICIAN']);
    await as('admin').get('/api/feedback?status=BOGUS').expect(400);
  });

  it('changes the status', async () => {
    const res = await as('admin').send('put', '/api/feedback/1', { status: 'PLANNED' }).expect(200);
    expect(res.body.item.status).toBe('PLANNED');
    const planned = (await as('admin').get('/api/feedback?status=PLANNED').expect(200)).body;
    expect(planned.items.map((i) => i.id)).toEqual([1]);
    await as('admin').send('put', '/api/feedback/1', { status: 'MAYBE' }).expect(400);
    await as('admin').send('put', '/api/feedback/999', { status: 'DONE' }).expect(404);
  });
});

describe('feedbackMarkdown', () => {
  it('groups ideas by page and quotes each message', () => {
    const item = (o) => ({
      id: 1,
      message: 'Line one\nLine two',
      page_path: '/dashboard',
      page_title: 'Dashboard',
      viewport_width: 390,
      user: { first_name: 'Karim', last_name: 'Benali' },
      user_role: 'TECHNICIAN',
      status: 'NEW',
      created_at: '2026-10-04T12:00:00.000Z',
      ...o,
    });
    const text = feedbackMarkdown([
      item(),
      item({ id: 2, page_path: '/assets/4?page=2', page_title: 'Chiller' }),
    ]);
    expect(text).toContain('# Improvement ideas (2 open)');
    expect(text).toContain('## /assets/:id\n');
    expect(text).toContain('## /dashboard\n');
    expect(text).toContain('Karim Benali, technician, 390px wide');
    expect(text).toContain('  > Line one\n  > Line two');
    expect(feedbackMarkdown([])).toContain('No open idea.');
  });
});
