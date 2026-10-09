// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

/**
 * GET /api/reference-data and GET /api/users.
 * @param {object} deps
 * @param {ReturnType<import('../services/reference-data.js').createReferenceDataService>} deps.referenceData
 * @param {ReturnType<import('../services/users.js').createUserService>} deps.users
 */
export function referenceRouter({ referenceData, users }) {
  const router = Router();

  router.get('/reference-data', (_req, res) => {
    res.json(referenceData.get());
  });

  // Users that can be assigned to a work order (dropdowns); not visible to technicians.
  router.get('/users', requireRole('SUPERVISOR', 'ADMIN'), (_req, res) => {
    res.json(users.listAssignable());
  });

  return router;
}
