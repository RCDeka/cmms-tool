// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { idParams, pageQueryFields } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { REQUEST_SCOPES } from '../rules/requests.js';

const listQuery = z.strictObject({
  ...pageQueryFields,
  scope: z.enum(REQUEST_SCOPES).default('open'),
});

/**
 * /api/requests: staff members' own requests (D46). STAFF only; the maintenance team works on
 * the same records through /api/work-orders.
 * @param {object} deps
 * @param {ReturnType<import('../services/requests.js').createRequestService>} deps.requests
 * @param {ReturnType<import('../services/comments.js').createCommentService>} deps.comments
 * @param {string} deps.timeZone
 * @param {() => Date} deps.now
 */
export function requestsRouter({ requests, comments, timeZone, now }) {
  const router = Router();
  router.use(requireRole('STAFF'));

  router.get('/', validate({ query: listQuery }), (req, res) => {
    res.json(requests.list(req.user.id, req.valid.query));
  });

  router.post('/', (req, res) => {
    const { created, item } = requests.create(req.body, req.user, { now: now(), timeZone });
    res.status(created ? 201 : 200).json({ created, item });
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const item = requests.detail(req.valid.params.id, req.user.id);
    if (!item) throw new HttpError(404, 'Request not found');
    res.json(item);
  });

  router.post('/:id/comments', validate({ params: idParams }), (req, res) => {
    const { id } = req.valid.params;
    if (!requests.getOwn(id, req.user.id)) throw new HttpError(404, 'Request not found');
    res
      .status(201)
      .json({ created: true, item: comments.add(id, req.body, req.user, { now: now() }) });
  });

  return router;
}

/**
 * GET and POST /api/work-orders/:id/comments: the maintenance team reads and answers the
 * conversation of any work order.
 * @param {ReturnType<import('../services/comments.js').createCommentService>} comments
 * @param {ReturnType<import('../services/work-orders.js').createWorkOrderService>} workOrders
 * @param {() => Date} now
 */
export function workOrderCommentsRouter(comments, workOrders, now) {
  const router = Router({ mergeParams: true });
  const found = (req) => {
    if (!workOrders.getById(req.valid.params.id)) throw new HttpError(404, 'Work order not found');
    return req.valid.params.id;
  };
  router.get('/', validate({ params: idParams }), (req, res) => {
    res.json({ items: comments.list(found(req)) });
  });
  router.post('/', validate({ params: idParams }), (req, res) => {
    const id = found(req);
    res
      .status(201)
      .json({ created: true, item: comments.add(id, req.body, req.user, { now: now() }) });
  });
  return router;
}
