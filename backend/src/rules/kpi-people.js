// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Responsiveness, asset and people KPIs of the dashboards (docs/spec-dashboards.md §6.4,
// Phase 24). Pure: dates are 'YYYY-MM-DD' in APP_TIMEZONE, instants ISO 8601 UTC.
import { addDays } from '../lib/dates.js';

const DAY_MS = 86_400_000;

/** Median of numbers (the mean of the two middle values for an even count), or null. */
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Percentile by nearest rank: the smallest value with at least `p` % of the values at or
 * below it ("90 % of the work orders were started within this time"), or null.
 */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil((p / 100) * sorted.length)) - 1];
}

/** Count, median and 90th percentile of durations. */
export function durationStats(values) {
  return { count: values.length, median: median(values), p90: percentile(values, 90) };
}

/** Hours from one instant to another (ISO 8601). */
export function hoursBetween(from, to) {
  return (Date.parse(to) - Date.parse(from)) / 3_600_000;
}

/** Whole days from one date to another ('YYYY-MM-DD'). */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** A repeat failure: the previous corrective work closed less than this many days before. */
export const REPEAT_DAYS = 30;

/**
 * Repeat failures among corrective work orders on assets (§6.4): for each work order, the
 * previous one on the same asset (created before it) closed less than 30 days before it was
 * created. Returns the repeats with their previous work order and the gap in days.
 * @param {{ id: number, asset_id: number, created_on: string, status: string,
 *   closed_on: string | null, number: string }[]} workOrders every corrective, not cancelled
 *   work order on an asset, any date
 * @param {(wo: object) => boolean} counted the ones created in the period
 */
export function repeatFailures(workOrders, counted) {
  const byAsset = new Map();
  for (const wo of workOrders) {
    if (!byAsset.has(wo.asset_id)) byAsset.set(wo.asset_id, []);
    byAsset.get(wo.asset_id).push(wo);
  }
  const repeats = [];
  for (const list of byAsset.values()) {
    list.sort((a, b) => a.created_on.localeCompare(b.created_on) || a.id - b.id);
    list.forEach((wo, i) => {
      const previous = list[i - 1];
      if (!previous || !counted(wo) || previous.status !== 'CLOSED' || !previous.closed_on) return;
      const gap = daysBetween(previous.closed_on, wo.created_on);
      if (gap >= 0 && gap < REPEAT_DAYS) repeats.push({ ...wo, previous, gap });
    });
  }
  return repeats;
}

/**
 * Days with a breakdown (§6.4): the calendar days of [from, to] on which an asset was broken
 * down at some time. `spells` are its breakdowns, each from the day it broke down to the day
 * it was repaired (null: still broken down, counted until `to`).
 * @param {{ start: string, end: string | null }[]} spells
 */
export function downDays(spells, from, to) {
  const days = new Set();
  for (const { start, end } of spells) {
    let day = start < from ? from : start;
    const last = end === null || end > to ? to : end;
    while (day <= last) {
      days.add(day);
      day = addDays(day, 1);
    }
  }
  return days.size;
}

/**
 * Breakdown spells of an asset from its status history (oldest first): a spell starts when
 * the status becomes BROKEN_DOWN and ends on the day it changes to anything else.
 * @param {{ day: string, to: string }[]} changes status after each change, with its day
 */
export function breakdownSpells(changes) {
  const spells = [];
  let open = null;
  for (const { day, to } of changes) {
    if (to === 'BROKEN_DOWN' && !open) open = { start: day, end: null };
    else if (to !== 'BROKEN_DOWN' && open) {
      spells.push({ ...open, end: day });
      open = null;
    }
  }
  if (open) spells.push(open);
  return spells;
}
