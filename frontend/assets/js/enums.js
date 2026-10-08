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

/** Review of a staff request by a supervisor (D47). */
export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

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
};
