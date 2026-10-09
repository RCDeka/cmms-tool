// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Balancing assistant (Phase 20): POST /api/planning/suggestions on the demo dataset.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addWeeks } from '../../src/lib/iso-week.js';
import { createSeededApp } from '../helpers/app.js';

let ctx;
beforeAll(async () => {
  ctx = await createSeededApp();
});
afterAll(() => ctx.cleanup());

const as = (username) => {
  const token = ctx.tokenFor(username);
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url) => auth(request(ctx.app).get(url)),
    post: (url, body) => auth(request(ctx.app).post(url)).send(body),
    put: (url, body) => auth(request(ctx.app).put(url)).send(body),
  };
};
const sup = () => as('supervisor1');
const peak = (figures) => Math.max(...figures.map((f) => f.load ?? 0));

describe('access and input', () => {
  it('is for supervisors and admins', async () => {
    await as('technician1').post('/api/planning/suggestions', {}).expect(403);
    await as('user1').post('/api/planning/suggestions', {}).expect(403);
    await as('admin').post('/api/planning/suggestions', {}).expect(200);
  });

  it('takes the timeline range and filters, and refuses anything else (400)', async () => {
    await sup().post('/api/planning/suggestions', { group_by: 'site' }).expect(400);
    await sup().post('/api/planning/suggestions', { from: '2026-W41', year: 2027 }).expect(400);
    await sup().post('/api/planning/suggestions', { from: '2027-W53' }).expect(400);
    await sup().post('/api/planning/suggestions', { category: 'PAINTING' }).expect(400);
    const res = await sup()
      .post('/api/planning/suggestions', { category: 'ELECTRICAL' })
      .expect(200);
    expect(res.body.moves.every((m) => m.category === 'ELECTRICAL')).toBe(true);
  });
});

describe('the proposal on the demo dataset (acceptance)', () => {
  let proposal;
  let before;
  beforeAll(async () => {
    before = (await sup().get('/api/planning/timeline').expect(200)).body;
    proposal = (await sup().post('/api/planning/suggestions', {}).expect(200)).body;
  });

  it('proposes moves that lower the peak load, with the figures before and after', () => {
    expect(proposal.moves.length).toBeGreaterThan(0);
    expect(proposal.before.tiles.workload.weeks_over).toBe(1);
    expect(peak(proposal.after.figures)).toBeLessThan(peak(proposal.before.figures));
    expect(proposal.after.tiles.workload.weeks_over).toBe(0);
    // Moves only shift hours: the year's total stays.
    const sum = (figures) => figures.reduce((s, f) => s + f.planned_hours, 0);
    expect(sum(proposal.after.figures)).toBe(sum(proposal.before.figures));
    expect(proposal.moves[0]).toMatchObject({
      occurrence_id: expect.any(Number),
      plan_id: expect.any(Number),
      code: expect.stringMatching(/^PM-/),
      from: expect.stringMatching(/^\d{4}-W\d{2}$/),
      to: expect.stringMatching(/^\d{4}-W\d{2}$/),
      due_week: expect.any(String),
      version: expect.any(Number),
      estimated_hours: expect.any(Number),
    });
  });

  it('saves nothing', async () => {
    const again = (await sup().get('/api/planning/timeline').expect(200)).body;
    expect(again.figures).toEqual(before.figures);
  });

  it('keeps every move within its plan’s rules: accepted, they lower the peak as announced', async () => {
    const plans = new Map(before.groups.flatMap((g) => g.plans).map((p) => [p.id, p]));
    for (const m of proposal.moves) {
      const plan = plans.get(m.plan_id);
      // Season and blocked weeks: no new warning.
      const res = await sup()
        .put(`/api/plan-occurrences/${m.occurrence_id}`, { week: m.to, version: m.version })
        .expect(200);
      expect(res.body.item.warnings).not.toContain('BLOCKED_WEEK');
      if (plan.season_from_week) expect(res.body.item.warnings).not.toContain('OUT_OF_SEASON');
      expect(plan.performed_by).toBe('INTERNAL');
    }
    const after = (await sup().get('/api/planning/timeline').expect(200)).body;
    // Outside the release horizon: the timeline load released none of them, so each one can
    // still be moved back (Undo).
    const horizon = addWeeks(before.current_week, before.settings.release_weeks_ahead);
    for (const m of proposal.moves) {
      expect(m.to > horizon).toBe(true);
      const o = (await sup().get(`/api/plan-occurrences/${m.occurrence_id}`).expect(200)).body;
      expect(o).toMatchObject({ status: 'PLANNED', week: m.to });
    }
    expect(after.figures.map((f) => f.planned_hours)).toEqual(
      proposal.after.figures.map((f) => f.planned_hours),
    );
    expect(peak(after.figures)).toBeLessThan(peak(before.figures));
    // Balanced now: a new proposal finds little or nothing left to move.
    const next = (await sup().post('/api/planning/suggestions', {}).expect(200)).body;
    expect(peak(next.after.figures)).toBeLessThanOrEqual(peak(after.figures));
  });

  it('avoids blocked weeks', async () => {
    const quiet = (await sup().post('/api/planning/suggestions', {}).expect(200)).body;
    const target = quiet.moves[0]?.to;
    if (!target) return;
    await sup()
      .post('/api/planning/blocked-weeks', { week: target, reason: 'Change freeze' })
      .expect(201);
    const res = (await sup().post('/api/planning/suggestions', {}).expect(200)).body;
    expect(res.moves.some((m) => m.to === target)).toBe(false);
  });
});
