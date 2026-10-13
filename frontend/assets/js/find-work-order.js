// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// "Find a work order" from the top bar, on every page (docs/spec-ai-assistant.md → section 7,
// D66, D67): the user describes a job, the server proposes the open work orders it belongs to.
import { h, replaceChildren } from './dom.js';
import { badge } from './format.js';
import { applyToPage } from './network.js';

export const FIND_TEXT_MAX_LENGTH = 2000;
export const STRONG_MATCH = 0.7;

const NOTICES = {
  NOT_CONFIGURED: 'Search results: the assistant is not set up yet.',
  UNAVAILABLE: 'Search results: the assistant is not available right now.',
  UNUSABLE: 'Search results: the assistant’s answer could not be used.',
};

/** Text typed but not used yet: offered again next time (as for suggestions). */
let keptText = '';

/** Error of the text field before sending, or '' (the server checks again, BR-AI2). Pure. */
export function checkFindText(text) {
  const trimmed = text.trim();
  if ((trimmed.match(/[\p{L}\p{N}]+/gu) ?? []).length < 3) {
    return 'Describe the job in at least 3 words.';
  }
  if (trimmed.length > FIND_TEXT_MAX_LENGTH) return `At most ${FIND_TEXT_MAX_LENGTH} characters.`;
  return '';
}

/**
 * Body of POST /api/assistant/find-work-order. Pure.
 * @param {string} text
 * @param {{ asset?: { id: number }, site?: string } | null} context
 */
export function findPayload(text, context) {
  const body = { raw_text: text.trim() };
  if (context?.asset) body.asset_id = context.asset.id;
  else if (context?.site) body.site = context.site;
  return body;
}

/** "Strong" or "Possible" for a score of the model, null for a search result. Pure. */
export function matchLevel(score) {
  if (score === null || score === undefined) return null;
  return score >= STRONG_MATCH ? 'Strong' : 'Possible';
}

/** Line above the results saying where they come from, or '' for the assistant's. Pure. */
export function resultsNotice({ mode, notice }) {
  return mode === 'SEARCH' ? (NOTICES[notice] ?? 'Search results.') : '';
}

function resultItem({ work_order: wo, score, reason }, onOpen) {
  const level = matchLevel(score);
  return h(
    'li',
    { class: 'find-result' },
    h(
      'div',
      { class: 'find-result-main' },
      h(
        'p',
        { class: 'find-result-title' },
        h('span', { class: 'find-result-number' }, wo.number),
        ` ${wo.title}`,
      ),
      h(
        'p',
        { class: 'find-result-meta' },
        badge('status', 'work_order_status', wo.status),
        ' ',
        wo.asset ? `${wo.asset.code} ${wo.asset.name} · ${wo.site}` : wo.site,
      ),
      level
        ? h(
            'p',
            { class: 'find-result-reason' },
            h('span', { class: `find-level find-level-${level.toLowerCase()}` }, level),
            ` ${reason}`,
          )
        : null,
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'button button-secondary',
        'aria-label': `Open ${wo.number}`,
        onClick: () => onOpen(wo),
      },
      'Open',
    ),
  );
}

/**
 * Opens the dialog over the current page.
 * @param {HTMLDialogElement} dialog
 * @param {{ context: { asset?: { id: number, code: string, name: string }, site?: string } | null,
 *   find: (body: object) => Promise<{ mode: string, notice: string | null, candidates: object[] }>,
 *   onOpen: (workOrder: object) => void,
 *   onCreate: (text: string, context: object | null) => void }} options
 */
