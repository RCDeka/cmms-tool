// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Entity definitions: API and UI paths (D18), table columns and detail fields.
// Field types drive formatting: text (default), enum, date, datetime, boolean, hours, user,
// asset (work order → asset link), place (the path of `location_id` in the location tree, D82).
import { t } from './i18n.js';

const COMMON_FIELDS = {
  site: { label: t('Site') },
  category: { label: t('Category'), type: 'enum', enum: 'category' },
  updated_by: { label: t('Last modified by'), type: 'user' },
  updated_at: { label: t('Last modified'), type: 'datetime' },
};

export const ENTITIES = {
  assets: {
    key: 'assets',
    prefix: 'asset',
    api: '/assets',
    ui: '/assets',
    label: t('Assets'),
    singular: t('Asset'),
    noMatch: t('No asset matches this search.'),
    emptyPage: t('No assets on this page.'),
    // Whole sentences, since French words agree with the entity ("cet équipement").
    text: {
      loadingList: t('Loading assets…'),
      loadingRecord: t('Loading the asset…'),
      notFound: t('This asset does not exist.'),
      notOffline: t('This asset is not available offline.'),
      saved: t('Asset saved.'),
      pageNotSaved: (page) =>
        t('Page {page} of the assets has not been loaded before, so it is not available offline.', {
          page,
        }),
    },
    title: (r) => `${r.code} — ${r.name}`,
    fields: {
      ...COMMON_FIELDS,
      code: { label: t('Asset code') },
      name: { label: t('asset|Name') },
      // The path below the site; edited through location_id with the place picker (D82).
      place: { label: t('Place'), type: 'place', editField: 'location_id' },
      subcategory: { label: t('Subcategory') },
      criticality: { label: t('Criticality'), type: 'enum', enum: 'criticality' },
      status: { label: t('Status'), type: 'enum', enum: 'asset_status' },
      brand: { label: t('Brand') },
      model: { label: t('Model') },
      serial_number: { label: t('Serial number') },
      commissioned_on: { label: t('Commissioning date'), type: 'date' },
      last_serviced_on: { label: t('Last service date'), type: 'date' },
      supplier: { label: t('Supplier') },
      maintenance_contract: { label: t('Maintenance contract'), type: 'boolean' },
      responsible_technician: { label: t('Responsible technician') },
      exact_location: { label: t('Exact location') },
      comment: { label: t('Comment') },
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
      'place',
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
      'updated_by',
      'updated_at',
    ],
  },
  work_orders: {
    key: 'work_orders',
    prefix: 'wo',
    api: '/work-orders',
    ui: '/work-orders',
    label: t('Work orders'),
    singular: t('Work order'),
    noMatch: t('No work order matches this search.'),
    emptyPage: t('No work orders on this page.'),
    text: {
      loadingList: t('Loading work orders…'),
      loadingRecord: t('Loading the work order…'),
      notFound: t('This work order does not exist.'),
      notOffline: t('This work order is not available offline.'),
      saved: t('Work order saved.'),
      pageNotSaved: (page) =>
        t(
          'Page {page} of the work orders has not been loaded before, so it is not available offline.',
          { page },
        ),
    },
    title: (r) => `${r.number} — ${r.title}`,
    fields: {
      ...COMMON_FIELDS,
      number: { label: t('Number') },
      title: { label: t('Title') },
      type: { label: t('Type'), type: 'enum', enum: 'work_order_type' },
      status: { label: t('Status'), type: 'enum', enum: 'work_order_status' },
      // BR-W14 (D86): shown and asked for while on hold.
      hold_reason: { label: t('Hold reason'), type: 'enum', enum: 'hold_reason' },
      hold_note: { label: t('Hold note') },
      priority: { label: t('Priority'), type: 'enum', enum: 'work_order_priority' },
      description: { label: t('Description') },
      // The place (D82) and the words about it ("desk 12-21").
      place: { label: t('Place'), type: 'place', editField: 'location_id' },
      location: { label: t('Exact location') },
      // editField: the API field a row edits when it shows a nested object.
      asset: { label: t('Asset'), type: 'asset', editField: 'asset_id' },
      assignee: { label: t('Assignee'), type: 'user', editField: 'assignee_id' },
      supervisor: { label: t('Supervisor'), type: 'user', editField: 'supervisor_id' },
      created_on: { label: t('Created'), type: 'date' },
      due_on: { label: t('Due'), type: 'date' },
      started_on: { label: t('Started'), type: 'date' },
      completed_on: { label: t('Technically done'), type: 'date' },
      closed_on: { label: t('Closed'), type: 'date' },
      estimated_hours: { label: t('Estimated time'), type: 'hours' },
      actual_hours: { label: t('Actual time'), type: 'hours' },
      work_report: { label: t('Work report') },
      created_by: { label: t('Created by'), type: 'user' },
      // Staff requests (D47): set by the review, never through the edit form.
      review_status: { label: t('Request review'), type: 'enum', enum: 'review_status' },
      reviewed_by: { label: t('Reviewed by'), type: 'user' },
      reviewed_at: { label: t('Reviewed'), type: 'datetime' },
      review_note: { label: t('Reason for rejection') },
      // Preventive visits (D48): set by the release of a plan's visit.
      plan: { label: t('Maintenance plan'), type: 'plan', editField: 'plan_id' },
      planned_week: { label: t('Planned week'), type: 'week' },
    },
    columns: ['number', 'title', 'site', 'priority', 'status', 'assignee', 'due_on'],
    splitColumns: ['number', 'title', 'status'],
    // Newest first by default: not a column, so no header shows the default order.
    defaultSort: { sort: 'created_on', order: 'desc' },
    // completed_on: the "To close" queue, oldest first (D86); not a column.
    sortColumns: [
      'number',
      'title',
      'site',
      'priority',
      'status',
      'assignee',
      'due_on',
      'completed_on',
    ],
    detailFields: [
      'number',
      'title',
      'status',
      'hold_reason',
      'hold_note',
      'review_status',
      'priority',
      'type',
      'category',
      'site',
      'place',
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
      'completed_on',
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
      'hold_reason',
      'hold_note',
      'review_status',
      'priority',
      'description',
      'site',
      'place',
      'location',
      'asset',
      'due_on',
      'work_report',
      'actual_hours',
      'estimated_hours',
      'started_on',
      'completed_on',
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
