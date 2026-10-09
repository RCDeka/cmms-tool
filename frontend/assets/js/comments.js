// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Comments on a work order (D46): the conversation between the requester and the maintenance
// team. Shown on the staff request page and in the work order panel; needs a connection.
import { apiFetch } from './api.js';
import { h, replaceChildren } from './dom.js';
import { formatDateTime, personName } from './format.js';
import { valueLabel } from './labels.js';
import { applyToPage } from './network.js';

export const COMMENT_MAX_LENGTH = 2000;

/** Text typed but not sent yet, per work order: kept while the app is open. */
const unsent = new Map();

/** Error of a comment, or '' when it can be sent. Pure. */
export function checkComment(text) {
  const value = text.trim();
  if (!value) return 'Write your comment first.';
  if (value.length > COMMENT_MAX_LENGTH) return `At most ${COMMENT_MAX_LENGTH} characters.`;
  return '';
}

/**
 * Who wrote a comment, as the viewer should read it. Pure.
 * Staff see "maintenance team" rather than internal roles.
 * @param {{ user: { id: number, first_name: string, last_name: string }, user_role: string }} comment
 * @param {{ id: number, role: string }} viewer
 */
export function commentAuthor(comment, viewer) {
  if (comment.user.id === viewer.id) return 'You';
  const name = personName(comment.user);
  if (comment.user_role === 'STAFF') return `${name} (requester)`;
  if (viewer.role === 'STAFF') return `${name} (maintenance team)`;
  return `${name} (${valueLabel('role', comment.user_role).toLowerCase()})`;
}

/** The conversation, oldest first. */
export function renderConversation(comments, viewer) {
  if (!comments.length) return h('p', { class: 'muted' }, 'No comment yet.');
  return h(
    'ol',
    { class: 'comment-list' },
    comments.map((c) =>
      h(
        'li',
        { class: `comment${c.user_role === 'STAFF' ? ' comment-requester' : ''}` },
        h(
          'p',
          { class: 'comment-head' },
          h('strong', {}, commentAuthor(c, viewer)),
          ` · ${formatDateTime(c.created_at)}`,
        ),
        h('p', { class: 'comment-body' }, c.body),
      ),
    ),
  );
}

/**
 * Form to add a comment. `send` posts the text and resolves to the new comment; the form
 * keeps the text when sending fails.
 * @param {{ key: string, label: string, hint: string, send: (body: string) => Promise<object>,
 *   onSent: (comment: object) => void }} options
 */
export function commentForm({ key, label, hint, send, onSent }) {
  const id = `comment-${key}`;
  const textarea = h('textarea', {
    id,
    name: 'body',
    rows: '3',
    maxlength: String(COMMENT_MAX_LENGTH),
    'aria-describedby': `${id}-hint ${id}-error`,
  });
  textarea.value = unsent.get(key) ?? '';
  const error = h('p', { id: `${id}-error`, class: 'field-error', role: 'alert' });
  const button = h(
    'button',
    { type: 'submit', class: 'button button-primary online-only' },
    'Send comment',
  );
  textarea.addEventListener('input', () => {
    unsent.set(key, textarea.value);
    if (error.textContent && !checkComment(textarea.value)) {
      error.textContent = '';
      textarea.removeAttribute('aria-invalid');
    }
  });
  const form = h(
    'form',
    {
      class: 'comment-form',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const problem = checkComment(textarea.value);
        error.textContent = problem;
        textarea.toggleAttribute('aria-invalid', Boolean(problem));
        if (problem) return textarea.focus();
        button.disabled = true;
        try {
          const comment = await send(textarea.value.trim());
          unsent.delete(key);
          textarea.value = '';
          onSent(comment);
        } catch (err) {
          error.textContent =
            err.status === 0
              ? 'You are offline: your text is kept, send it once connected.'
              : err.message;
        } finally {
          button.disabled = false;
          applyToPage(form);
        }
      },
    },
    h('label', { for: id, class: 'field-label' }, label),
    h('p', { id: `${id}-hint`, class: 'field-hint' }, hint),
    textarea,
    error,
    h('div', { class: 'comment-actions' }, button),
  );
  applyToPage(form);
  return form;
}

/**
 * "Comments" section of the work order panel (maintenance team), loaded when shown.
 * @param {number} workOrderId
 * @param {{ id: number, role: string }} viewer
 */
export function commentsSection(workOrderId, viewer) {
  const list = h('div', { class: 'comments-body', 'aria-live': 'polite' });
  const show = (items) => replaceChildren(list, renderConversation(items, viewer));
  let items = [];
  const load = async () => {
    replaceChildren(list, h('p', { class: 'muted' }, 'Loading the comments…'));
    try {
      ({ items } = await apiFetch(`/work-orders/${workOrderId}/comments`));
      show(items);
    } catch (err) {
      replaceChildren(
        list,
        h(
          'p',
          { class: 'muted' },
          err.status === 0 ? 'The comments need a connection to the server.' : err.message,
        ),
      );
    }
  };
  const section = h(
    'details',
    { class: 'comments', open: true },
    h('summary', {}, 'Comments'),
    list,
    commentForm({
      key: `wo-${workOrderId}`,
      label: 'Add a comment',
      hint: 'The requester sees your comments: use them to give news or ask for details.',
      send: async (body) =>
        (await apiFetch(`/work-orders/${workOrderId}/comments`, { method: 'POST', body: { body } }))
          .item,
      onSent: (comment) => {
        items = [...items, comment];
        show(items);
      },
    }),
  );
  load();
  return section;
}
