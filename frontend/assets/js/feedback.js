// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// "Suggest an improvement" from any page, and the feedback log for administrators (D40).
import { badgeClass, h, replaceChildren } from './dom.js';
import { formatDateTime, personName } from './format.js';
import { valueLabel } from './labels.js';
import { applyToPage } from './network.js';

export const MESSAGE_MAX_LENGTH = 2000;
export const FEEDBACK_STATUSES = ['NEW', 'PLANNED', 'DONE', 'DECLINED'];
const STATUS_LABELS = { NEW: 'New', PLANNED: 'Planned', DONE: 'Done', DECLINED: 'Declined' };
const STATUS_TONES = { NEW: 'info', PLANNED: 'primary', DONE: 'success', DECLINED: 'neutral' };

/** Text typed but not sent yet (dialog closed, or sending failed): offered again next time. */
let unsentText = '';

/**
 * Body of POST /api/feedback for the page on screen. Pure.
 * @param {string} message
 * @param {{ pathname: string, search: string }} location
 * @param {string} pageTitle
 * @param {number} [viewportWidth]
 */
export function feedbackPayload(message, { pathname, search }, pageTitle, viewportWidth) {
  return {
    message: message.trim(),
    page_path: `${pathname}${search}`.slice(0, 500),
    page_title: pageTitle.trim().slice(0, 200),
    viewport_width: Number.isInteger(viewportWidth) && viewportWidth > 0 ? viewportWidth : null,
  };
}

/** Error of the message field, or '' when it can be sent. Pure. */
export function checkFeedback(message) {
  const text = message.trim();
  if (!text) return 'Describe what could be improved on this page.';
  if (text.length > MESSAGE_MAX_LENGTH) return `At most ${MESSAGE_MAX_LENGTH} characters.`;
  return '';
}

/** Filters of the feedback log from the URL query. Pure. */
export function parseFeedbackFilters(query) {
  const status = query.get('status');
  return FEEDBACK_STATUSES.includes(status) ? { status } : {};
}

/** URL of the feedback log. Pure. */
export function feedbackUrl({ status, page } = {}) {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (page > 1) query.set('page', String(page));
  const text = query.toString();
  return `/admin/feedback${text ? `?${text}` : ''}`;
}

/**
 * Opens the suggestion dialog over the current page.
 * @param {HTMLDialogElement} dialog
 * @param {{ pageTitle: string, send: (payload: object) => Promise<void>,
 *   onSent: () => void }} options
 */
export function openFeedbackDialog(dialog, { pageTitle, send, onSent }) {
  const where = { pathname: location.pathname, search: location.search };
  const textarea = h('textarea', {
    id: 'feedback-message',
    name: 'message',
    rows: '6',
    maxlength: String(MESSAGE_MAX_LENGTH),
    'aria-describedby': 'feedback-hint feedback-count feedback-error',
    placeholder:
      'Example: it would be interesting to include a pie chart of work orders by category.',
  });
  textarea.value = unsentText;
  const count = h('p', { id: 'feedback-count', class: 'field-hint', 'aria-live': 'off' });
  const showCount = () => {
    count.textContent = `${textarea.value.length} / ${MESSAGE_MAX_LENGTH} characters`;
  };
  showCount();
  const error = h('p', { id: 'feedback-error', class: 'field-error', role: 'alert' });
  const sendButton = h(
    'button',
    { type: 'submit', class: 'button button-primary online-only' },
    'Send',
  );

  const close = () => {
    unsentText = textarea.value;
    dialog.close();
  };
  textarea.addEventListener('input', () => {
    showCount();
    unsentText = textarea.value;
    if (error.textContent && !checkFeedback(textarea.value)) {
      error.textContent = '';
      textarea.removeAttribute('aria-invalid');
    }
  });

  const form = h(
    'form',
    {
      class: 'feedback-form',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const problem = checkFeedback(textarea.value);
        error.textContent = problem;
        textarea.toggleAttribute('aria-invalid', Boolean(problem));
        if (problem) return textarea.focus();
        sendButton.disabled = true;
        try {
          await send(feedbackPayload(textarea.value, where, pageTitle, window.innerWidth));
          unsentText = '';
          dialog.close();
          onSent();
        } catch (err) {
          error.textContent =
            err.status === 0
              ? 'You are offline: your text is kept, send it once connected.'
              : err.message;
          sendButton.disabled = false;
          applyToPage(dialog);
        }
      },
    },
    h('h2', { id: 'feedback-title', class: 'dialog-title' }, 'Suggest an improvement'),
    h(
      'p',
      { id: 'feedback-hint', class: 'muted' },
      'What should be updated or improved on this page? Your idea is saved with the page you are on, for the next updates of the tool.',
    ),
    h(
      'p',
      { class: 'feedback-page' },
      h('span', { class: 'field-label' }, 'Page: '),
      `${pageTitle} `,
      h('code', {}, `${where.pathname}${where.search}`),
    ),
    h('label', { for: 'feedback-message', class: 'field-label' }, 'Your suggestion'),
    textarea,
    count,
    error,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'button button-secondary', onClick: close }, 'Cancel'),
      sendButton,
    ),
  );
  replaceChildren(dialog, form);
  dialog.oncancel = (event) => {
    event.preventDefault();
    close();
  };
  applyToPage(dialog);
  dialog.showModal();
  textarea.focus();
}

