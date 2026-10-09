// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { CONFLICT_STATUSES } from '../rules/enums.js';

const listQuery = z.strictObject({ status: z.enum(CONFLICT_STATUSES).default('OPEN') });

/**
 * GET /api/conflicts and GET /api/conflicts/:id (supervisors and admins).
 * @param {{ conflicts: ReturnType<import('../services/conflicts.js').createConflictService> }} deps
 */
export function conflictsRouter({ conflicts }) {
  const router = Router();
  router.use(requireRole('SUPERVISOR', 'ADMIN'));

  router.get('/', validate({ query: listQuery }), (req, res) => {
    res.json(conflicts.list(req.valid.query.status));
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const conflict = conflicts.get(req.valid.params.id);
    if (!conflict) throw new HttpError(404, 'Conflict not found');
    res.json(conflict);
  });

  return router;
}