export function openFindDialog(dialog, { context: initialContext, find, onOpen, onCreate }) {
  let context = initialContext;
  const textarea = h('textarea', {
    id: 'find-text',
    name: 'raw_text',
    rows: '4',
    maxlength: String(FIND_TEXT_MAX_LENGTH),
    'aria-describedby': 'find-hint find-count find-error',
    placeholder: 'Example: replaced the burnt contactor coil of pump 2, motor tested, 1 h 30.',
  });
  textarea.value = keptText;
  const count = h('p', { id: 'find-count', class: 'field-hint', 'aria-live': 'off' });
  const showCount = () => {
    count.textContent = `${textarea.value.length} / ${FIND_TEXT_MAX_LENGTH} characters`;
  };
  showCount();
  const error = h('p', { id: 'find-error', class: 'field-error', role: 'alert' });
  const results = h('div', { class: 'find-results', 'aria-live': 'polite' });
  const findButton = h(
    'button',
    { type: 'submit', class: 'button button-primary ai-only' },
    'Find',
  );

  const contextRow = h('p', { class: 'find-context' });
  const showContext = () => {
    const label = context?.asset
      ? `Asset: ${context.asset.code} ${context.asset.name}`
      : context?.site
        ? `Site: ${context.site}`
        : null;
    contextRow.hidden = !label;
    if (!label) return replaceChildren(contextRow);
    replaceChildren(
      contextRow,
      h('span', {}, label),
      ' ',
      h(
        'button',
        {
          type: 'button',
          class: 'button button-secondary',
          'aria-label': `Remove the ${context.asset ? 'asset' : 'site'}: search everywhere`,
          onClick: () => {
            context = null;
            showContext();
            textarea.focus();
          },
        },
        'Remove',
      ),
    );
  };
  showContext();

  const close = () => {
    keptText = textarea.value;
    dialog.close();
  };
  textarea.addEventListener('input', () => {
    showCount();
    keptText = textarea.value;
    if (error.textContent && !checkFindText(textarea.value)) {
      error.textContent = '';
      textarea.removeAttribute('aria-invalid');
    }
  });

  const open = (wo) => {
    keptText = textarea.value;
    dialog.close();
    onOpen(wo);
  };
  const createButton = h(
    'button',
    {
      type: 'button',
      class: 'button button-secondary',
      onClick: () => {
        const text = textarea.value.trim();
        keptText = '';
        dialog.close();
        onCreate(text, context);
      },
    },
    'New work order',
  );

  const showResults = (data) => {
    const notice = resultsNotice(data);
    replaceChildren(
      results,
      notice ? h('p', { class: 'find-notice muted' }, notice) : null,
      data.candidates.length
        ? h(
            'ol',
            { class: 'find-result-list', 'aria-label': 'Matching work orders' },
            data.candidates.map((c) => resultItem(c, open)),
          )
        : h('p', { class: 'empty-state' }, 'No open work order matches this job.'),
      h('p', { class: 'find-none' }, 'None of these? ', createButton),
    );
  };

  const form = h(
    'form',
    {
      class: 'find-form',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const problem = checkFindText(textarea.value);
        error.textContent = problem;
        textarea.toggleAttribute('aria-invalid', Boolean(problem));
        if (problem) return textarea.focus();
        findButton.disabled = true;
        findButton.textContent = 'Finding…';
        try {
          showResults(await find(findPayload(textarea.value, context)));
        } catch (err) {
          replaceChildren(results);
          error.textContent =
            err.status === 0
              ? 'The server cannot be reached: your text is kept, try again once connected.'
              : err.message;
        } finally {
          findButton.textContent = 'Find';
          findButton.disabled = false;
          applyToPage(dialog);
        }
      },
    },
    h('h2', { id: 'find-title', class: 'dialog-title' }, 'Find a work order'),
    h(
      'p',
      { id: 'find-hint', class: 'muted' },
      'Describe the job you did or the fault you found: Tacto looks for the open work order it belongs to.',
    ),
    contextRow,
    h('label', { for: 'find-text', class: 'field-label' }, 'What did you do?'),
    textarea,
    count,
    error,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'button button-secondary', onClick: close }, 'Close'),
      findButton,
    ),
    results,
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
