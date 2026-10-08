// Business rules the interface needs to offer only valid actions. Copies of the backend rules
// (backend/src/rules/work-order-status.js and permissions.js), checked equal by
// test/rules.test.js. The server stays the authority: it checks everything again.
import { TERMINAL_WORK_ORDER_STATUSES } from './enums.js';

/** Allowed status transitions (BR-W4). */
export const TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'CLOSED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

const ASSET_FIELDS = [
  'name',
  'site',
  'building',
  'floor',
  'category',
  'subcategory',
  'criticality',
  'status',
  'brand',
  'model',
  'serial_number',
  'commissioned_on',
  'last_serviced_on',
  'supplier',
  'maintenance_contract',
  'responsible_technician',
  'exact_location',
  'comment',
];
const WORK_ORDER_FIELDS = [
  'type',
  'status',
  'priority',
  'title',
  'description',
  'asset_id',
  'site',
  'location',
  'category',
  'assignee_id',
  'supervisor_id',
  'due_on',
  'started_on',
  'closed_on',
  'estimated_hours',
  'actual_hours',
  'work_report',
];

/** Editable fields (API names) per entity and role (docs/api-design.md → Permission matrix). */
export const EDITABLE_BY_ROLE = {
  assets: {
    TECHNICIAN: ['status', 'comment', 'last_serviced_on'],
    SUPERVISOR: ASSET_FIELDS,
    ADMIN: ASSET_FIELDS,
  },
  work_orders: {
    TECHNICIAN: ['status', 'started_on', 'actual_hours', 'work_report'],
    SUPERVISOR: WORK_ORDER_FIELDS,
    ADMIN: WORK_ORDER_FIELDS,
  },
};

/** Fields the creation form offers (BR-W9); technicians cannot pick people (BR-W12). */
export const CREATION_FIELDS = {
  TECHNICIAN: [
    'title',
    'type',
    'priority',
    'asset_id',
    'site',
    'location',
    'category',
    'description',
    'due_on',
    'estimated_hours',
  ],
  SUPERVISOR: [
    'title',
    'type',
    'priority',
    'asset_id',
    'site',
    'location',
    'category',
    'description',
    'assignee_id',
    'supervisor_id',
    'due_on',
    'estimated_hours',
  ],
};
CREATION_FIELDS.ADMIN = CREATION_FIELDS.SUPERVISOR;

/** Asset creation and deletion (BR-A4, BR-A3): supervisors and admins, online. */
export const ASSET_CREATION_FIELDS = [
  'code',
  'name',
  'site',
  'building',
  'floor',
  'exact_location',
  'category',
  'subcategory',
  'criticality',
  'status',
  'brand',
  'model',
  'serial_number',
  'commissioned_on',
  'last_serviced_on',
  'supplier',
  'maintenance_contract',
  'responsible_technician',
  'comment',
];
export const canManageAssets = (user) => ['SUPERVISOR', 'ADMIN'].includes(user?.role);

export const isTerminal = (status) => TERMINAL_WORK_ORDER_STATUSES.includes(status);

/** Statuses to offer for a work order: the current one and its allowed next ones. */
export function statusOptions(current) {
  return [current, ...(TRANSITIONS[current] ?? [])];
}

/** Set by the review only while a staff request waits for it (BR-R7, D47). */
const SET_BY_REVIEW = ['status', 'assignee_id'];

/** Supervisors and admins approve or reject staff requests (D47). */
export const canReviewRequests = (user) => ['SUPERVISOR', 'ADMIN'].includes(user?.role);

/**
 * Fields this user may change on this record now. Empty when the record is read-only for
 * them: open conflict (BR-V4), terminal work order (BR-W7), or a technician who is not the
 * assignee. A staff request waiting for review is assigned and cancelled by the review only.
 */
export function editableFields(entity, user, record) {
  if (!user || record.has_conflict) return [];
  if (entity === 'work_orders') {
    if (isTerminal(record.status)) return [];
    if (user.role === 'TECHNICIAN' && record.assignee_id !== user.id) return [];
  }
  const fields = EDITABLE_BY_ROLE[entity]?.[user.role] ?? [];
  return record.review_status === 'PENDING'
    ? fields.filter((f) => !SET_BY_REVIEW.includes(f))
    : fields;
}

/** Checks of the review form before asking the server (D47). Pure. */
export function checkReview(decision, values) {
  if (decision === 'APPROVE') {
    return values.assignee_id ? {} : { assignee_id: 'Choose who will do the work' };
  }
  return String(values.reason ?? '').trim() ? {} : { reason: 'Say why the request is rejected' };
}

/**
 * Checks the server would refuse anyway, done first for a quicker message.
 * @returns {Record<string, string>} field → message; empty when fine
 */
export function checkBeforeSave(entity, record, changes) {
  const after = { ...record, ...changes };
  const errors = {};
  const required = entity === 'assets' ? ['name', 'site'] : ['title', 'site'];
  for (const field of required) {
    if (field in changes && !String(changes[field] ?? '').trim()) errors[field] = 'Required';
  }
  if (entity === 'work_orders') {
    if (changes.status === 'CLOSED' && !String(after.work_report ?? '').trim()) {
      errors.work_report = 'A work report is required to close a work order.';
    }
    if (after.due_on && after.created_on && after.due_on < after.created_on) {
      errors.due_on = 'The due date cannot be earlier than the creation date.';
    }
    if (after.closed_on && after.started_on && after.closed_on < after.started_on) {
      errors.closed_on = 'The closing date cannot be earlier than the start date.';
    }
  }
  return errors;
}

/** Checks of the asset creation form, before asking the server. */
export function checkBeforeCreateAsset(values) {
  const errors = {};
  for (const field of ['name', 'site', 'category', 'criticality']) {
    if (!String(values[field] ?? '').trim()) errors[field] = 'Required';
  }
  if (values.code && !/^[A-Z0-9][A-Z0-9-]{1,49}$/.test(values.code.trim().toUpperCase())) {
    errors.code = 'Capitals, digits and hyphens only, 2 to 50 characters';
  }
  return errors;
}

/** Checks of the creation form (BR-W9). */
export function checkBeforeCreate(values) {
  const errors = {};
  if (!String(values.title ?? '').trim()) errors.title = 'Required';
  if (!values.type) errors.type = 'Required';
  if (!values.asset_id && !values.site) errors.site = 'Choose an asset or a site';
  return errors;
}
