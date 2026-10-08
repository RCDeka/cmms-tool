// Field value schemas for writes (docs/data-model.md → Tables; docs/api-design.md → PUT).
import { z } from 'zod';
import {
  ASSET_STATUSES,
  CATEGORIES,
  CRITICALITIES,
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

/** Editable asset fields and their value schemas. */
export const ASSET_FIELDS = {
  name: requiredText(200),
  site: requiredText(200),
  building: optionalText(100),
  floor: optionalText(50),
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

/** Editable work order fields and their value schemas. */
export const WORK_ORDER_FIELDS = {
  type: z.enum(WORK_ORDER_TYPES),
  status: z.enum(WORK_ORDER_STATUSES),
  priority: z.enum(WORK_ORDER_PRIORITIES),
  title: requiredText(200),
  description: optionalText(4000),
  asset_id: optionalId,
  site: requiredText(200),
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
};

export const EDITABLE_FIELDS = { assets: ASSET_FIELDS, work_orders: WORK_ORDER_FIELDS };

/**
 * Fields that exist on the record but nobody can write through PUT (sending one → 403).
 * Includes the nested objects of the GET shape, so a client can send back what it received.
 */
export const READ_ONLY_FIELDS = {
  assets: ['id', 'code', 'has_conflict', 'updated_by', 'created_at', 'updated_at'],
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
    'asset',
    'assignee',
    'supervisor',
    // Set by PUT /api/work-orders/:id/review only (D47).
    'review_status',
    'reviewed_by',
    'reviewed_at',
    'review_note',
  ],
};

/** Fields describing the write itself, not the record. */
export const WRITE_META = {
  version: z.number().int().min(1),
  edited_at: z.iso.datetime({ offset: true }).optional(),
};

/** Fields that are booleans in the API and 0/1 in SQLite. */
export const BOOLEAN_FIELDS = { assets: ['maintenance_contract'], work_orders: [] };
