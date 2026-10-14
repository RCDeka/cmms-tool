// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { HttpError } from '../lib/http-error.js';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * GET /api/locations: the level types and the whole tree, for every role (D82); staff get
 * the places in use only.
 * @param {{ locations: ReturnType<import('../services/locations.js').createLocationService> }} deps
 */
export function locationsRouter({ locations }) {
  const router = Router();
  router.get('/', (req, res) => {
    res.json(locations.list(req.user));
  });
  return router;
}

/**
 * /api/admin/locations: places, kept by supervisors and admins; sites by admins (BR-L6).
 * @param {object} deps
 * @param {ReturnType<import('../services/locations.js').createLocationService>} deps.locations
 * @param {() => Date} deps.now
 */
export function adminLocationsRouter({ locations, now }) {
  const router = Router();
  router.use(requireRole('SUPERVISOR', 'ADMIN'));

  router.post('/', (req, res) => {
    res
      .status(201)
      .json({ created: true, item: locations.create(req.body, req.user, { now: now() }) });
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const place = locations.getById(req.valid.params.id);
    if (!place) throw new HttpError(404, 'Place not found');
    res.json(place);
  });

  router.put('/:id', validate({ params: idParams }), (req, res) => {
    res.json(locations.update(req.valid.params.id, req.body, req.user, { now: now() }));
  });

  return router;
}

/**
 * /api/admin/level-types: read by supervisors and admins, written by admins (BR-LT1).
 * @param {object} deps
 * @param {ReturnType<import('../services/locations.js').createLocationService>} deps.locations
 * @param {() => Date} deps.now
 */
export function adminLevelTypesRouter({ locations, now }) {
  const router = Router();
  router.use(requireRole('SUPERVISOR', 'ADMIN'));

  router.get('/', (_req, res) => {
    res.json(locations.listTypes());
  });

  router.post('/', requireRole('ADMIN'), (req, res) => {
    res
      .status(201)
      .json({ created: true, item: locations.createType(req.body, req.user, { now: now() }) });
  });

  router.put('/:id', requireRole('ADMIN'), validate({ params: idParams }), (req, res) => {
    res.json(locations.updateType(req.valid.params.id, req.body, req.user, { now: now() }));
  });

  return router;
}
