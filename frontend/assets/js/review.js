// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Review of a staff request by a supervisor or an admin (D47): approve it and allocate it to a
// technician or a supervisor, or reject it with a reason the requester sees. Online only.
import { h } from './dom.js';
import { CATEGORIES, WORK_ORDER_PRIORITIES, WORK_ORDER_TYPES } from './enums.js';
import { formatDateTime, personName } from './format.js';
import { valueLabel } from './labels.js';
import { applyToPage } from './network.js';
import { checkReview } from './rules.js';

/** Body of PUT /api/work-orders/:id/review. Empty optional fields are left out. Pure. */
export function reviewPayload(decision, values, version) {
  if (decision === 'REJECT') return { decision, version, reason: values.reason.trim() };
  const body = { decision, version, assignee_id: Number(values.assignee_id) };
  for (const field of ['type', 'priority', 'due_on'])
    if (values[field]) body[field] = values[field];
  body.category = values.category || null;
  return body;
}

/** Who can do the work: technicians first, then supervisors (BR-W3). Pure. */
export function resourceOptions(users) {
  const byName = (a, b) => personName(a).localeCompare(personName(b));
  return ['TECHNICIAN', 'SUPERVISOR'].flatMap((role) =>
    users
      .filter((u) => u.role === role)
      .sort(byName)
      .map((u) => [String(u.id), `${personName(u)} (${valueLabel('role', role).toLowerCase()})`]),
  );
}

/**
 * Review box for a staff request waiting for review.
 * @param {{ record: object, users: object[],
 *   onReview: (body: object) => Promise<{ fields?: object, message?: string } | null> }} options
 *   `onReview` sends the review; it resolves to errors to show, or null when done
 */
export function reviewPanel({ record, users, onReview }) {
  const control = (name, el) => {
    el.id = `review-${name}`;
    el.name = name;
    el.setAttribute('aria-describedby', `review-${name}-error`);
    return el;
  };
  const select = (name, options, value, empty) => {
    const el = control(
      name,
      h(
        'select',
        {},
        empty ? h('option', { value: '' }, empty) : null,
        options.map(([v, label]) => h('option', { value: v }, label)),
      ),
    );
    el.value = value ?? '';
    return el;
  };
  const row = (name, label, el, required = false) =>
    h(
      'div',
      { class: 'form-row' },
      h('label', { for: el.id }, label, required ? h('span', { class: 'required' }, ' *') : null),
      h(
        'div',
        { class: 'form-control' },
        el,
        h('p', { id: `review-${name}-error`, class: 'field-error' }),
      ),
    );

  const assignee = select('assignee_id', resourceOptions(users), '', '— Choose —');
  const type = select(
    'type',
    WORK_ORDER_TYPES.map((c) => [c, valueLabel('work_order_type', c)]),
    record.type,
  );
  const priority = select(
    'priority',
    WORK_ORDER_PRIORITIES.map((c) => [c, valueLabel('work_order_priority', c)]),
    record.priority,
  );
  const category = select(
    'category',
    CATEGORIES.map((c) => [c, valueLabel('category', c)]),
    record.category,
    '— None —',
  );
  const due = control('due_on', h('input', { type: 'date', value: record.due_on ?? '' }));
  const reason = control(
    'reason',
    h('textarea', { rows: '3', maxlength: '2000', placeholder: 'Shown to the requester' }),
  );
  const summary = h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' });
  const controls = { assignee_id: assignee, type, priority, category, due_on: due, reason };
  const values = () =>
    Object.fromEntries(Object.entries(controls).map(([name, el]) => [name, el.value]));

  const showErrors = (fields = {}, message = '') => {
    for (const [name, el] of Object.entries(controls)) {
      box.querySelector(`#review-${name}-error`).textContent = fields[name] ?? '';
      el.toggleAttribute('aria-invalid', Boolean(fields[name]));
    }
    summary.textContent = message;
    (box.querySelector('[aria-invalid]') ?? (message ? summary : null))?.focus();
  };
  const submit = async (decision) => {
    const errors = checkReview(decision, values());
    // Only the errors of the chosen action: rejecting needs no assignee.
    if (Object.keys(errors).length) return showErrors(errors, '');
    for (const b of buttons) b.disabled = true;
    try {
      const problem = await onReview(reviewPayload(decision, values(), record.version));
      if (problem) showErrors(problem.fields, problem.message);
    } finally {
      for (const b of buttons) b.disabled = false;
      applyToPage(box);
    }
  };
  const buttons = [
    h(
      'button',
      {
        type: 'button',
        class: 'button button-primary online-only',
        onClick: () => submit('APPROVE'),
      },
      'Approve and assign',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'button button-danger online-only',
        onClick: () => submit('REJECT'),
      },
      'Reject request',
    ),
  ];

  const author = record.created_by ? personName(record.created_by) : 'A staff member';
  const box = h(
    'section',
    { class: 'review-box', 'aria-labelledby': 'review-title' },
    h('h3', { id: 'review-title' }, 'Staff request to review'),
    h(
      'p',
      { class: 'muted' },
      `${author} sent this request on ${formatDateTime(record.created_at)}. Approve it and choose who will do the work, or reject it: the requester sees your decision.`,
    ),
    summary,
    h(
      'div',
      { class: 'detail-form review-form' },
      row('assignee_id', 'Assign to', assignee, true),
      row('type', 'Type', type),
      row('priority', 'Priority', priority),
      row('category', 'Category', category),
      row('due_on', 'Due date', due),
      h('div', { class: 'review-actions' }, buttons[0]),
      h('hr', { class: 'review-separator' }),
      row('reason', 'Reason for rejection', reason),
      h('div', { class: 'review-actions' }, buttons[1]),
    ),
  );
  applyToPage(box);
  return box;
}
