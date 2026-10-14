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
import { DASHBOARD_PERIODS, DEFAULT_PERIOD } from '../rules/dashboards.js';
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
  awaiting_reply: flagFilter,
  // A segment of a dashboard widget (D59, K9): "backlog_age:URGENT:31-90", with its period.
  drill: z.string().max(200).optional(),
  period: z.coerce
    .number()
    .int()
    .refine((p) => DASHBOARD_PERIODS.includes(p), `One of ${DASHBOARD_PERIODS.join(', ')} days`)
    .optional(),
});

const statsQuery = z.strictObject({
  period: z.coerce.number().int().min(1).max(365).default(30),
});

/**
 * @param {object} deps
 * @param {ReturnType<import('../services/work-orders.js').createWorkOrderService>} deps.workOrders
 * @param {ReturnType<import('../services/dashboard-widgets.js').createDashboardWidgetService>} deps.widgets
 * @param {ReturnType<import('../services/widget-settings.js').createWidgetSettingsService>} deps.widgetSettings
 * @param {string} deps.timeZone APP_TIMEZONE, for "today"
 * @param {() => Date} deps.now
 */
export function workOrdersRouter({ workOrders, widgets, widgetSettings, timeZone, now }) {
  const router = Router();

  router.get('/', validate({ query: listQuery }), (req, res) => {
    const { drill, period, ...query } = req.valid.query;
    if (period !== undefined && drill === undefined) {
      throw new HttpError(400, 'Invalid query', { fields: { period: 'Only with drill' } });
    }
    // D65: no drill-down into a widget switched off (the widget key comes before the colon).
    if (drill !== undefined) widgetSettings.assertAvailable(drill.split(':')[0], req.user);
    const today = dateInZone(timeZone, now());
    const userId = req.user.id;
    const extra =
      drill === undefined
        ? undefined
        : widgets.drillWhere(drill, period ?? DEFAULT_PERIOD, { today, userId, timeZone });
    res.json(workOrders.list(query, { userId, today, extra }));
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
