// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { listFilter, placeFilter } from '../lib/list-filter.js';
import {
  flagFilter,
  idParams,
  pageQueryFields,
  sortQueryFields,
  textFilter,
} from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { CATEGORIES, PERFORMERS, PLAN_TYPES } from '../rules/enums.js';
import { isoWeek, WRITE_META } from '../rules/fields.js';
import { PLAN_SORTS } from '../services/plans.js';

/** Filters shared by the plan list and the year planner (site names use "|"). */
export const planFilterFields = {
  q: textFilter,
  site: listFilter(z.string().max(200), { separator: '|' }),
  // A place and everything below it (BR-LOC10).
  location: placeFilter(),
  category: listFilter(z.enum(CATEGORIES)),
  type: listFilter(z.enum(PLAN_TYPES)),
  performed_by: listFilter(z.enum(PERFORMERS)),
};

const anchorBody = z.strictObject({ anchor_week: isoWeek, version: WRITE_META.version });

const listQuery = z.strictObject({
  ...pageQueryFields,
  ...sortQueryFields(PLAN_SORTS, 'code', 'asc'),
  ...planFilterFields,
  active: flagFilter,
});

/**
 * /api/plans: maintenance plans (D48). Every maintenance role reads; supervisors and admins
 * create and edit.
 * @param {object} deps
 * @param {ReturnType<import('../services/plans.js').createPlanService>} deps.plans
 * @param {string} deps.timeZone
 * @param {() => Date} deps.now
 */
export function plansRouter({ plans, timeZone, now }) {
  const router = Router();
  const context = () => ({ now: now(), timeZone });

  router.get('/', validate({ query: listQuery }), (req, res) => {
    res.json(plans.list(req.valid.query, context()));
  });

  router.post('/', requireRole('SUPERVISOR', 'ADMIN'), (req, res) => {
    res.status(201).json({ created: true, item: plans.create(req.body, req.user, context()) });
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const plan = plans.getById(req.valid.params.id, context());
    if (!plan) throw new HttpError(404, 'Plan not found');
    res.json(plan);
  });

  // Moves the series (BR-P2): the drag of a plan's first visit in the year planner.
  router.put(
    '/:id/anchor',
    requireRole('SUPERVISOR', 'ADMIN'),
    validate({ params: idParams, body: anchorBody }),
    (req, res) => {
      res.json(plans.update(req.valid.params.id, req.valid.body, req.user, context()));
    },
  );

  router.put(
    '/:id',
    requireRole('SUPERVISOR', 'ADMIN'),
    validate({ params: idParams }),
    (req, res) => {
      res.json(plans.update(req.valid.params.id, req.body, req.user, context()));
    },
  );

  return router;
}
