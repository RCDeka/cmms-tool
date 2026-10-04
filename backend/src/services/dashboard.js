// GET /api/dashboard (docs/data-model.md → KPI definitions).
import { dateInZone } from '../lib/dates.js';
import { compareMyWork, isMyWorkToday, monthRange } from '../rules/kpi.js';

const RECENT_ACTIVITY_SIZE = 5;

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ workOrders: ReturnType<import('./work-orders.js').createWorkOrderService> }} deps
 */
export function createDashboardService(db, { workOrders }) {
  // `due_on < @today` is NULL for work orders without a due date, and SUM skips NULL.
  const workOrderCounts = db.prepare(`SELECT
      coalesce(sum(status = 'OPEN'), 0) AS open_work_orders,
      coalesce(sum(status = 'IN_PROGRESS'), 0) AS in_progress_work_orders,
      coalesce(sum(status = 'CLOSED' AND closed_on BETWEEN @from AND @to), 0) AS closed_this_month,
      coalesce(sum(status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD') AND due_on < @today), 0)
        AS overdue_work_orders
    FROM work_orders`);
  const assetsBrokenDown = db
    .prepare("SELECT count(*) FROM assets WHERE status = 'BROKEN_DOWN'")
    .pluck();
  const pendingConflicts = db
    .prepare("SELECT count(*) FROM conflicts WHERE status = 'OPEN'")
    .pluck();

  return {
    /**
     * Dashboard of a user. `pending_conflicts` is only given to supervisors and admins.
     * @param {{ id: number, role: string }} user
     * @param {{ now: Date, timeZone: string }} ctx
     */
    get(user, { now, timeZone }) {
      const today = dateInZone(timeZone, now);
      const counts = workOrderCounts.get({ ...monthRange(today), today });
      const kpis = {
        open_work_orders: counts.open_work_orders,
        in_progress_work_orders: counts.in_progress_work_orders,
        closed_this_month: counts.closed_this_month,
        assets_broken_down: assetsBrokenDown.get(),
        overdue_work_orders: counts.overdue_work_orders,
      };
      if (['SUPERVISOR', 'ADMIN'].includes(user.role))
        kpis.pending_conflicts = pendingConflicts.get();

      return {
        today,
        generated_at: now.toISOString(),
        kpis,
        recent_activity: workOrders.recent(RECENT_ACTIVITY_SIZE),
        my_work_today: workOrders
          .openAssignedTo(user.id)
          .filter((wo) => isMyWorkToday(wo, user.id, today))
          .sort(compareMyWork),
      };
    },
  };
}
