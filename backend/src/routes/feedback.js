import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../lib/http-error.js';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * /api/feedback: every user sends ideas; administrators read and triage them (D40).
 * @param {object} deps
 * @param {ReturnType<import('../services/feedback.js').createFeedbackService>} deps.feedback
 * @param {() => Date} deps.now
 * @param {{ windowMs: number, limit: number }} deps.sendLimit
 */
export function feedbackRouter({ feedback, now, sendLimit }) {
  const router = Router();

  // Per user, not per IP: colleagues often share one office address.
  const limiter = rateLimit({
    ...sendLimit,
    keyGenerator: (req) => `user-${req.user.id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'Too many suggestions sent, try again later')),
  });

  router.post('/', limiter, (req, res) => {
    res
      .status(201)
      .json({ created: true, item: feedback.create(req.body, req.user, { now: now() }) });
  });

  router.get('/', requireRole('ADMIN'), (req, res) => {
    res.json(feedback.list(req.query));
  });

  router.put('/:id', requireRole('ADMIN'), validate({ params: idParams }), (req, res) => {
    res.json({
      updated: true,
      item: feedback.updateStatus(req.valid.params.id, req.body, req.user, { now: now() }),
    });
  });

  return router;
}
