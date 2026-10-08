import { Router } from 'express';
import { z } from 'zod';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { isoWeek } from '../rules/fields.js';
import { GROUP_BY } from '../services/planning.js';
import { planFilterFields } from './plans.js';

const blockedQuery = z.strictObject({ from: isoWeek.optional(), to: isoWeek.optional() });

const timelineQuery = z
  .strictObject({
    from: isoWeek.optional(),
    // Calendar-year preset: weeks 1 to 52 or 53 of that year (P12).
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    weeks: z.coerce.number().int().min(1).max(53).default(52),
    group_by: z.enum(GROUP_BY).default('site'),
    ...planFilterFields,
  })
  .refine((q) => q.from === undefined || q.year === undefined, {
    message: 'Give a starting week or a year, not both',
    path: ['year'],
  });

const suggestionsBody = z
  .strictObject({
    from: isoWeek.optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    weeks: z.number().int().min(1).max(53).default(52),
    // Same text values as in the timeline query: `site` joined by |, others by commas.
    ...planFilterFields,
  })
  .refine((q) => q.from === undefined || q.year === undefined, {
    message: 'Give a starting week or a year, not both',
    path: ['year'],
  });

/**
 * /api/planning: the year planner (D48). Every maintenance role reads; supervisors and admins
 * release; administrators change the settings (P16).
 * @param {object} deps
 * @param {ReturnType<import('../services/planning.js').createPlanningService>} deps.planning
 * @param {string} deps.timeZone
 * @param {() => Date} deps.now
 */
export function planningRouter({ planning, timeZone, now }) {
  const router = Router();

  // Opening the planner releases what is due first (BR-P6), so its chips are up to date.
  router.get('/timeline', validate({ query: timelineQuery }), (req, res) => {
    const context = { now: now(), timeZone };
    planning.release(context);
    res.json(planning.timeline(req.valid.query, context));
  });

  // Balancing assistant (Phase 20): the same range and filters as the timeline, in the body.
  router.post(
    '/suggestions',
    requireRole('SUPERVISOR', 'ADMIN'),
    validate({ body: suggestionsBody }),
    (req, res) => {
      const context = { now: now(), timeZone };
      planning.release(context);
      res.json(planning.suggestions(req.valid.body, context));
    },
  );

  router.post('/release', requireRole('SUPERVISOR', 'ADMIN'), (req, res) => {
    res.json(planning.release({ now: now(), timeZone, user: req.user }));
  });

  router.get('/blocked-weeks', validate({ query: blockedQuery }), (req, res) => {
    res.json(planning.blockedWeeks(req.valid.query, { now: now(), timeZone }));
  });

  router.post('/blocked-weeks', requireRole('SUPERVISOR', 'ADMIN'), (req, res) => {
    res
      .status(201)
      .json({ created: true, item: planning.addBlockedWeek(req.body, req.user, { now: now() }) });
  });

  router.delete(
    '/blocked-weeks/:id',
    requireRole('SUPERVISOR', 'ADMIN'),
    validate({ params: idParams }),
    (req, res) => {
      planning.removeBlockedWeek(req.valid.params.id);
      res.status(204).end();
    },
  );

  router.get('/settings', (_req, res) => {
    res.json(planning.settingsWithPeople());
  });

  router.put('/settings', requireRole('ADMIN'), (req, res) => {
    res.json(planning.updateSettings(req.body, req.user, { now: now() }));
  });

  return router;
}
