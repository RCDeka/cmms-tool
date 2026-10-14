// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Field value schemas for writes (docs/data-model.md → Tables; docs/api-design.md → PUT).
import { z } from 'zod';
import { isWeek } from '../lib/iso-week.js';
import {
  ASSET_STATUSES,
  CATEGORIES,
  CRITICALITIES,
  PERFORMERS,
  PLAN_TYPES,
  SCHEDULE_MODES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from './enums.js';

/** Empty or blank strings mean "no value" for optional fields. */
const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);

const requiredText = (max) => z.string().trim().min(1, 'Required').max(max);
const optionalText = (max) => z.preprocess(blankToNull, z.string().trim().max(max).nullable());

const isRealDate = (value) => {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
  .refine(isRealDate, 'Not a valid date');
const optionalDate = z.preprocess(blankToNull, isoDate.nullable());

const hours = z.number().min(0).max(10_000).nullable();
const optionalId = z.number().int().positive().nullable();
/** A place of the location tree (D82); `site` alone means the site itself (BR-LOC7). */
const placeId = z.number().int().positive();

/** Editable asset fields and their value schemas. */
export const ASSET_FIELDS = {
  name: requiredText(200),
  site: requiredText(200),
  location_id: placeId,
  category: z.enum(CATEGORIES),
  subcategory: optionalText(150),
  criticality: z.enum(CRITICALITIES),
  status: z.enum(ASSET_STATUSES),
  brand: optionalText(150),
  model: optionalText(150),
  serial_number: optionalText(150),
  commissioned_on: optionalDate,
  last_serviced_on: optionalDate,
  supplier: optionalText(150),
  maintenance_contract: z.boolean(),
  responsible_technician: optionalText(150),
  exact_location: optionalText(200),
  comment: optionalText(2000),
};

/** ISO week 'YYYY-Www' that exists (2026 has a week 53, 2027 has not). */
export const isoWeek = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'Expected a week as YYYY-Www')
  .refine(isWeek, 'Not a valid week');

/** Editable work order fields and their value schemas. */
export const WORK_ORDER_FIELDS = {
  type: z.enum(WORK_ORDER_TYPES),
  status: z.enum(WORK_ORDER_STATUSES),
  priority: z.enum(WORK_ORDER_PRIORITIES),
  title: requiredText(200),
  description: optionalText(4000),
  asset_id: optionalId,
  site: requiredText(200),
  location_id: placeId,
  location: optionalText(200),
  category: z.enum(CATEGORIES).nullable(),
  assignee_id: optionalId,
  supervisor_id: optionalId,
  due_on: optionalDate,
  started_on: optionalDate,
  closed_on: optionalDate,
  estimated_hours: hours,
  actual_hours: hours,
  work_report: optionalText(4000),
  // The week the work is planned in: set by the release or the first block of the week
  // scheduler, and rescheduled by supervisors and admins (D55).
  planned_week: z.preprocess(blankToNull, isoWeek.nullable()),
};

/** Hours in half-hour steps (P4). */
const halfHours = (max) =>
  z.number().positive().max(max).multipleOf(0.5, 'Use steps of half an hour');

/** Editable maintenance plan fields and their value schemas (D48). */
export const PLAN_FIELDS = {
  title: requiredText(200),
  description: optionalText(4000),
  type: z.enum(PLAN_TYPES),
  category: z.enum(CATEGORIES),
  asset_id: optionalId,
  site: requiredText(200),
  location_id: placeId,
  location: optionalText(200),
  estimated_hours: halfHours(200),
  frequency_weeks: z.number().int().min(1).max(104),
  anchor_week: isoWeek,
  end_week: z.preprocess(blankToNull, isoWeek.nullable()),
  schedule_mode: z.enum(SCHEDULE_MODES),
  tolerance_weeks: z.number().int().min(0).max(8),
  season_from_week: z.number().int().min(1).max(53).nullable(),
  season_to_week: z.number().int().min(1).max(53).nullable(),
  performed_by: z.enum(PERFORMERS),
  supplier: optionalText(150),
  is_active: z.boolean(),
};

/** Planning settings, administrators only (P16). */
export const PLANNING_SETTINGS_FIELDS = {
  daily_hours: halfHours(12),
  reserve_percent: z.number().int().min(0).max(80),
  release_weeks_ahead: z.number().int().min(1).max(12),
  max_block_hours: halfHours(8),
};

export const EDITABLE_FIELDS = { assets: ASSET_FIELDS, work_orders: WORK_ORDER_FIELDS };

/**
 * Fields that exist on the record but nobody can write through PUT (sending one → 403).
 * Includes the nested objects of the GET shape, so a client can send back what it received.
 */
export const READ_ONLY_FIELDS = {
  // `place` is the path of `location_id`, kept by the server (D82).
  assets: ['id', 'code', 'place', 'has_conflict', 'updated_by', 'created_at', 'updated_at'],
  work_orders: [
    'id',
    'number',
    'client_id',
    'created_on',
    'created_by',
    'has_conflict',
    'updated_by',
    'created_at',
    'updated_at',
    'place',
    'asset',
    'assignee',
    'supervisor',
    // Set by PUT /api/work-orders/:id/review only (D47).
    'review_status',
    'reviewed_by',
    'reviewed_at',
    'review_note',
    // Set by the release of a plan's visit (D48); planned_week is editable since D55.
    'plan_id',
    'plan',
  ],
};

/** Fields describing the write itself, not the record. */
export const WRITE_META = {
  version: z.number().int().min(1),
  edited_at: z.iso.datetime({ offset: true }).optional(),
};

/** Fields that are booleans in the API and 0/1 in SQLite. */
export const BOOLEAN_FIELDS = { assets: ['maintenance_contract'], work_orders: [] };
