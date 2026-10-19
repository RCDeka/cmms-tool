// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Staff requests (D46): a staff member's open requests (home page), all their requests, the
// request form and the request page with its progress and comments. Online only.
import { commentForm, renderConversation } from './comments.js';
import { badgeClass, h, replaceChildren } from './dom.js';
import { CATEGORIES, WORK_ORDER_PRIORITIES } from './enums.js';
import { formatDate, formatDateTime, personName } from './format.js';
import { valueLabel } from './labels.js';
import { applyToPage } from './network.js';
import { NOT_LISTED, PATH_SEPARATOR, placeIndex, placeOf, placePicker } from './places.js';
import { t, tn } from './i18n.js';

export const REQUEST_SCOPES = ['open', 'all'];
/**
 * Steps shown above a request; "On hold" takes the place of "In progress". "Done" is the
 * technical end, "Closed" the administrative one (D86).
 */
export const REQUEST_STEPS = [
  t('Received'),
  t('Approved and assigned'),
  t('In progress'),
  t('Done'),
  t('request|Closed'),
];

/** Labels of the urgency choices (priority codes). */
const URGENCY_LABELS = {
  LOW: t('Low: it can wait'),
  NORMAL: t('Normal'),
  HIGH: t('High: it disturbs work'),
  URGENT: t('Urgent: safety risk, or work is impossible'),
};
const DONT_KNOW = t("I don't know");

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
 *   completed_on: string | null }} request
 * @returns {{ stage: string, label: string, tone: string, step: number | null, next: string }}
 *   `step`: index in REQUEST_STEPS, null for a cancelled request
 */
export function requestProgress(request) {
  const who = request.assignee ? personName(request.assignee) : null;
  const due = request.due_on ? formatDate(request.due_on) : null;
  if (request.review_status === 'PENDING') {
    return {
      stage: 'REVIEW',
      label: t('Waiting for review'),
      tone: 'info',
      step: 0,
      next: t('A supervisor will review your request, then assign a technician to it.'),
    };
  }
  if (request.review_status === 'WITHDRAWN') {
    return {
      stage: 'WITHDRAWN',
      label: t('Cancelled by you'),
      tone: 'neutral',
      step: null,
      next: t(
        'Nothing: you cancelled this request. If the problem comes back, send a new request.',
      ),
    };
  }
  if (request.review_status === 'REJECTED') {
    return {
      stage: 'REJECTED',
      label: t('Rejected'),
      tone: 'danger',
      step: null,
      next: request.review_note
        ? t(
            'A supervisor rejected this request: “{note}”. If you disagree or the problem is still there, add a comment or send a new request.',
            { note: request.review_note },
          )
        : t(
            'A supervisor rejected this request. If you disagree or the problem is still there, add a comment or send a new request.',
          ),
    };
  }
  switch (request.status) {
    case 'CANCELLED':
      return {
        stage: 'CANCELLED',
        label: t('Cancelled'),
        tone: 'neutral',
        step: null,
        next: t(
          'The maintenance team cancelled this request: the comments may say why. If the problem is still there, send a new request.',
        ),
      };
    case 'COMPLETED':
    case 'CLOSED':
      return {
        stage: request.status === 'CLOSED' ? 'CLOSED' : 'DONE',
        label: request.status === 'CLOSED' ? t('request|Closed') : t('Done'),
        tone: 'success',
        step: request.status === 'CLOSED' ? 4 : 3,
        next: request.completed_on
          ? t(
              'The work is finished ({completed_on}). If the problem is still there, add a comment.',
              { completed_on: formatDate(request.completed_on) },
            )
          : t('The work is finished. If the problem is still there, add a comment.'),
      };
    case 'ON_HOLD':
      return {
        stage: 'ON_HOLD',
        label: t('On hold'),
        tone: 'warning',
        step: 2,
        next: t(
          'The work is paused, for example while waiting for a part, a supplier or access to the room. The comments give the details.',
        ),
      };
    case 'IN_PROGRESS':
      return {
        stage: 'IN_PROGRESS',
        label: t('In progress'),
        tone: 'primary',
        step: 2,
        next: due
          ? t('{who} is working on it, planned to be done by {due}.', {
              who: who ?? t('A technician'),
              due,
            })
          : t('{who} is working on it.', { who: who ?? t('A technician') }),
      };
    default:
      return who
        ? {
            stage: 'ASSIGNED',
            label: t('Approved'),
            tone: 'info',
            step: 1,
            next: due
              ? t('{who} will take care of it by {due}.', { who, due })
              : t('{who} will take care of it.', { who }),
          }
        : {
            stage: 'RECEIVED',
            label: t('Received'),
            tone: 'info',
            step: 0,
            next: t('The maintenance team will review your request and assign a technician.'),
          };
  }
}

