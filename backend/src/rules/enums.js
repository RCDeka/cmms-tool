// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Enumerated values, defined once for the backend. Must match docs/data-model.md and the
// CHECK constraints in db/migrations/ (001_init.sql, 006 for roles) (verified by test/unit/schema.test.js).

export const ROLES = ['STAFF', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN'];

/** Roles of the maintenance team: everyone except STAFF, who only submit requests (D46). */
export const MAINTENANCE_ROLES = ['TECHNICIAN', 'SUPERVISOR', 'ADMIN'];

export const CATEGORIES = [
  'HVAC',
  'ELECTRICAL',
  'FIRE_SAFETY',
  'PLUMBING',
  'NETWORK_CABLING',
  'SECURITY',
];

export const CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const ASSET_STATUSES = ['IN_SERVICE', 'BROKEN_DOWN', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE'];

export const WORK_ORDER_TYPES = ['CORRECTIVE', 'PREVENTIVE', 'IMPROVEMENT', 'REGULATORY'];

export const WORK_ORDER_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED'];

export const TERMINAL_WORK_ORDER_STATUSES = ['CLOSED', 'CANCELLED'];

export const WORK_ORDER_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export const CONFLICT_STATUSES = ['OPEN', 'RESOLVED'];

export const CONFLICT_RESOLUTIONS = ['A', 'B', 'MERGE'];

export const CONFLICT_ENTITY_TYPES = ['assets', 'work_orders'];

/** Review of a staff request by a supervisor (D47); NULL for other work orders. */
export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

export const FEEDBACK_STATUSES = ['NEW', 'PLANNED', 'DONE', 'DECLINED'];

// Preventive maintenance (D48, docs/data-model.md → Preventive maintenance).

/** Work order type of a plan's visits. */
export const PLAN_TYPES = ['PREVENTIVE', 'REGULATORY'];

/** FIXED plans keep their calendar; FLOATING ones restart from each closed visit (BR-P5). */
export const SCHEDULE_MODES = ['FIXED', 'FLOATING'];

export const PERFORMERS = ['INTERNAL', 'CONTRACTOR'];

export const OCCURRENCE_STATUSES = ['PLANNED', 'RELEASED', 'SKIPPED'];

// Week scheduler (D48, Phase 19, docs/data-model.md → allocations).

/** A block of hours on a work order, or travel, preparation or other time (P10). */
export const ALLOCATION_KINDS = ['WORK', 'TRAVEL', 'PREPARATION', 'OTHER'];

/** Why a person's hours on a day differ from the default. */
export const CAPACITY_REASONS = ['LEAVE', 'PART_TIME', 'TRAINING', 'WEEKEND', 'OTHER'];

/** Records whose changes are written to the audit log. */
export const AUDIT_ENTITY_TYPES = [
  'assets',
  'work_orders',
  'users',
  'maintenance_plans',
  'plan_occurrences',
  'allocations',
  'planning_settings',
];
