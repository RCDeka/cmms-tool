// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { HttpError } from '../lib/http-error.js';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * GET /api/rooms?site=: the active rooms of a site, for every role (the request form, D81).
 * @param {{ rooms: ReturnType<import('../services/rooms.js').createRoomService> }} deps
 */
export function roomsRouter({ rooms }) {
  const router = Router();
  router.get('/', (req, res) => {
    res.json(rooms.listForSite(req.query));
  });
  return router;
}

/**
 * /api/admin/rooms: the room list, kept by supervisors and admins (D81).
 * @param {object} deps
 * @param {ReturnType<import('../services/rooms.js').createRoomService>} deps.rooms
 * @param {() => Date} deps.now
 */
export function adminRoomsRouter({ rooms, now }) {
  const router = Router();
  router.use(requireRole('SUPERVISOR', 'ADMIN'));

  router.get('/', (req, res) => {
    res.json(rooms.listAdmin(req.query));
  });

  router.post('/', (req, res) => {
    res.status(201).json({ created: true, item: rooms.create(req.body, req.user, { now: now() }) });
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const room = rooms.getById(req.valid.params.id);
    if (!room) throw new HttpError(404, 'Room not found');
    res.json(room);
  });

  router.put('/:id', validate({ params: idParams }), (req, res) => {
    res.json(rooms.update(req.valid.params.id, req.body, req.user, { now: now() }));
  });

  return router;
}
