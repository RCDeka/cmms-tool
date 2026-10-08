// Staff requests (D46): a staff member's open requests (home page), all their requests, the
// request form and the request page with its progress and comments. Online only.
import { commentForm, renderConversation } from './comments.js';
import { badgeClass, h, replaceChildren } from './dom.js';
import { CATEGORIES, WORK_ORDER_PRIORITIES } from './enums.js';
import { formatDate, formatDateTime, personName } from './format.js';
import { valueLabel } from './labels.js';
import { applyToPage } from './network.js';

export const REQUEST_SCOPES = ['open', 'all'];
/** Steps shown above a request; "On hold" takes the place of "In progress". */
export const REQUEST_STEPS = ['Received', 'Approved and assigned', 'In progress', 'Done'];

/** Labels of the urgency choices (priority codes). */
const URGENCY_LABELS = {
  LOW: 'Low: it can wait',
  NORMAL: 'Normal',
  HIGH: 'High: it disturbs work',
  URGENT: 'Urgent: safety risk, or work is impossible',
};
const DONT_KNOW = "I don't know";

/** Values typed in the request form but not sent yet; kept while the app is open. */
let unsentRequest = null;

/** URL of a request list. Pure. */
export function requestsUrl(scope = 'open', page = 1) {
  const path = scope === 'all' ? '/requests/all' : '/requests';
  return page > 1 ? `${path}?page=${page}` : path;
}

/**
 * Where a request stands and what happens next, in the requester's words. Pure.
 * @param {{ status: string, assignee: object | null, due_on: string | null,
 *   closed_on: string | null }} request
 * @returns {{ stage: string, label: string, tone: string, step: number | null, next: string }}
 *   `step`: index in REQUEST_STEPS, null for a cancelled request
 */
export function requestProgress(request) {
  const who = request.assignee ? personName(request.assignee) : null;
  const by = request.due_on ? ` by ${formatDate(request.due_on)}` : '';
  if (request.review_status === 'PENDING') {
    return {
      stage: 'REVIEW',
      label: 'Waiting for review',
      tone: 'info',
      step: 0,
      next: 'A supervisor will review your request, then assign a technician to it.',
    };
  }
  if (request.review_status === 'REJECTED') {
    return {
      stage: 'REJECTED',
      label: 'Rejected',
      tone: 'danger',
      step: null,
      next: `A supervisor rejected this request${request.review_note ? `: “${request.review_note}”` : ''}. If you disagree or the problem is still there, add a comment or send a new request.`,
    };
  }
  switch (request.status) {
    case 'CANCELLED':
      return {
        stage: 'CANCELLED',
        label: 'Cancelled',
        tone: 'neutral',
        step: null,
        next: 'The maintenance team cancelled this request: the comments may say why. If the problem is still there, send a new request.',
      };
    case 'CLOSED':
      return {
        stage: 'DONE',
        label: 'Done',
        tone: 'success',
        step: 3,
        next: `The work is finished${request.closed_on ? ` (${formatDate(request.closed_on)})` : ''}. If the problem is still there, add a comment.`,
      };
    case 'ON_HOLD':
      return {
        stage: 'ON_HOLD',
        label: 'On hold',
        tone: 'warning',
        step: 2,
        next: 'The work is paused, for example while waiting for a part, a supplier or access to the room. The comments give the details.',
      };
    case 'IN_PROGRESS':
      return {
        stage: 'IN_PROGRESS',
        label: 'In progress',
        tone: 'primary',
        step: 2,
        next: `${who ?? 'A technician'} is working on it${by ? `, planned to be done${by}` : ''}.`,
      };
    default:
      return who
        ? {
            stage: 'ASSIGNED',
            label: 'Approved',
            tone: 'info',
            step: 1,
            next: `${who} will take care of it${by}.`,
          }
        : {
            stage: 'RECEIVED',
            label: 'Received',
            tone: 'info',
            step: 0,
            next: 'The maintenance team will review your request and assign a technician.',
          };
  }
}

/** Errors of the request form (the server checks again). Pure. */
export function checkRequest(values) {
  const errors = {};
  if (!values.title.trim()) errors.title = 'Required';
  if (!values.site) errors.site = 'Required';
  if (!values.location.trim()) errors.location = 'Required: say where the problem is.';
  return errors;
}