/** True while the requester may cancel their request: until work starts (BR-R10). Pure. */
export function canCancelRequest(request) {
  return request.status === 'OPEN';
}

/** The place chosen in the form as an id, or null ("Not in the list", or none yet). Pure. */
export const chosenPlaceId = (values) =>
  typeof values.location_id === 'number' ? values.location_id : null;

/** Errors of the request form (the server checks again). Pure. */
export function checkRequest(values) {
  const errors = {};
  if (!values.title.trim()) errors.title = t('Required');
  if (!values.site) errors.site = t('Required');
  // A place of the list, or the place in words (BR-R1, BR-LOC9).
  if (chosenPlaceId(values) === null && !values.location.trim()) {
    errors.location = values.has_places
      ? t('Required: pick a room, or say where the problem is.')
      : t('Required: say where the problem is.');
  }
  return errors;
}

/** Where a request comes from, in one line: the place, then the words about it. Pure. */
export function requestPlace(request) {
  return [request.place, request.location].filter(Boolean).join(' — ');
}

/** Start of the place in words when it is not in the list: "Tower A, L12, ". Pure. */
export function placePrefix(path) {
  return path ? `${path.split(PATH_SEPARATOR).join(', ')}, ` : '';
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
    ...(chosenPlaceId(values) !== null && { location_id: chosenPlaceId(values) }),
    ...(values.location.trim() && { location: values.location.trim() }),
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
    h('p', { class: 'request-next' }, h('strong', {}, t('Next step: ')), progress.next),
    h(
      'p',
      { class: 'request-meta' },
      [
        request.number,
        requestPlace(request),
        t('sent {created_on}', { created_on: formatDate(request.created_on) }),
        comments ? tn(comments, '{n} comment', '{n} comments') : null,
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
  const title = open ? t('My open requests') : t('All my requests');
  const intro = open
    ? t(
        'Requests the maintenance team is still working on. Finished ones are under All my requests.',
      )
    : t('Every request you sent, newest first.');
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
          t('+ New request'),
        ),
      ),
      h('p', { class: 'page-intro' }, intro),
      h(
        'p',
        { class: 'table-count', role: 'status' },
        tn(data.total, '{n} request', '{n} requests'),
      ),
      data.items.length
        ? h('ul', { class: 'request-list' }, data.items.map(requestCard))
        : h(
            'p',
            { class: 'empty-state' },
            open
              ? t('You have no open request. Something to fix? Send a new request.')
              : t('You have not sent any request yet.'),
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

/** "Where exactly?": its star and hint change with the place chosen (D81, D82). */
function placeRow(control, star, hint) {
  Object.assign(control, { id: 'r-location', name: 'location' });
  control.setAttribute('aria-describedby', 'r-location-hint r-location-error');
  return h(
    'div',
    { class: 'form-row' },
    h('label', { for: control.id }, t('Where exactly?'), star),
    h(
      'div',
      { class: 'form-control' },
      control,
      hint,
      h('p', { id: 'r-location-error', class: 'field-error' }),
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
 * @param {{ sites: string[], defaultSite: string | null, places: object | null,
 *   onSubmit: (body: object, form: HTMLFormElement) => Promise<boolean> }} options
 */
export function renderRequestForm(container, { sites, defaultSite, places, onSubmit }) {
  unsentRequest ??= { clientId: crypto.randomUUID(), values: {} };
  const kept = unsentRequest.values;
  const title = h('input', { type: 'text', maxlength: '200', autocomplete: 'off' });
  const site = h(
    'select',
    {},
    h('option', { value: '' }, t('— Choose —')),
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
  // The places of the cached tree (D82), so the form works offline too.
  const index = placeIndex(places);
  const siteIdOf = (name) => index.children.get(null)?.find((p) => p.name === name)?.id ?? null;
  const offered = (place) => Boolean(index.types.get(place?.level_type_id)?.offered_to_staff);
  let hasPlaces = false;
  const read = () => ({
    ...Object.fromEntries(Object.entries(controls).map(([name, el]) => [name, el.value])),
    location_id: hasPlaces ? picker.value() : null,
    has_places: hasPlaces,
  });

  // The place: a room of the list (D81), or words when it is not there. The words are
  // required only without a room.
  const placeHint = h('p', { id: 'r-location-hint', class: 'field-hint' });
  const placeStar = h('span', { class: 'required' }, ' *');
  const showPlaceRule = () => {
    const values = read();
    const optional = chosenPlaceId(values) !== null;
    placeStar.hidden = optional;
    location.toggleAttribute('aria-required', !optional);
    placeHint.textContent = optional
      ? t('Optional: anything that helps find the place, e.g. “desk 12-21” or “by the window”.')
      : hasPlaces
        ? t('Required when the room is not in the list: building, floor and room or desk.')
        : t('Building, floor and room or desk, e.g. “Tower A, floor 12, desk 12-21”.');
  };
  const picker = placePicker({
    id: 'r-location_id',
    index,
    scope: siteIdOf(site.value),
    selectable: offered,
    notListed: true,
    autoPick: true,
    onChange: () => {
      if (picker.value() === NOT_LISTED && !location.value.trim()) {
        const deepest = picker.deepest();
        location.value = deepest ? placePrefix(placeOf(index, deepest).place) : '';
      }
      showPlaceRule();
      unsentRequest.values = read();
    },
  });
  // Shown for a site with places staff can pick, and only then.
  const pickerRow = h(
    'div',
    { class: 'form-row place-row', role: 'group', 'aria-labelledby': 'r-place-label' },
    h('span', { id: 'r-place-label', class: 'field-label' }, t('Room')),
    h(
      'div',
      { class: 'form-control' },
      picker.element,
      h(
        'p',
        { class: 'field-hint' },
        t('Not in the list? Choose “Not in the list” and say where it is below.'),
      ),
      h('p', { id: 'r-location_id-error', class: 'field-error' }),
    ),
  );
  const showPlaces = (keep = null) => {
    const siteId = siteIdOf(site.value);
    picker.setScope(siteId);
    hasPlaces = siteId !== null && picker.lists().length > 0;
    pickerRow.hidden = !hasPlaces;
    if (hasPlaces && keep !== null) picker.set(keep);
    showPlaceRule();
  };
  site.addEventListener('change', () => showPlaces());

  const submit = h(
    'button',
    { type: 'submit', class: 'button button-primary online-only' },
    t('Send request'),
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
          return showRequestErrors(form, errors, t('Check the highlighted fields.'));
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
      t(
        'Describe the problem and where it is: the maintenance team takes it from there. Fields marked * are required.',
      ),
    ),
    formRow('title', t('What is the problem?'), title, {
      required: true,
      hint: t('A short summary, e.g. “Light flickering in meeting room 8.03”.'),
    }),
    formRow('site', t('Site'), site, { required: true }),
    pickerRow,
    placeRow(location, placeStar, placeHint),
    formRow('category', t('Kind of problem'), category, {
      hint: t('Not sure? Keep “{DONT_KNOW}”: the maintenance team will decide.', { DONT_KNOW }),
    }),
    formRow('priority', t('How urgent is it?'), priority, {
      hint: t('Not sure? Keep “{DONT_KNOW}”.', { DONT_KNOW }),
    }),
    formRow('description', t('Details'), description, {
      hint: t('What happens, since when, and anything that can help the technician.'),
    }),
    h(
      'div',
      { class: 'form-actions' },
      submit,
      h(
        'a',
        { href: '/requests', 'data-link': true, class: 'button button-secondary' },
        t('Cancel'),
      ),
    ),
  );
  replaceChildren(
    container,
    h(
      'div',
      { class: 'account-page request-form-page' },
      h('h2', { class: 'placeholder-title', tabindex: '-1' }, t('New request')),
      form,
    ),
  );
  showPlaces(kept.location_id ?? null);
  applyToPage(form);
}

/** Progress steps: done, current, to come (text says which, not only the style). */
function stepList(progress) {
  return h(
    'ol',
    { class: 'request-steps', 'aria-label': t('Progress') },
    REQUEST_STEPS.map((label, i) => {
      const text = i === 2 && progress.stage === 'ON_HOLD' ? t('On hold') : label;
      const state = i < progress.step ? 'done' : i === progress.step ? 'current' : 'todo';
      return h(
        'li',
        { class: `request-step is-${state}`, 'aria-current': state === 'current' ? 'step' : null },
        text,
        h(
          'span',
          { class: 'visually-hidden' },
          state === 'done'
            ? t(' (done)')
            : state === 'current'
              ? t(' (current step)')
              : t(' (to come)'),
        ),
      );
    }),
  );
}

const STATUS_STEP_LABELS = {
  OPEN: t('Received'),
  APPROVED: t('Approved by a supervisor'),
  REJECTED: t('Rejected by a supervisor'),
  IN_PROGRESS: t('Work started'),
  ON_HOLD: t('Put on hold'),
  COMPLETED: t('Work finished'),
  CLOSED: t('request|Closed'),
  CANCELLED: t('Cancelled'),
  WITHDRAWN: t('Cancelled by you'),
};

/**
 * "Cancel this request" while work has not started. `cancel` asks for confirmation and sends
 * it; it resolves when done or declined, and its errors are shown under the button.
 */
function cancelSection(cancel) {
  const error = h('p', { class: 'field-error', role: 'alert' });
  const button = h(
    'button',
    {
      type: 'button',
      class: 'button button-secondary online-only',
      onClick: async () => {
        error.textContent = '';
        button.disabled = true;
        try {
          await cancel();
        } catch (err) {
          error.textContent =
            err.status === 0 ? t('You are offline: try again once connected.') : err.message;
        } finally {
          button.disabled = false;
          applyToPage(section);
        }
      },
    },
    t('Cancel this request'),
  );
  const section = h(
    'div',
    { class: 'request-cancel' },
    h(
      'p',
      { class: 'field-hint' },
      t('Not needed any more? You can cancel it until a technician starts the work.'),
    ),
    button,
    error,
  );
  applyToPage(section);
  return section;
}

/**
 * A request: progress, next step, what was asked, what was done, and the conversation.
 * @param {HTMLElement} container
 * @param {{ request: object, viewer: { id: number, role: string },
 *   sendComment: (body: string) => Promise<object>, cancelRequest: () => Promise<void> }} options
 */
export function renderRequestDetail(container, { request, viewer, sendComment, cancelRequest }) {
  const progress = requestProgress(request);
  const finished = ['COMPLETED', 'CLOSED', 'CANCELLED'].includes(request.status);
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
          finished ? t('← All my requests') : t('← My open requests'),
        ),
      ),
      h(
        'header',
        { class: 'request-page-header' },
        h('h2', { class: 'placeholder-title', tabindex: '-1' }, request.title),
        h(
          'p',
          { class: 'muted' },
          t('{number} · sent {created_at}', {
            number: request.number,
            created_at: formatDateTime(request.created_at),
          }),
        ),
      ),
      h(
        'section',
        { class: 'request-status', 'aria-label': t('Status') },
        h('p', { class: 'request-status-line' }, t('Status: '), stageBadge(progress)),
        progress.step === null ? null : stepList(progress),
        h('p', { class: 'request-next' }, h('strong', {}, t('Next step: ')), progress.next),
        canCancelRequest(request) ? cancelSection(cancelRequest) : null,
      ),
      ['COMPLETED', 'CLOSED'].includes(request.status) && request.work_report
        ? h(
            'section',
            { class: 'request-section' },
            h('h3', {}, t('What was done')),
            h('p', { class: 'request-report' }, request.work_report),
          )
        : null,
      h(
        'section',
        { class: 'request-section' },
        h('h3', {}, t('Your request')),
        h(
          'dl',
          { class: 'detail-fields' },
          field(t('Where'), requestPlace(request)),
          field(t('Site'), request.site),
          field(
            t('Kind of problem'),
            request.category ? valueLabel('category', request.category) : t('Not specified yet'),
          ),
          field(t('Urgency'), valueLabel('work_order_priority', request.priority)),
          field(t('Details'), request.description),
          field(
            t('Technician'),
            request.assignee ? personName(request.assignee) : t('Not assigned yet'),
          ),
          field(t('Planned by'), request.due_on ? formatDate(request.due_on) : null),
        ),
      ),
      h(
        'section',
        { class: 'request-section' },
        h('h3', {}, t('History')),
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
        h('h3', {}, t('Comments')),
        conversation,
        commentForm({
          key: `request-${request.id}`,
          label: t('Add a comment'),
          hint: t(
            'More information, a question or a follow-up: the maintenance team reads your comments.',
          ),
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
