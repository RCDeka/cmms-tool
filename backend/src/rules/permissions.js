// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Who may write what (docs/api-design.md → Permission matrix, D23, D27).
import { ASSET_FIELDS, WORK_ORDER_FIELDS } from './fields.js';

const ALL_ASSET_FIELDS = Object.keys(ASSET_FIELDS);
const ALL_WORK_ORDER_FIELDS = Object.keys(WORK_ORDER_FIELDS);

/** Editable fields per entity and role. */
export const EDITABLE_BY_ROLE = {
  assets: {
    TECHNICIAN: ['status', 'comment', 'last_serviced_on'],
    SUPERVISOR: ALL_ASSET_FIELDS,
    ADMIN: ALL_ASSET_FIELDS,
  },
  work_orders: {
    TECHNICIAN: ['status', 'started_on', 'actual_hours', 'work_report'],
    SUPERVISOR: ALL_WORK_ORDER_FIELDS,
    ADMIN: ALL_WORK_ORDER_FIELDS,
  },
};

/** Fields of `fields` the role may not edit on this entity. */
export function forbiddenFields(entity, role, fields) {
  const allowed = new Set(EDITABLE_BY_ROLE[entity]?.[role] ?? []);
  return fields.filter((f) => !allowed.has(f));
}

/** Technicians may only change work orders assigned to them. Other roles: any record. */
export function canEditRecord(entity, user, record) {
  if (entity === 'work_orders' && user.role === 'TECHNICIAN') {
    return record.assignee_id === user.id;
  }
  return true;
}

/**
 * Creation restrictions for technicians (BR-W12): they can only assign the new work order
 * to themselves and cannot choose a supervisor. Returns the offending fields.
 */
export function forbiddenCreationFields(user, body) {
  if (user.role !== 'TECHNICIAN') return [];
  const fields = [];
  if (body.assignee_id !== undefined && body.assignee_id !== null && body.assignee_id !== user.id) {
    fields.push('assignee_id');
  }
  if (body.supervisor_id !== undefined && body.supervisor_id !== null) fields.push('supervisor_id');
  return fields;
}