/**
 * Body of POST /api/requests. "I don't know" (empty) leaves the category and the urgency
 * out: the maintenance team decides. Pure.
 */
export function requestPayload(values, clientId) {
  return {
    client_id: clientId,
    title: values.title.trim(),
    site: values.site,
    location: values.location.trim(),
    ...(values.category && { category: values.category }),
    ...(values.priority && { priority: values.priority }),
    ...(values.description.trim() && { description: values.description.trim() }),
  };
}

const stageBadge = (progress) =>
  h('span', { class: badgeClass('request-stage', progress.stage, progress.tone) }, progress.label);

/** One request in a list. */
function requestCard(request) {
  const progress = requestProgress(request);
  const comments = request.comment_count;
  return h(
    'li',
    { class: 'request-card' },
    h(
      'div',
      { class: 'request-card-head' },
      h(
        'h3',
        { class: 'request-card-title' },
        h('a', { href: `/requests/${request.id}`, 'data-link': true }, request.title),
      ),
      stageBadge(progress),
    ),
    h('p', { class: 'request-next' }, h('strong', {}, 'Next step: '), progress.next),
    h(
      'p',
      { class: 'request-meta' },
      [
        request.number,
        request.location,
        `sent ${formatDate(request.created_on)}`,
        comments ? `${comments} comment${comments === 1 ? '' : 's'}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  );
}

/**
 * A staff member's requests: open ones (home page) or all of them.
 * @param {HTMLElement} container
 * @param {{ data: { total: number, items: object[] }, scope: string, pagination: HTMLElement }} options
 */
export function renderRequestList(container, { data, scope, pagination }) {
  const open = scope === 'open';
  const title = open ? 'My open requests' : 'All my requests';
  const intro = open
    ? 'Requests the maintenance team is still working on. Finished ones are under All my requests.'
    : 'Every request you sent, newest first.';
  replaceChildren(
    container,
    h(
      'div',
      { class: 'requests-page' },
      h(
        'div',
        { class: 'requests-header' },
        h('h2', { class: 'table-title', tabindex: '-1' }, title),
        h(
          'a',
          { href: '/requests/new', 'data-link': true, class: 'button button-primary' },
          '+ New request',
        ),
      ),
      h('p', { class: 'page-intro' }, intro),
      h(
        'p',
        { class: 'table-count', role: 'status' },
        `${data.total} request${data.total === 1 ? '' : 's'}`,
      ),
      data.items.length
        ? h('ul', { class: 'request-list' }, data.items.map(requestCard))
        : h(
            'p',
            { class: 'empty-state' },
            open
              ? 'You have no open request. Something to fix? Send a new request.'
              : 'You have not sent any request yet.',
          ),
      data.pages > 1 ? pagination : null,
    ),
  );
}

/** Label + control + hint + error, in the layout of the other forms. */
function formRow(name, label, control, { required = false, hint } = {}) {
  const id = `r-${name}`;
  Object.assign(control, { id, name });
  control.setAttribute('aria-describedby', `${hint ? `${id}-hint ` : ''}${id}-error`);
  if (required) control.setAttribute('aria-required', 'true');
  return h(
    'div',
    { class: 'form-row' },
    h('label', { for: id }, label, required ? h('span', { class: 'required' }, ' *') : null),
    h(
      'div',
      { class: 'form-control' },
      control,
      hint ? h('p', { id: `${id}-hint`, class: 'field-hint' }, hint) : null,
      h('p', { id: `${id}-error`, class: 'field-error' }),
    ),
  );
}

/** Shows per-field errors and the summary; focuses the first field in error. */
export function showRequestErrors(form, fields = {}, message = '') {
  for (const control of form.querySelectorAll('input, select, textarea')) {
    const line = form.querySelector(`#${control.id}-error`);
    if (!line) continue;
    line.textContent = fields[control.name] ?? '';
    control.toggleAttribute('aria-invalid', Boolean(fields[control.name]));
  }
  const summary = form.querySelector('.form-summary');
  summary.textContent = message;
  (form.querySelector('[aria-invalid]') ?? (message ? summary : null))?.focus();
}

/**
 * The request form. `onSubmit` receives the body for POST /api/requests and the form; the
 * same client_id is reused until the request is sent, so a retry never creates two.
 * @param {HTMLElement} container
 * @param {{ sites: string[], defaultSite: string | null,
 *   onSubmit: (body: object, form: HTMLFormElement) => Promise<boolean> }} options
 */
export function renderRequestForm(container, { sites, defaultSite, onSubmit }) {
  unsentRequest ??= { clientId: crypto.randomUUID(), values: {} };
  const kept = unsentRequest.values;
  const title = h('input', { type: 'text', maxlength: '200', autocomplete: 'off' });
  const site = h(
    'select',
    {},
    h('option', { value: '' }, '— Choose —'),
    sites.map((s) => h('option', { value: s }, s)),
  );
  const location = h('input', { type: 'text', maxlength: '200', autocomplete: 'off' });
  const category = h(
    'select',
    {},
    h('option', { value: '' }, DONT_KNOW),
    CATEGORIES.map((c) => h('option', { value: c }, valueLabel('category', c))),
  );
  const priority = h(
    'select',
    {},
    h('option', { value: '' }, DONT_KNOW),
    WORK_ORDER_PRIORITIES.map((p) => h('option', { value: p }, URGENCY_LABELS[p])),
  );
  const description = h('textarea', { rows: '5', maxlength: '4000' });

  const controls = { title, site, location, category, priority, description };
  title.value = kept.title ?? '';
  site.value = kept.site ?? (sites.includes(defaultSite) ? defaultSite : '');
  location.value = kept.location ?? '';
  category.value = kept.category ?? '';
  priority.value = kept.priority ?? '';
  description.value = kept.description ?? '';
  const read = () =>
    Object.fromEntries(Object.entries(controls).map(([name, el]) => [name, el.value]));

  const submit = h(
    'button',
    { type: 'submit', class: 'button button-primary online-only' },
    'Send request',
  );
  const form = h(
    'form',
    {
      class: 'detail-form request-form',
      novalidate: true,
      onInput: () => {
        unsentRequest.values = read();
      },
      onSubmit: async (event) => {
        event.preventDefault();
        const values = read();
        const errors = checkRequest(values);
        if (Object.keys(errors).length) {
          return showRequestErrors(form, errors, 'Check the highlighted fields.');
        }
        submit.disabled = true;
        try {
          if (await onSubmit(requestPayload(values, unsentRequest.clientId), form)) {
            unsentRequest = null;
          }
        } finally {
          submit.disabled = false;
          applyToPage(form);
        }
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h(
      'p',
      { class: 'form-help' },
      'Describe the problem and where it is: the maintenance team takes it from there. Fields marked * are required.',
    ),
    formRow('title', 'What is the problem?', title, {
      required: true,
      hint: 'A short summary, e.g. “Light flickering in meeting room 8.03”.',
    }),
    formRow('site', 'Site', site, { required: true }),
    formRow('location', 'Where exactly?', location, {
      required: true,
      hint: 'Building, floor and room or desk, e.g. “Tower A, floor 12, desk 12-21”.',
    }),
    formRow('category', 'Kind of problem', category, {
      hint: `Not sure? Keep “${DONT_KNOW}”: the maintenance team will decide.`,
    }),
    formRow('priority', 'How urgent is it?', priority, {
      hint: `Not sure? Keep “${DONT_KNOW}”.`,
    }),
    formRow('description', 'Details', description, {
      hint: 'What happens, since when, and anything that can help the technician.',
    }),
    h(
      'div',
      { class: 'form-actions' },
      submit,
      h('a', { href: '/requests', 'data-link': true, class: 'button button-secondary' }, 'Cancel'),
    ),
  );
  replaceChildren(
    container,
    h(
      'div',
      { class: 'account-page request-form-page' },
      h('h2', { class: 'placeholder-title', tabindex: '-1' }, 'New request'),
      form,
    ),
  );
  applyToPage(form);
}

/** Progress steps: done, current, to come (text says which, not only the style). */
function stepList(progress) {
  return h(
    'ol',
    { class: 'request-steps', 'aria-label': 'Progress' },
    REQUEST_STEPS.map((label, i) => {
      const text = i === 2 && progress.stage === 'ON_HOLD' ? 'On hold' : label;
      const state = i < progress.step ? 'done' : i === progress.step ? 'current' : 'todo';
      return h(
        'li',
        { class: `request-step is-${state}`, 'aria-current': state === 'current' ? 'step' : null },
        text,
        h(
          'span',
          { class: 'visually-hidden' },
          state === 'done' ? ' (done)' : state === 'current' ? ' (current step)' : ' (to come)',
        ),
      );
    }),
  );
}

const STATUS_STEP_LABELS = {
  OPEN: 'Received',
  APPROVED: 'Approved by a supervisor',
  REJECTED: 'Rejected by a supervisor',
  IN_PROGRESS: 'Work started',
  ON_HOLD: 'Put on hold',
  CLOSED: 'Work finished',
  CANCELLED: 'Cancelled',
};

/**
 * A request: progress, next step, what was asked, what was done, and the conversation.
 * @param {HTMLElement} container
 * @param {{ request: object, viewer: { id: number, role: string },
 *   sendComment: (body: string) => Promise<object> }} options
 */
export function renderRequestDetail(container, { request, viewer, sendComment }) {
  const progress = requestProgress(request);
  const finished = ['CLOSED', 'CANCELLED'].includes(request.status);
  const field = (label, value) =>
    value === null || value === undefined || value === ''
      ? null
      : [h('dt', {}, label), h('dd', {}, value)];
  const conversation = h('div', { class: 'comments-body', 'aria-live': 'polite' });
  let comments = request.comments;
  const showComments = () => replaceChildren(conversation, renderConversation(comments, viewer));
  showComments();

  replaceChildren(
    container,
    h(
      'article',
      { class: 'request-page' },
      h(
        'p',
        {},
        h(
          'a',
          { href: requestsUrl(finished ? 'all' : 'open'), 'data-link': true },
          finished ? '← All my requests' : '← My open requests',
        ),
      ),
      h(
        'header',
        { class: 'request-page-header' },
        h('h2', { class: 'placeholder-title', tabindex: '-1' }, request.title),
        h(
          'p',
          { class: 'muted' },
          `${request.number} · sent ${formatDateTime(request.created_at)}`,
        ),
      ),
      h(
        'section',
        { class: 'request-status', 'aria-label': 'Status' },
        h('p', { class: 'request-status-line' }, 'Status: ', stageBadge(progress)),
        progress.step === null ? null : stepList(progress),
        h('p', { class: 'request-next' }, h('strong', {}, 'Next step: '), progress.next),
      ),
      request.status === 'CLOSED' && request.work_report
        ? h(
            'section',
            { class: 'request-section' },
            h('h3', {}, 'What was done'),
            h('p', { class: 'request-report' }, request.work_report),
          )
        : null,
      h(
        'section',
        { class: 'request-section' },
        h('h3', {}, 'Your request'),
        h(
          'dl',
          { class: 'detail-fields' },
          field('Where', request.location),
          field('Site', request.site),
          field(
            'Kind of problem',
            request.category ? valueLabel('category', request.category) : 'Not specified yet',
          ),
          field('Urgency', valueLabel('work_order_priority', request.priority)),
          field('Details', request.description),
          field('Technician', request.assignee ? personName(request.assignee) : 'Not assigned yet'),
          field('Planned by', request.due_on ? formatDate(request.due_on) : null),
        ),
      ),
      h(
        'section',
        { class: 'request-section' },
        h('h3', {}, 'History'),
        h(
          'ol',
          { class: 'timeline' },
          request.status_history.map((s) =>
            h(
              'li',
              { class: 'timeline-entry' },
              h(
                'p',
                { class: 'timeline-head' },
                h('strong', {}, STATUS_STEP_LABELS[s.status] ?? s.status),
                ` · ${formatDateTime(s.at)}`,
              ),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'request-section comments' },
        h('h3', {}, 'Comments'),
        conversation,
        commentForm({
          key: `request-${request.id}`,
          label: 'Add a comment',
          hint: 'More information, a question or a follow-up: the maintenance team reads your comments.',
          send: sendComment,
          onSent: (comment) => {
            comments = [...comments, comment];
            showComments();
          },
        }),
      ),
    ),
  );
}
