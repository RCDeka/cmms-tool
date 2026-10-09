// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Balancing assistant of the year planner (D48, Phase 20; docs/data-model.md → BR-B1 to BR-B4):
// proposes single-visit moves, each within its plan's rules, that lower the peak load and the
// trade imbalance. Pure: it reads a timeline (the API shape) and saves nothing.
import { addWeeks } from '../lib/iso-week.js';
import { allowedWeeks, inSeason, isBlocked } from './planning.js';

/** Most moves proposed at once: enough to smooth a year, few enough to review. */
export const MAX_MOVES = 30;

/**
 * Weeks one visit may be proposed to (BR-B2): its own move limits (BR-P3: tolerance, earlier
 * only for a regulatory visit, never the past), within the weeks shown, after the release
 * horizon (a visit moved into it would get its work order at once, and could no longer move
 * back), inside the plan's season, outside the weeks blocked for its site, and never a week
 * where its plan already has a visit.
 * @param {object} plan a timeline plan with its occurrences
 * @param {object} occurrence one of its planned visits
 * @param {{ weeks: string[], currentWeek: string, releaseWeeksAhead: number,
 *   blockedWeeks: object[] }} context
 * @returns {string[]}
 */
export function proposalTargets(
  plan,
  occurrence,
  { weeks, currentWeek, releaseWeeksAhead, blockedWeeks },
) {
  const { to } = allowedWeeks(plan, occurrence, currentWeek);
  const earliest = addWeeks(occurrence.due_week, -plan.tolerance_weeks);
  const released = addWeeks(currentWeek, releaseWeeksAhead);
  const from = earliest > released ? earliest : addWeeks(released, 1);
  const taken = new Set(plan.occurrences.map((o) => o.week));
  return weeks.filter(
    (w) =>
      w >= from &&
      w <= to &&
      !taken.has(w) &&
      inSeason(w, plan.season_from_week, plan.season_to_week) &&
      !isBlocked(w, plan.site, blockedWeeks),
  );
}

/**
 * Change of the balance score when `hours` move from a week at `source` hours to one at
 * `target` hours, against `capacity`: the sum of squared loads, so the busiest weeks weigh the
 * most. Negative is better. Without capacity the term does not count.
 */
const squaredDelta = (source, target, hours, capacity) =>
  capacity > 0 ? (2 * hours * (target - source) + 2 * hours * hours) / (capacity * capacity) : 0;

/**
 * Proposed moves for the plans of a timeline (BR-B1 to BR-B3). Greedy: at each step, the move
 * of one planned internal visit that lowers the score the most (weekly load, plus the load of
 * the visit's trade), as long as the week it goes to stays below where the week it leaves was
 * (so no week ever ends above the peak); each visit is moved once at most.
 * @param {object} timeline GET /api/planning/timeline answer
 * @param {{ maxMoves?: number }} [options]
 * @returns {{ occurrence_id: number, plan_id: number, from: string, to: string }[]}
 */
export function suggestMoves(timeline, { maxMoves = MAX_MOVES } = {}) {
  const weeks = timeline.weeks.map((w) => w.week);
  const index = new Map(weeks.map((w, i) => [w, i]));
  const total = timeline.capacity.weekly;
  const tradeCapacity = timeline.capacity.by_category;
  const hours = weeks.map(() => 0);
  const byTrade = {};
  const plans = timeline.groups.flatMap((g) => g.plans);
  for (const plan of plans) {
    if (plan.performed_by !== 'INTERNAL') continue;
    byTrade[plan.category] ??= weeks.map(() => 0);
    for (const o of plan.occurrences) {
      if (o.status === 'SKIPPED' || !index.has(o.week)) continue;
      hours[index.get(o.week)] += plan.estimated_hours;
      byTrade[plan.category][index.get(o.week)] += plan.estimated_hours;
    }
  }

  const context = {
    weeks,
    currentWeek: timeline.current_week,
    releaseWeeksAhead: timeline.settings.release_weeks_ahead,
    blockedWeeks: timeline.blocked_weeks,
  };
  const candidates = [];
  for (const plan of plans) {
    if (plan.performed_by !== 'INTERNAL') continue;
    for (const o of plan.occurrences) {
      if (o.status !== 'PLANNED' || !index.has(o.week)) continue;
      const targets = proposalTargets(plan, o, context);
      if (targets.length) candidates.push({ plan, occurrence: o, targets });
    }
  }

  const moves = [];
  const moved = new Set();
  while (moves.length < maxMoves) {
    let best = null;
    for (const c of candidates) {
      if (moved.has(c.occurrence.id)) continue;
      const h = c.plan.estimated_hours;
      const trade = byTrade[c.plan.category];
      const s = index.get(c.occurrence.week);
      for (const target of c.targets) {
        const t = index.get(target);
        // Never fill a week above where the left week was: the peak cannot rise.
        if (hours[t] + h > hours[s]) continue;
        const delta =
          squaredDelta(hours[s], hours[t], h, total) +
          squaredDelta(trade[s], trade[t], h, tradeCapacity[c.plan.category] ?? 0);
        // Ties: the smaller shift from the visit's due week, then the earlier week.
        const shift = Math.abs(t - index.get(c.occurrence.due_week ?? c.occurrence.week));
        if (
          delta < -1e-9 &&
          (!best ||
            delta < best.delta - 1e-9 ||
            (Math.abs(delta - best.delta) <= 1e-9 && shift < best.shift))
        ) {
          best = { candidate: c, target, s, t, delta, shift };
        }
      }
    }
    if (!best) break;
    const { candidate, target, s, t } = best;
    const h = candidate.plan.estimated_hours;
    hours[s] -= h;
    hours[t] += h;
    byTrade[candidate.plan.category][s] -= h;
    byTrade[candidate.plan.category][t] += h;
    moved.add(candidate.occurrence.id);
    // No second visit of the plan in its new week.
    for (const c of candidates) {
      if (c.plan.id === candidate.plan.id && !moved.has(c.occurrence.id)) {
        c.targets = c.targets.filter((w) => w !== target);
      }
    }
    moves.push({
      occurrence_id: candidate.occurrence.id,
      plan_id: candidate.plan.id,
      from: candidate.occurrence.week,
      to: target,
    });
  }
  return moves;
}
