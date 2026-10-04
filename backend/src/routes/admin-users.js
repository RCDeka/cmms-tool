import { Router } from 'express';
import { HttpError } from '../lib/http-error.js';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * /api/admin/users: user administration, administrators only (D39).
 * @param {object} deps
 * @param {ReturnType<import('../services/users.js').createUserService>} deps.users
 * @param {() => Date} deps.now
 */
export function adminUsersRouter({ users, now }) {
  const router = Router();
  router.use(requireRole('ADMIN'));

  router.get('/', (req, res) => {
    res.json(users.listAdmin(req.query));
  });

  router.post('/', async (req, res) => {
    res
      .status(201)
      .json({ created: true, item: await users.create(req.body, req.user, { now: now() }) });
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const user = users.getById(req.valid.params.id);
    if (!user) throw new HttpError(404, 'User not found');
    res.json(user);
  });

  router.put('/:id', validate({ params: idParams }), (req, res) => {
    res.json({
      updated: true,
      item: users.update(req.valid.params.id, req.body, req.user, { now: now() }),
    });
  });

  // Admin reset: the user's open sessions end (BR-U8).
  router.post('/:id/password', validate({ params: idParams }), async (req, res) => {
    await users.setPassword(req.valid.params.id, req.body?.password, req.user, {
      now: now(),
      note: { password_reset: true },
    });
    res.status(204).end();
  });

  return router;
}
