// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Business rules the interface needs to offer only valid actions. Copies of the backend rules
// (backend/src/rules/work-order-status.js and permissions.js), checked equal by
// test/rules.test.js. The server stays the authority: it checks everything again.
import {
  DONE_WORK_ORDER_STATUSES,
  TERMINAL_WORK_ORDER_STATUSES,
  WORK_ORDER_STATUSES,
} from './enums.js';
import { t } from './i18n.js';

/** Allowed status transitions (BR-W4). */
export const TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

const ASSET_FIELDS = [
  'name',
  'site',
  'location_id',
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
  'location_id',
  'location',
  'category',
  'assignee_id',
  'supervisor_id',
  'due_on',
  'started_on',
  'completed_on',
  'closed_on',
  'estimated_hours',
  'actual_hours',
  'work_report',
  // Waived by supervisors and admins through "Mark done without a report" (BR-W6).
  'report_waived',
  'hold_reason',
  'hold_note',
  // Rescheduled by supervisors and admins (D55).
  'planned_week',
];

/** Editable fields (API names) per entity and role (docs/api-design.md → Permission matrix). */
export const EDITABLE_BY_ROLE = {
  assets: {
    TECHNICIAN: ['status', 'comment', 'last_serviced_on'],
    SUPERVISOR: ASSET_FIELDS,
    ADMIN: ASSET_FIELDS,
  },
  work_orders: {
    TECHNICIAN: [
      'status',
      'started_on',
      'completed_on',
      'actual_hours',
      'work_report',
      'hold_reason',
      'hold_note',
    ],
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
    'location_id',
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
    'location_id',
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
  'location_id',
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
export const isDone = (status) => DONE_WORK_ORDER_STATUSES.includes(status);

/**
 * True for an allowed transition or no change (BR-W4); back to OPEN from a hold only for work
 * that never started (BR-W5).
 */
export function canTransition(record, to) {
  const from = record.status;
  if (from === to) return true;
  if (from === 'ON_HOLD' && to === 'OPEN' && record.first_started_at) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Supervisors and admins close work orders and waive work reports (BR-W6, BR-W16). */
export const canClose = (user) => ['SUPERVISOR', 'ADMIN'].includes(user?.role);

/**
 * Statuses to offer for a work order: the current one and those the user may move it to.
 * Technicians do not close (BR-W16); an admin may choose any status (override, BR-W17).
 * @param {{ status: string, first_started_at?: string | null }} record
 * @param {{ role: string } | null} [user]
 */
export function statusOptions(record, user = null) {
  if (user?.role === 'ADMIN') {
    return [record.status, ...WORK_ORDER_STATUSES.filter((s) => s !== record.status)];
  }
  const next = (TRANSITIONS[record.status] ?? []).filter(
    (to) => canTransition(record, to) && (to !== 'CLOSED' || canClose(user)),
  );
  return [record.status, ...next];
}

/** An admin's change outside BR-W4: logged as an override (BR-W17). */
export function isOverride(record, to, user) {
  return (
    user?.role === 'ADMIN' &&
    to !== undefined &&
    to !== record.status &&
    (isTerminal(record.status) || !canTransition(record, to))
  );
}

/**
 * Status actions of the work order panel (D86), for a user who may change the status:
 * put on hold, mark technically done (or without a report, supervisors and admins: BR-W6),
 * close (supervisors and admins, BR-W16), reopen (BR-W15), and the admin's "Change status"
 * (BR-W17), which picks any status in the form. Pure.
 * @returns {{ key: 'hold' | 'complete' | 'waive' | 'close' | 'reopen' | 'override',
 *   status?: string, waive?: boolean }[]}
 */
export function statusActions(record, user) {
  if (!editableFields('work_orders', user, record).includes('status')) return [];
  const offered = statusOptions(record, user);
  const can = (to) => to !== record.status && offered.includes(to) && canTransition(record, to);
  const actions = [];
  if (can('ON_HOLD')) actions.push({ key: 'hold', status: 'ON_HOLD' });
  if (can('COMPLETED')) {
    actions.push({ key: 'complete', status: 'COMPLETED' });
    if (canClose(user) && !String(record.work_report ?? '').trim()) {
      actions.push({ key: 'waive', status: 'COMPLETED', waive: true });
    }
  }
  if (record.status === 'COMPLETED' && can('CLOSED'))
    actions.push({ key: 'close', status: 'CLOSED' });
  if (record.status === 'COMPLETED' && can('IN_PROGRESS')) {
    actions.push({ key: 'reopen', status: 'IN_PROGRESS' });
  }
  if (user?.role === 'ADMIN') actions.push({ key: 'override' });
  return actions;
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
    // An admin may still move a closed or cancelled one (BR-W17): its status and the hold.
    if (isTerminal(record.status)) {
      const withdrawn = ['WITHDRAWN', 'REJECTED'].includes(record.review_status);
      return user.role === 'ADMIN' && !withdrawn ? ['status', 'hold_reason', 'hold_note'] : [];
    }
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
    return values.assignee_id ? {} : { assignee_id: t('Choose who will do the work') };
  }
  return String(values.reason ?? '').trim() ? {} : { reason: t('Say why the request is rejected') };
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
    if (field in changes && !String(changes[field] ?? '').trim()) errors[field] = t('Required');
  }
  if (entity === 'work_orders') {
    const reported = String(after.work_report ?? '').trim() || after.report_waived;
    if (changes.status && isDone(changes.status) && !isDone(record.status) && !reported) {
      errors.work_report = t(
        'Write the work report first: the work cannot be marked technically done without it.',
      );
    }
    if (after.status === 'ON_HOLD' && !after.hold_reason) {
      errors.hold_reason = t('Say why the work order is on hold.');
    }
    if (after.due_on && after.created_on && after.due_on < after.created_on) {
      errors.due_on = t('The due date cannot be earlier than the creation date.');
    }
    if (after.completed_on && after.started_on && after.completed_on < after.started_on) {
      errors.completed_on = t('The completion date cannot be earlier than the start date.');
    }
    if (after.closed_on && after.started_on && after.closed_on < after.started_on) {
      errors.closed_on = t('The closing date cannot be earlier than the start date.');
    }
  }
  return errors;
}

/** Checks of the asset creation form, before asking the server. */
export function checkBeforeCreateAsset(values) {
  const errors = {};
  for (const field of ['name', 'category', 'criticality']) {
    if (!String(values[field] ?? '').trim()) errors[field] = t('Required');
  }
  if (!values.location_id) errors.location_id = t('Required');
  if (values.code && !/^[A-Z0-9][A-Z0-9-]{1,49}$/.test(values.code.trim().toUpperCase())) {
    errors.code = t('Capitals, digits and hyphens only, 2 to 50 characters');
  }
  return errors;
}

/** Checks of the creation form (BR-W9). */
export function checkBeforeCreate(values) {
  const errors = {};
  if (!String(values.title ?? '').trim()) errors.title = t('Required');
  if (!values.type) errors.type = t('Required');
  if (!values.asset_id && !values.location_id) {
    errors.location_id = t('Choose an asset or a place');
  }
  return errors;
}
