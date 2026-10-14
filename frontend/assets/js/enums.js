// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Enumerated values, defined once for the frontend. Must match docs/data-model.md and
// backend/src/rules/enums.js.

export const ROLES = ['STAFF', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN'];

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

/** Review of a staff request by a supervisor (D47); WITHDRAWN: cancelled by the requester (D79). */
export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'];

/** Preventive maintenance (D48). */
export const PLAN_TYPES = ['PREVENTIVE', 'REGULATORY'];
export const SCHEDULE_MODES = ['FIXED', 'FLOATING'];
export const PERFORMERS = ['INTERNAL', 'CONTRACTOR'];
export const OCCURRENCE_STATUSES = ['PLANNED', 'RELEASED', 'SKIPPED'];

/** Week scheduler (D48, Phase 19). */
export const ALLOCATION_KINDS = ['WORK', 'TRAVEL', 'PREPARATION', 'OTHER'];
export const CAPACITY_REASONS = ['LEAVE', 'PART_TIME', 'TRAINING', 'WEEKEND', 'OTHER'];

/** Enum lists by name, as referenced by field definitions in entities.js. */
export const ENUMS = {
  role: ROLES,
  category: CATEGORIES,
  criticality: CRITICALITIES,
  asset_status: ASSET_STATUSES,
  work_order_type: WORK_ORDER_TYPES,
  work_order_status: WORK_ORDER_STATUSES,
  work_order_priority: WORK_ORDER_PRIORITIES,
  review_status: REVIEW_STATUSES,
  schedule_mode: SCHEDULE_MODES,
  performed_by: PERFORMERS,
  occurrence_status: OCCURRENCE_STATUSES,
  allocation_kind: ALLOCATION_KINDS,
  capacity_reason: CAPACITY_REASONS,
};
