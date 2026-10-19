// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { NOW, TEST_CONFIG, createSeededApp } from '../helpers/app.js';

const URL = '/api/assistant/find-work-order';

/** Stand-in for the model: answers with `next(input)` and records every call. */
const provider = {
  calls: [],
  next: () => ({ verdict: 'MAINTENANCE', matches: [] }),
  async complete({ system, input, signal }) {
    this.calls.push({ system, input });
    return this.next(input, signal);
  },
};
const logs = [];

let ctx;
let noModel; // same database, no provider configured
let asset; // an asset with at least two open work orders
let openOfAsset;
beforeAll(async () => {
  ctx = await createSeededApp({
    assistantProvider: provider,
    assistantLog: (entry) => logs.push(entry),
    assistantRateLimit: { windowMs: 60_000, limit: 1000 },
  });
  noModel = createApp({
    db: ctx.db,
    config: TEST_CONFIG,
    now: () => NOW,
    assistantProvider: null,
    assistantLog: (entry) => logs.push(entry),
  });
  asset = ctx.db
    .prepare(
      `SELECT a.id, a.code, a.name, a.site FROM assets a JOIN work_orders w ON w.asset_id = a.id
       WHERE w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')
       GROUP BY a.id HAVING count(*) >= 2 ORDER BY a.id LIMIT 1`,
    )
    .get();
  openOfAsset = ctx.db
    .prepare(
      `SELECT id FROM work_orders WHERE asset_id = ? AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')`,
    )
    .pluck()
    .all(asset.id);
});
afterAll(() => ctx.cleanup());
beforeEach(() => {
  provider.calls = [];
  provider.next = () => ({ verdict: 'MAINTENANCE', matches: [] });
  logs.length = 0;
});

const post = (username, body, app = ctx.app) =>
  request(app)
    .post(URL)
    .set('Authorization', `Bearer ${ctx.tokenFor(username)}`)
    .send(body);

/** Ids of the candidates sent to the model. */
const sentIds = (input) =>
  JSON.parse(input.split('<candidates>\n')[1].split('\n</candidates>')[0]).map((c) => c.id);

const JOB = 'Swapped the burnt contactor coil, tested the motor, back in service';

