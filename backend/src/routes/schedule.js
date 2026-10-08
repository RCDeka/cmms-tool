import { Router } from 'express';
import { z } from 'zod';
import { idParams } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { isoWeek } from '../rules/fields.js';

const weekQuery = z.strictObject({ week: isoWeek.optional() });
const weekParams = z.strictObject({ week: isoWeek });
const versionQuery = z.strictObject({ version: z.coerce.number().int().min(1) });

/**
 * /api/schedule: the week scheduler (D48, Phase 19). Every maintenance role reads; supervisors
 * and admins allocate, move, resize, set capacity and open weekends; technicians lock their
 * own appointments and order their own day (BR-S7).
 * @param {object} deps
 * @param {ReturnType<import('../services/schedule.js').createScheduleService>} deps.schedule
 * @param {ReturnType<import('../services/planning.js').createPlanningService>} deps.planning
 * @param {string} deps.timeZone
 * @param {() => Date} deps.now
 */
export function scheduleRouter({ schedule, planning, timeZone, now }) {
  const router = Router();
  const write = requireRole('SUPERVISOR', 'ADMIN');
  const context = () => ({ now: now(), timeZone });

  // Like the year planner, opening the scheduler releases the visits due first (BR-P6), so
  // the tray holds this week's preventive work orders.
  router.get('/', validate({ query: weekQuery }), (req, res) => {
    planning.release(context());
    res.json(schedule.week(req.valid.query.week, context()));
  });

  router.post('/allocations', write, (req, res) => {
    res
      .status(201)
      .json({ created: true, items: schedule.createBlocks(req.body, req.user, context()) });
  });

  router.put('/allocations/:id', write, validate({ params: idParams }), (req, res) => {
    res.json({
      updated: true,
      item: schedule.updateBlock(req.valid.params.id, req.body, req.user, context()),
    });
  });

  router.delete(
    '/allocations/:id',
    write,
    validate({ params: idParams, query: versionQuery }),
    (req, res) => {
      schedule.deleteBlock(req.valid.params.id, req.valid.query.version, req.user, context());
      res.status(204).end();
    },
  );

  router.put('/allocations/:id/lock', validate({ params: idParams }), (req, res) => {
    res.json({
      updated: true,
      item: schedule.lockBlock(req.valid.params.id, req.body, req.user, context()),
    });
  });

  router.put('/day-order', (req, res) => {
    res.json(schedule.dayOrder(req.body, req.user));
  });

  router.put('/capacity', write, (req, res) => {
    res.json(schedule.setCapacity(req.body, req.user, context()));
  });

  router.put('/weeks/:week', write, validate({ params: weekParams }), (req, res) => {
    res.json(schedule.setWeekDays(req.valid.params.week, req.body, req.user, context()));
  });

  return router;
}

/**
 * /api/my-week: the current user's own days and blocks (spec §9), cached offline by the client.
 * @param {object} deps
 * @param {ReturnType<import('../services/schedule.js').createScheduleService>} deps.schedule
 * @param {string} deps.timeZone
 * @param {() => Date} deps.now
 */
export function myWeekRouter({ schedule, timeZone, now }) {
  const router = Router();
  router.get('/', validate({ query: weekQuery }), (req, res) => {
    res.json(schedule.myWeek(req.valid.query.week, req.user, { now: now(), timeZone }));
  });
  return router;
}