const statusBadge = (status) =>
  h('span', { class: badgeClass('feedback', status, STATUS_TONES[status]) }, STATUS_LABELS[status]);

/**
 * Feedback log (administrators): filter, table, status changes.
 * @param {HTMLElement} container
 * @param {{ data: object, filters: object, onFilter: (status: string | null) => void,
 *   onStatus: (id: number, status: string, select: HTMLSelectElement) => void,
 *   pagination: HTMLElement }} options
 */
export function renderFeedbackLog(container, { data, filters, onFilter, onStatus, pagination }) {
  const filter = h(
    'select',
    { id: 'feedback-status', onChange: (event) => onFilter(event.target.value || null) },
    h('option', { value: '' }, 'All suggestions'),
    FEEDBACK_STATUSES.map((s) => h('option', { value: s }, STATUS_LABELS[s])),
  );
  filter.value = filters.status ?? '';

  const rows = data.items.map((item) => {
    const select = h(
      'select',
      {
        class: 'feedback-status-select online-only',
        'aria-label': `Status of suggestion ${item.id}`,
        onChange: (event) => onStatus(item.id, event.target.value, event.target),
      },
      FEEDBACK_STATUSES.map((s) => h('option', { value: s }, STATUS_LABELS[s])),
    );
    select.value = item.status;
    return h(
      'tr',
      {},
      h('td', { class: 'nowrap' }, formatDateTime(item.created_at)),
      h(
        'td',
        {},
        personName(item.user),
        h('br'),
        h('span', { class: 'muted' }, valueLabel('role', item.user_role)),
      ),
      h(
        'td',
        {},
        h('a', { href: item.page_path, 'data-link': true }, item.page_title || item.page_path),
        item.viewport_width ? h('br') : null,
        item.viewport_width
          ? h('span', { class: 'muted' }, `${item.viewport_width} px wide`)
          : null,
      ),
      h('td', { class: 'feedback-message' }, item.message),
      h('td', {}, statusBadge(item.status), h('div', { class: 'feedback-status-control' }, select)),
    );
  });

  replaceChildren(
    container,
    h('h2', { class: 'table-title visually-hidden', tabindex: '-1' }, 'Suggestions'),
    h(
      'div',
      { class: 'filter-row' },
      h('label', { for: 'feedback-status' }, 'Show'),
      filter,
      h(
        'p',
        { class: 'table-count', role: 'status' },
        `${data.total} suggestion${data.total === 1 ? '' : 's'}`,
      ),
    ),
    data.items.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data-table feedback-table' },
            h(
              'caption',
              { class: 'visually-hidden' },
              `Suggestions, page ${data.page} of ${data.pages}`,
            ),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ['Sent', 'By', 'Page', 'Suggestion', 'Status'].map((t) =>
                  h('th', { scope: 'col' }, t),
                ),
              ),
            ),
            h('tbody', {}, rows),
          ),
        )
      : h('p', { class: 'empty-state' }, 'No suggestion yet.'),
    pagination,
  );
  applyToPage(container);
}
