// Audit log rules (docs/data-model.md → audit_log): what counts as a change.
import { sameValue } from './conflict-diff.js';

/**
 * Field changes between a record and new values: only fields whose value really changes.
 * @param {object} before API values of the record before the change
 * @param {object} after new values (only the fields that were written)
 * @returns {Record<string, { from: unknown, to: unknown }>}
 */
export function diffChanges(before, after) {
  const changes = {};
  for (const [field, to] of Object.entries(after)) {
    const from = before[field] ?? null;
    if (!sameValue(from, to)) changes[field] = { from, to: to ?? null };
  }
  return changes;
}

/** Changes of a new record: every field that has a value. */
export function creationChanges(values) {
  return diffChanges(
    {},
    Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    ),
  );
}

/** Readable label stored with each entry (kept after the record is deleted). */
export function auditLabel(entityType, record) {
  if (entityType === 'assets') return `${record.code} — ${record.name}`;
  if (entityType === 'work_orders') return `${record.number} — ${record.title}`;
  if (entityType === 'maintenance_plans') return `${record.code} — ${record.title}`;
  if (entityType === 'planning_settings') return 'Planning settings';
  return `${record.first_name} ${record.last_name} (${record.username})`;
}
