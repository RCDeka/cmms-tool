// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { z } from 'zod';
import { dateInZone } from '../lib/dates.js';
import { listFilter } from '../lib/list-filter.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  DASHBOARD_PERIODS,
  DEFAULT_PERIOD,
  WIDGET_KEYS,
  widgetAvailable,
} from '../rules/dashboards.js';
import { CATEGORIES } from '../rules/enums.js';

/** Dashboard filters in the query (K8): sites joined by "|", as in the lists (D45). */
const filterFields = {
  period: z.coerce
    .number()
    .int()
    .refine((p) => DASHBOARD_PERIODS.includes(p), `One of ${DASHBOARD_PERIODS.join(', ')} days`)
    .default(DEFAULT_PERIOD),
  site: listFilter(z.string().max(200), { separator: '|' }),
  category: listFilter(z.enum(CATEGORIES)),
};

const widgetsQuery = z.strictObject({
  // Required, unlike the list filters: the widgets to compute, comma-separated.
  keys: z
    .string('Required')
    .transform((v) => [...new Set(v.split(','))])
    .pipe(z.array(z.enum(WIDGET_KEYS)).min(1)),
  ...filterFields,
});
const rowsQuery = z.strictObject({ segment: z.string().max(200).optional(), ...filterFields });
const keyParams = z.strictObject({ key: z.enum(WIDGET_KEYS) });

const filtersOf = (query) => ({
  period: query.period,
  sites: query.site ?? [],
  categories: query.category ?? [],
});

/**
 * GET /api/dashboard (every maintenance role), and the widgets of the personal dashboards
 * (supervisors and admins, D59).
 * @param {object} deps
 * @param {ReturnType<import('../services/dashboard.js').createDashboardService>} deps.dashboard
 * @param {ReturnType<import('../services/dashboard-widgets.js').createDashboardWidgetService>} deps.widgets
 * @param {ReturnType<import('../services/widget-settings.js').createWidgetSettingsService>} deps.widgetSettings
 * @param {string} deps.timeZone
 * @param {() => Date} deps.now
 */
export function dashboardRouter({ dashboard, widgets, widgetSettings, timeZone, now }) {
  const router = Router();
  router.get('/', (req, res) => {
    res.json(dashboard.get(req.user, { now: now(), timeZone }));
  });

  const supervisors = requireRole('SUPERVISOR', 'ADMIN');
  router.get('/widgets', supervisors, validate({ query: widgetsQuery }), (req, res) => {
    const instant = now();
    const today = dateInZone(timeZone, instant);
    const { keys, ...query } = req.valid.query;
    // D65: widgets switched off are left out for supervisors (a list kept on a device may
    // still name them).
    const disabled = widgetSettings.disabled();
    const shown = keys.filter((key) => widgetAvailable(key, req.user.role, disabled));
    res.json({
      today,
      generated_at: instant.toISOString(),
      widgets: shown.length
        ? widgets.figures(shown, filtersOf(query), { today, userId: req.user.id, timeZone })
        : {},
    });
  });

  router.get(
    '/widgets/:key/rows',
    supervisors,
    validate({ params: keyParams, query: rowsQuery }),
    (req, res) => {
      const { segment, ...query } = req.valid.query;
      widgetSettings.assertAvailable(req.valid.params.key, req.user);
      res.json(
        widgets.rows(req.valid.params.key, segment, filtersOf(query), {
          today: dateInZone(timeZone, now()),
          userId: req.user.id,
          timeZone,
        }),
      );
    },
  );
  return router;
}
