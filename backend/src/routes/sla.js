// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Service levels (D86, D88): read by the maintenance roles, edited by the admins.
import { Router } from 'express';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * @param {object} deps
 * @param {ReturnType<import('../services/sla.js').createSlaService>} deps.sla
 * @param {() => Date} deps.now
 */
export function slaRouter({ sla, now }) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(sla.get());
  });

  router.put('/', requireRole('ADMIN'), (req, res) => {
    res.json(sla.update(req.body, req.user, { now: now() }));
  });

  router.post('/holidays', requireRole('ADMIN'), (req, res) => {
    res.status(201).json(sla.addHoliday(req.body, req.user, { now: now() }));
  });

  router.delete(
    '/holidays/:id',
    requireRole('ADMIN'),
    validate({ params: idParams }),
    (req, res) => {
      res.json(sla.removeHoliday(req.valid.params.id, req.user, { now: now() }));
    },
  );

  return router;
}
