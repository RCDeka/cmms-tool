// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Entity definitions: API and UI paths (D18), table columns and detail fields.
// Field types drive formatting: text (default), enum, date, datetime, boolean, hours, user,
// asset (work order → asset link).

const COMMON_FIELDS = {
  site: { label: 'Site' },
  category: { label: 'Category', type: 'enum', enum: 'category' },
  updated_by: { label: 'Last modified by', type: 'user' },
  updated_at: { label: 'Last modified', type: 'datetime' },
};

export const ENTITIES = {
  assets: {
    key: 'assets',
    prefix: 'asset',
    api: '/assets',
    ui: '/assets',
    label: 'Assets',
    singular: 'Asset',
    title: (r) => `${r.code} — ${r.name}`,
    fields: {
      ...COMMON_FIELDS,
      code: { label: 'Asset code' },
      name: { label: 'Name' },
      building: { label: 'Building' },
      floor: { label: 'Floor' },
      subcategory: { label: 'Subcategory' },
      criticality: { label: 'Criticality', type: 'enum', enum: 'criticality' },
      status: { label: 'Status', type: 'enum', enum: 'asset_status' },
      brand: { label: 'Brand' },
      model: { label: 'Model' },
      serial_number: { label: 'Serial number' },
      commissioned_on: { label: 'Commissioning date', type: 'date' },
      last_serviced_on: { label: 'Last service date', type: 'date' },
      supplier: { label: 'Supplier' },
      maintenance_contract: { label: 'Maintenance contract', type: 'boolean' },
      responsible_technician: { label: 'Responsible technician' },
      exact_location: { label: 'Exact location' },
      comment: { label: 'Comment' },
    },
    // Brief: code, name, site, category, criticality, status.
    columns: ['code', 'name', 'site', 'category', 'criticality', 'status'],
    // Columns kept when the detail panel takes half of the width (the panel shows the rest).
    splitColumns: ['code', 'name', 'status'],
    // Every column sorts (API sort key = column name); the API default comes first.
    defaultSort: { sort: 'code', order: 'asc' },
    sortColumns: ['code', 'name', 'site', 'category', 'criticality', 'status'],
    detailFields: [
      'code',
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
      'updated_by',
      'updated_at',
    ],
  },
  work_orders: {
    key: 'work_orders',
    prefix: 'wo',
    api: '/work-orders',
    ui: '/work-orders',
    label: 'Work orders',
    singular: 'Work order',
    title: (r) => `${r.number} — ${r.title}`,
    fields: {
      ...COMMON_FIELDS,
      number: { label: 'Number' },
      title: { label: 'Title' },
      type: { label: 'Type', type: 'enum', enum: 'work_order_type' },
      status: { label: 'Status', type: 'enum', enum: 'work_order_status' },
      priority: { label: 'Priority', type: 'enum', enum: 'work_order_priority' },
      description: { label: 'Description' },
      location: { label: 'Location' },
      // editField: the API field a row edits when it shows a nested object.
      asset: { label: 'Asset', type: 'asset', editField: 'asset_id' },
      assignee: { label: 'Assignee', type: 'user', editField: 'assignee_id' },
      supervisor: { label: 'Supervisor', type: 'user', editField: 'supervisor_id' },
      created_on: { label: 'Created', type: 'date' },
      due_on: { label: 'Due', type: 'date' },
      started_on: { label: 'Started', type: 'date' },
      closed_on: { label: 'Closed', type: 'date' },
      estimated_hours: { label: 'Estimated time', type: 'hours' },
      actual_hours: { label: 'Actual time', type: 'hours' },
      work_report: { label: 'Work report' },
      created_by: { label: 'Created by', type: 'user' },
      // Staff requests (D47): set by the review, never through the edit form.
      review_status: { label: 'Request review', type: 'enum', enum: 'review_status' },
      reviewed_by: { label: 'Reviewed by', type: 'user' },
      reviewed_at: { label: 'Reviewed', type: 'datetime' },
      review_note: { label: 'Reason for rejection' },
      // Preventive visits (D48): set by the release of a plan's visit.
      plan: { label: 'Maintenance plan', type: 'plan', editField: 'plan_id' },
      planned_week: { label: 'Planned week', type: 'week' },
    },
    columns: ['number', 'title', 'site', 'priority', 'status', 'assignee', 'due_on'],
    splitColumns: ['number', 'title', 'status'],
    // Newest first by default: not a column, so no header shows the default order.
    defaultSort: { sort: 'created_on', order: 'desc' },
    sortColumns: ['number', 'title', 'site', 'priority', 'status', 'assignee', 'due_on'],
    detailFields: [
      'number',
      'title',
      'status',
      'review_status',
      'priority',
      'type',
      'category',
      'site',
      'location',
      'asset',
      'plan',
      'planned_week',
      'description',
      'assignee',
      'supervisor',
      'created_on',
      'due_on',
      'started_on',
      'closed_on',
      'estimated_hours',
      'actual_hours',
      'work_report',
      'created_by',
      'reviewed_by',
      'reviewed_at',
      'review_note',
      'updated_by',
      'updated_at',
    ],
    // On phones and for technicians (M9): the job on site first (what, where, the report and
    // time), the record's bookkeeping after.
    fieldWorkFields: [
      'status',
      'review_status',
      'priority',
      'description',
      'site',
      'location',
      'asset',
      'due_on',
      'work_report',
      'actual_hours',
      'estimated_hours',
      'started_on',
      'closed_on',
      'title',
      'number',
      'type',
      'category',
      'plan',
      'planned_week',
      'assignee',
      'supervisor',
      'created_on',
      'created_by',
      'reviewed_by',
      'reviewed_at',
      'review_note',
      'updated_by',
      'updated_at',
    ],
  },
};

/**
 * Fields of a record panel, in order: the field-work order when the entity has one and
 * `fieldWork` is asked for (M9). Pure.
 * @param {string} entityKey
 * @param {boolean} fieldWork
 */
export function detailFieldsOf(entityKey, fieldWork) {
  const cfg = ENTITIES[entityKey];
  return fieldWork && cfg.fieldWorkFields ? cfg.fieldWorkFields : cfg.detailFields;
}

/** Entity for a UI path segment ('assets', 'work-orders'), or undefined. */
export function entityForSegment(segment) {
  return Object.values(ENTITIES).find((e) => e.ui === `/${segment}`);
}

/**
 * Detail field and definition for an API field (asset_id → asset, assignee_id → assignee).
 * @returns {{ field: string, def: object } | null}
 */
export function fieldForApi(entityKey, apiField) {
  const { fields } = ENTITIES[entityKey];
  const field = Object.keys(fields).find((f) => (fields[f].editField ?? f) === apiField);
  return field ? { field, def: fields[field] } : null;
}
