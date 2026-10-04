import { Router } from 'express';

/**
 * GET /api/dashboard: all roles.
 * @param {object} deps
 * @param {ReturnType<import('../services/dashboard.js').createDashboardService>} deps.dashboard
 * @param {string} deps.timeZone
 * @param {() => Date} deps.now
 */
export function dashboardRouter({ dashboard, timeZone, now }) {
  const router = Router();
  router.get('/', (req, res) => {
    res.json(dashboard.get(req.user, { now: now(), timeZone }));
  });
  return router;
}