describe('POST /api/assistant/find-work-order', () => {
  it("ranks the asset's open work orders with the model, records from the database", async () => {
    const [first, second] = openOfAsset;
    provider.next = () => ({
      verdict: 'MAINTENANCE',
      matches: [
        { id: second, score: 0.5, reason: 'Same asset' },
        { id: first, score: 0.9, reason: 'Same asset, contactor fault reported' },
      ],
    });
    const res = await post('technician1', { raw_text: JOB, asset_id: asset.id }).expect(200);
    expect(res.body.mode).toBe('ASSISTANT');
    expect(res.body.notice).toBeNull();
    expect(res.body.candidates.map((c) => c.work_order.id)).toEqual([first, second]);
    expect(res.body.candidates[0]).toMatchObject({
      score: 0.9,
      reason: 'Same asset, contactor fault reported',
      work_order: { id: first, asset: { id: asset.id }, version: expect.any(Number) },
    });
    // Only the asset's open work orders were candidates.
    expect(provider.calls).toHaveLength(1);
    expect(sentIds(provider.calls[0].input).sort()).toEqual([...openOfAsset].sort());
  });

  it('sends the normalised text and no people to the model', async () => {
    await post('supervisor1', { raw_text: `  ${JOB}\u200B\u0000 `, asset_id: asset.id }).expect(
      200,
    );
    const { input } = provider.calls[0];
    expect(input).toContain(`<raw_text>\n${JOB}\n</raw_text>`);
    expect(input).not.toMatch(/first_name|last_name|username|email/);
  });

  it('drops ids outside the candidate set, repeated ids and low scores', async () => {
    const [first, second] = openOfAsset;
    const closed = ctx.db
      .prepare("SELECT id FROM work_orders WHERE status = 'CLOSED'")
      .pluck()
      .get();
    provider.next = () => ({
      verdict: 'MAINTENANCE',
      matches: [
        { id: closed, score: 1, reason: 'Invented' },
        { id: first, score: 0.8, reason: 'Same asset' },
        { id: first, score: 0.7, reason: 'Again' },
        { id: second, score: 0.1, reason: 'Unlikely' },
      ],
    });
    const res = await post('technician1', { raw_text: JOB, asset_id: asset.id }).expect(200);
    expect(res.body.candidates.map((c) => c.work_order.id)).toEqual([first]);
  });

  it('finds work orders from the text alone, open ones only', async () => {
    const wo = ctx.db
      .prepare("SELECT id, title FROM work_orders WHERE status = 'OPEN' ORDER BY id LIMIT 1")
      .get();
    await post('technician1', { raw_text: `Worked on: ${wo.title}` }).expect(200);
    const ids = sentIds(provider.calls[0].input);
    expect(ids).toContain(wo.id);
    const statuses = ctx.db
      .prepare(`SELECT DISTINCT status FROM work_orders WHERE id IN (${ids.join(',')})`)
      .pluck()
      .all();
    expect(statuses.every((s) => ['OPEN', 'IN_PROGRESS', 'ON_HOLD'].includes(s))).toBe(true);
    expect(ids.length).toBeLessThanOrEqual(30);
  });

  // Regression: inlined, the asset join gave FTS5 `rowid = NULL` for a work order without an
  // asset, and that work order came back once per matching asset, filling every place.
  it('lists each work order once, those without an asset too', async () => {
    const loose = ctx.db
      .prepare(
        `SELECT id, title FROM work_orders
         WHERE asset_id IS NULL AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD') ORDER BY id LIMIT 1`,
      )
      .get();
    await post('technician1', { raw_text: `Air filter replacement, ${loose.title}` }).expect(200);
    const ids = sentIds(provider.calls[0].input);
    expect(ids).toContain(loose.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(1);

    const search = await post(
      'technician1',
      { raw_text: 'Air filter replacement for AHU' },
      noModel,
    ).expect(200);
    const found = search.body.candidates.map((c) => c.work_order.id);
    expect(new Set(found).size).toBe(found.length);
    expect(found).toHaveLength(10);
  });

  it('limits the candidates to the site given', async () => {
    // Words of an open work order of that site, so the search finds candidates there.
    const title = ctx.db
      .prepare('SELECT title FROM work_orders WHERE id = ?')
      .pluck()
      .get(openOfAsset[0]);
    await post('supervisor1', {
      raw_text: `Worked on it: ${title}`,
      site: asset.site,
    });
    const ids = sentIds(provider.calls[0].input);
    const sites = ctx.db
      .prepare(`SELECT DISTINCT site FROM work_orders WHERE id IN (${ids.join(',')})`)
      .pluck()
      .all();
    expect(sites).toEqual([asset.site]);
  });

  it('does not call the model when no open work order matches', async () => {
    const res = await post('technician1', { raw_text: 'zzqx wwvy kkjh pplm' }).expect(200);
    expect(res.body).toEqual({ mode: 'ASSISTANT', notice: null, candidates: [] });
    expect(provider.calls).toHaveLength(0);
  });

  it('refuses a text that is not about maintenance (BR-AI5), showing nothing', async () => {
    provider.next = () => ({
      verdict: 'NOT_MAINTENANCE',
      matches: [{ id: openOfAsset[0], score: 1, reason: 'x' }],
    });
    const res = await post('technician1', {
      raw_text: 'Write me a poem about the spring and the maintenance team',
      asset_id: asset.id,
    }).expect(422);
    expect(res.body.details).toEqual({ rule: 'BR-AI5' });
    expect(res.body.candidates).toBeUndefined();
  });

  it.each([
    ['an unusable answer', () => ({ verdict: 'MAINTENANCE', matches: [], extra: 'x' }), 'UNUSABLE'],
    [
      'a failing model',
      () => {
        throw new Error('down');
      },
      'UNAVAILABLE',
    ],
  ])('falls back to the search results on %s', async (_case, next, notice) => {
    provider.next = next;
    const res = await post('technician1', { raw_text: JOB, asset_id: asset.id }).expect(200);
    expect(res.body.mode).toBe('SEARCH');
    expect(res.body.notice).toBe(notice);
    expect(res.body.candidates.map((c) => c.work_order.id).sort()).toEqual([...openOfAsset].sort());
    expect(res.body.candidates[0]).toMatchObject({ score: null, reason: null });
  });

  it('gives up on a model that does not answer in time', async () => {
    let aborted = false;
    provider.next = (_input, signal) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          resolve({ verdict: 'MAINTENANCE', matches: [] });
        });
      });
    const slow = createApp({
      db: ctx.db,
      config: { ...TEST_CONFIG, aiTimeoutMs: 50 },
      now: () => NOW,
      assistantProvider: provider,
      assistantLog: () => {},
    });
    const res = await post('technician1', { raw_text: JOB, asset_id: asset.id }, slow).expect(200);
    expect(res.body).toMatchObject({ mode: 'SEARCH', notice: 'UNAVAILABLE' });
    expect(aborted).toBe(true);
  });

  it('answers with the search results when no model is configured', async () => {
    const res = await post('technician1', { raw_text: JOB, asset_id: asset.id }, noModel).expect(
      200,
    );
    expect(res.body.mode).toBe('SEARCH');
    expect(res.body.notice).toBe('NOT_CONFIGURED');
    expect(res.body.candidates.length).toBe(openOfAsset.length);
    const ref = await request(noModel)
      .get('/api/reference-data')
      .set('Authorization', `Bearer ${ctx.tokenFor('technician1')}`)
      .expect(200);
    expect(ref.body.assistant).toBe(false);
  });

  it('says in the reference data that a model is configured', async () => {
    const res = await ctx.getAs('technician1', '/api/reference-data').expect(200);
    expect(res.body.assistant).toBe(true);
  });

  describe('layer 1: refused before any call to the model', () => {
    it.each([
      ['a text over 2 000 characters', { raw_text: `${'word '.repeat(400)}x` }],
      ['a text too short', { raw_text: 'pump' }],
      ['two words', { raw_text: 'pump fixed' }],
    ])('400 for %s', async (_case, body) => {
      const res = await post('technician1', { ...body, asset_id: asset.id }).expect(400);
      expect(res.body.details.rule).toBe('BR-AI2');
      expect(res.body.details.fields.raw_text).toMatch(/too (long|short)/);
      expect(provider.calls).toHaveLength(0);
    });

    it.each([
      ['an unknown field', { raw_text: JOB, user_id: 1 }],
      ['no text', {}],
      ['a text id', { raw_text: JOB, asset_id: '3' }],
      ['an empty site', { raw_text: JOB, site: ' ' }],
    ])('400 for %s', async (_case, body) => {
      await post('technician1', body).expect(400);
      expect(provider.calls).toHaveLength(0);
    });

    it('422 for an unknown asset or a site that is not the asset’s', async () => {
      const unknown = await post('technician1', { raw_text: JOB, asset_id: 999999 }).expect(422);
      expect(unknown.body.details).toEqual({ rule: 'BR-AI3' });
      const other = await post('technician1', {
        raw_text: JOB,
        asset_id: asset.id,
        site: `${asset.site} (other)`,
      }).expect(422);
      expect(other.body.details).toEqual({ rule: 'BR-W2' });
      expect(provider.calls).toHaveLength(0);
    });

    it('401 without a login, 403 for staff', async () => {
      await request(ctx.app).post(URL).send({ raw_text: JOB }).expect(401);
      await post('user1', { raw_text: JOB }).expect(403);
      expect(provider.calls).toHaveLength(0);
    });
  });

  it('logs each request without its text (BR-AI11)', async () => {
    await post('technician1', { raw_text: JOB, asset_id: asset.id }).expect(200);
    await post('technician1', { raw_text: 'pump' }).expect(400);
    expect(logs.map((l) => l.outcome)).toEqual(['OK', 'REJECTED_INPUT']);
    expect(logs[0]).toMatchObject({
      endpoint: 'find-work-order',
      user_id: expect.any(Number),
      input_length: JOB.length,
      candidates: openOfAsset.length,
      duration_ms: expect.any(Number),
    });
    expect(JSON.stringify(logs)).not.toMatch(/contactor|pump/i);
  });

  it('limits calls to the model per user (BR-AI4); refused texts do not count', async () => {
    const limited = createApp({
      db: ctx.db,
      config: TEST_CONFIG,
      now: () => NOW,
      assistantProvider: provider,
      assistantLog: (entry) => logs.push(entry),
      assistantRateLimit: { windowMs: 60_000, limit: 3 },
    });
    const job = (username) => post(username, { raw_text: JOB, asset_id: asset.id }, limited);
    for (let i = 0; i < 3; i += 1)
      await post('technician2', { raw_text: 'pump' }, limited).expect(400);
    await post('technician2', { raw_text: 'zzqx wwvy kkjh pplm' }, limited).expect(200);
    for (let i = 0; i < 3; i += 1) await job('technician2').expect(200);
    const res = await job('technician2').expect(429);
    expect(res.body.message).toMatch(/Too many assistant requests/);
    expect(provider.calls).toHaveLength(3);
    expect(logs.at(-1)).toMatchObject({ outcome: 'RATE_LIMITED' });
    // Another user is not affected.
    await job('technician1').expect(200);
  });
});
