// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { z } from 'zod';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const versionQuery = z.strictObject({ version: z.coerce.number().int().min(1) });

/**
 * /api/dashboards: personal dashboards of supervisors and admins (D59).
 * @param {object} deps
 * @param {ReturnType<import('../services/dashboards.js').createDashboardsService>} deps.dashboards
 * @param {() => Date} deps.now
 */
export function dashboardsRouter({ dashboards, now }) {
  const router = Router();
  router.use(requireRole('SUPERVISOR', 'ADMIN'));

  router.get('/', (req, res) => {
    res.json(dashboards.list(req.user, { now: now() }));
  });

  router.post('/', (req, res) => {
    res.status(201).json(dashboards.create(req.body, req.user, { now: now() }));
  });

  // Declared before /:id so "order" is not taken for an id.
  router.put('/order', (req, res) => {
    dashboards.reorder(req.body, req.user);
    res.status(204).end();
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    res.json(dashboards.get(req.valid.params.id, req.user));
  });

  router.put('/:id', validate({ params: idParams }), (req, res) => {
    res.json(dashboards.update(req.valid.params.id, req.body, req.user, { now: now() }));
  });

  router.delete('/:id', validate({ params: idParams, query: versionQuery }), (req, res) => {
    dashboards.remove(req.valid.params.id, req.valid.query.version, req.user);
    res.status(204).end();
  });

  return router;
}
