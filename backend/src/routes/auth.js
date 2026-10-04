import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { validate } from '../middleware/validate.js';

const changePasswordBody = z.strictObject({
  current_password: z.string().min(1).max(200),
  new_password: z.string().max(200),
});

const loginBody = z.strictObject({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

/**
 * POST /login (public, rate limited), POST /logout, GET /me.
 * @param {object} deps
 * @param {ReturnType<import('../services/auth.js').createAuthService>} deps.auth
 * @param {import('express').RequestHandler} deps.authenticate
 * @param {{ windowMs: number, limit: number }} deps.loginRateLimit
 */
export function authRouter({ auth, authenticate, loginRateLimit, now = () => new Date() }) {
  const router = Router();

  const limiter = rateLimit({
    ...loginRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'Too many login attempts, try again later')),
  });

  router.post('/login', limiter, validate({ body: loginBody }), async (req, res) => {
    const { username, password } = req.valid.body;
    res.json(await auth.login(username, password));
  });

  // JWTs are stateless: the client deletes its token and local data (D22).
  router.post('/logout', authenticate, (_req, res) => {
    res.status(204).end();
  });

  router.get('/me', authenticate, (req, res) => {
    res.json(req.user);
  });

  router.post(
    '/change-password',
    authenticate,
    validate({ body: changePasswordBody }),
    async (req, res) => {
      const { current_password: current, new_password: next } = req.valid.body;
      res.json(await auth.changePassword(req.user, current, next, { now: now() }));
    },
  );

  return router;
}
