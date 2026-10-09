// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { z } from 'zod';
import { dateInZone } from '../lib/dates.js';
import { HttpError } from '../lib/http-error.js';
import { listFilter } from '../lib/list-filter.js';
import {
  flagFilter,
  idParams,
  pageQueryFields,
  sortQueryFields,
  textFilter,
} from '../lib/pagination.js';
import {
  CATEGORIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from '../rules/enums.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { WORK_ORDER_SORTS } from '../services/work-orders.js';
import { sendUpdateResult } from './write-response.js';

const listQuery = z.strictObject({
  ...pageQueryFields,
  ...sortQueryFields(WORK_ORDER_SORTS, 'created_on', 'desc'),
  q: textFilter,
  // One value or several: status=OPEN,IN_PROGRESS (site names may hold commas, so those use "|").
  status: listFilter(z.enum(WORK_ORDER_STATUSES)),
  priority: listFilter(z.enum(WORK_ORDER_PRIORITIES)),
  type: listFilter(z.enum(WORK_ORDER_TYPES)),
  category: listFilter(z.enum(CATEGORIES)),
  site: listFilter(z.string().max(200), { separator: '|' }),
  assignee_id: listFilter(z.coerce.number().int().positive()),
  mine: flagFilter,
  overdue: flagFilter,
  to_review: flagFilter,
});

const statsQuery = z.strictObject({
  period: z.coerce.number().int().min(1).max(365).default(30),
});

/**
 * @param {object} deps
 * @param {ReturnType<import('../services/work-orders.js').createWorkOrderService>} deps.workOrders
 * @param {string} deps.timeZone APP_TIMEZONE, for "today"
 * @param {() => Date} deps.now
 */
export function workOrdersRouter({ workOrders, timeZone, now }) {
  const router = Router();

  router.get('/', validate({ query: listQuery }), (req, res) => {
    res.json(
      workOrders.list(req.valid.query, {
        userId: req.user.id,
        today: dateInZone(timeZone, now()),
      }),
    );
  });

  // All roles may create (D27); BR-W12 restricts technicians in the service.
  router.post('/', (req, res) => {
    const { created, item } = workOrders.create(req.body, req.user, { now: now(), timeZone });
    res.status(created ? 201 : 200).json({ created, item });
  });

  // Declared before /:id so "stats" is not taken for an id.
  router.get('/stats', validate({ query: statsQuery }), (req, res) => {
    res.json(workOrders.stats(req.valid.query.period, dateInZone(timeZone, now())));
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const workOrder = workOrders.getById(req.valid.params.id);
    if (!workOrder) throw new HttpError(404, 'Work order not found');
    res.json(workOrder);
  });

  router.put('/:id', validate({ params: idParams }), (req, res) => {
    const result = workOrders.update(req.valid.params.id, req.body, req.user, {
      now: now(),
      timeZone,
    });
    sendUpdateResult(res, result);
  });

  // Staff requests: approve and allocate, or reject (D47).
  router.put(
    '/:id/review',
    requireRole('SUPERVISOR', 'ADMIN'),
    validate({ params: idParams }),
    (req, res) => {
      const item = workOrders.review(req.valid.params.id, req.body, req.user, { now: now() });
      res.json({ reviewed: true, version: item.version, item });
    },
  );

  router.put(
    '/:id/resolve-conflict',
    requireRole('SUPERVISOR', 'ADMIN'),
    validate({ params: idParams }),
    (req, res) => {
      const item = workOrders.resolveConflict(req.valid.params.id, req.body, req.user, {
        now: now(),
        timeZone,
      });
      res.json({ resolved: true, version: item.version, item });
    },
  );

  return router;
}
