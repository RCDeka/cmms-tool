// Enumerated values, defined once for the backend. Must match docs/data-model.md and the
// CHECK constraints in db/migrations/001_init.sql (verified by test/unit/schema.test.js).

export const ROLES = ['TECHNICIAN', 'SUPERVISOR', 'ADMIN'];

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
