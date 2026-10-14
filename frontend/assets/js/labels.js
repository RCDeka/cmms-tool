// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// UI labels for enum codes and fields (docs/data-model.md → Enumerated values).

export const VALUE_LABELS = {
  role: {
    STAFF: 'Staff',
    TECHNICIAN: 'Technician',
    SUPERVISOR: 'Supervisor',
    ADMIN: 'Administrator',
  },
  category: {
    HVAC: 'HVAC',
    ELECTRICAL: 'Electrical',
    FIRE_SAFETY: 'Fire safety',
    PLUMBING: 'Plumbing',
    NETWORK_CABLING: 'Network cabling',
    SECURITY: 'Security',
    UNSPECIFIED: 'Unspecified',
  },
  criticality: { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' },
  asset_status: {
    IN_SERVICE: 'In service',
    BROKEN_DOWN: 'Broken down',
    UNDER_MAINTENANCE: 'Under maintenance',
    OUT_OF_SERVICE: 'Out of service',
  },
  work_order_type: {
    CORRECTIVE: 'Corrective',
    PREVENTIVE: 'Preventive',
    IMPROVEMENT: 'Improvement',
    REGULATORY: 'Regulatory',
  },
  work_order_status: {
    OPEN: 'Open',
    IN_PROGRESS: 'In progress',
    ON_HOLD: 'On hold',
    CLOSED: 'Closed',
    CANCELLED: 'Cancelled',
  },
  work_order_priority: { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' },
  review_status: {
    PENDING: 'To review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    WITHDRAWN: 'Withdrawn',
  },
  // Preventive maintenance (D48).
  schedule_mode: { FIXED: 'Fixed calendar', FLOATING: 'From the last visit' },
  performed_by: { INTERNAL: 'Internal team', CONTRACTOR: 'Contractor' },
  occurrence_status: { PLANNED: 'Planned', RELEASED: 'Work order created', SKIPPED: 'Skipped' },
  planning_group: { site: 'Site', building: 'Building', category: 'Trade' },
  // Week scheduler (D48, Phase 19).
  allocation_kind: {
    WORK: 'Work',
    TRAVEL: 'Travel',
    PREPARATION: 'Preparation',
    OTHER: 'Other time',
  },
  capacity_reason: {
    LEAVE: 'Leave',
    PART_TIME: 'Part time',
    TRAINING: 'Training',
    WEEKEND: 'Weekend work',
    OTHER: 'Other',
  },
};

/**
 * Visual tone of each enum value, used for badge colors. Badges always show their text too,
 * so color is never the only cue (docs/ui-guidelines.md).
 */
export const VALUE_TONES = {
  criticality: { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'danger' },
  asset_status: {
    IN_SERVICE: 'success',
    BROKEN_DOWN: 'danger',
    UNDER_MAINTENANCE: 'warning',
    OUT_OF_SERVICE: 'neutral',
  },
  work_order_status: {
    OPEN: 'info',
    IN_PROGRESS: 'primary',
    ON_HOLD: 'warning',
    CLOSED: 'success',
    CANCELLED: 'neutral',
  },
  work_order_priority: { LOW: 'neutral', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' },
  review_status: {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'neutral',
    WITHDRAWN: 'neutral',
  },
};

/** Label of an enum code; falls back to the code itself. */
export function valueLabel(enumName, code) {
  return VALUE_LABELS[enumName]?.[code] ?? code;
}

/** Tone of an enum code; 'neutral' when the enum has no tones (e.g. category). */
export function valueTone(enumName, code) {
  return VALUE_TONES[enumName]?.[code] ?? 'neutral';
}
