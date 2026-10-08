import { Router } from 'express';
import { HttpError } from '../lib/http-error.js';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * /api/plan-occurrences: one visit of a plan (D48, Phase 18). Every maintenance role reads;
 * supervisors and admins move, skip and restore.
 * @param {object} deps
 * @param {ReturnType<import('../services/occurrences.js').createOccurrenceService>} deps.occurrences
 * @param {string} deps.timeZone
 * @param {() => Date} deps.now
 */
export function planOccurrencesRouter({ occurrences, timeZone, now }) {
  const router = Router();
  const write = requireRole('SUPERVISOR', 'ADMIN');
  const context = () => ({ now: now(), timeZone });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const item = occurrences.getById(req.valid.params.id);
    if (!item) throw new HttpError(404, 'Visit not found');
    res.json(item);
  });

  router.put('/:id', write, validate({ params: idParams }), (req, res) => {
    res.json({
      updated: true,
      item: occurrences.move(req.valid.params.id, req.body, req.user, context()),
    });
  });

  router.post('/:id/skip', write, validate({ params: idParams }), (req, res) => {
    res.json({
      updated: true,
      item: occurrences.skip(req.valid.params.id, req.body, req.user, context()),
    });
  });

  router.post('/:id/restore', write, validate({ params: idParams }), (req, res) => {
    res.json({
      updated: true,
      item: occurrences.restore(req.valid.params.id, req.body, req.user, context()),
    });
  });

  return router;
}
