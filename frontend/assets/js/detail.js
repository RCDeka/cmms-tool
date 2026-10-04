// Detail panel (brief → Detail panel rendering): fields generated from the entity
// definition, empty fields skipped, values inserted as text (D12).
import { h, replaceChildren } from './dom.js';
import { ENTITIES } from './entities.js';
import { isEmpty, renderValue } from './format.js';

function header(title, onClose) {
  return h(
    'div',
    { class: 'detail-header' },
    // Visible on small screens only, where the detail panel replaces the table.
    h(
      'button',
      { type: 'button', class: 'button button-secondary back-to-list', onClick: onClose },
      '← Back to list',
    ),
    h('h2', { class: 'detail-title', id: 'detail-title', tabindex: '-1' }, title),
    h(
      'button',
      {
        type: 'button',
        class: 'icon-button',
        id: 'btn-close-detail',
        'aria-label': 'Close details',
        onClick: onClose,
      },
      h('span', { 'aria-hidden': 'true' }, '✕'),
    ),
  );
}

function conflictBanner(consoleLink) {
  return h(
    'div',
    { class: 'banner banner-warning', role: 'note' },
    h('span', { 'aria-hidden': 'true' }, '⚠ '),
    h('strong', {}, 'Conflict'),
    ' — two versions of this record are waiting for a supervisor to arbitrate.',
    consoleLink
      ? [' ', h('a', { href: '/conflicts', 'data-link': true }, 'Open the conflict console')]
      : null,
  );
}

/**
 * Notice under the header (draft to restore, refused change, pending sync, …).
 * @param {'info' | 'warning' | 'danger'} tone
 * @param {unknown[]} content text and nodes; actions are buttons inside
 */
export function notice(tone, ...content) {
  return h(
    'div',
    { class: `banner banner-${tone}`, role: tone === 'danger' ? 'alert' : 'note' },
    content,
  );
}

/**
 * Renders a record: read-only fields, or `body` (the edit form) when given.
 * @param {HTMLElement} container
 * @param {object} options
 * @param {string} options.entity
 * @param {object} options.record
 * @param {() => void} options.onClose
 * @param {string} [options.title] defaults to the entity title of the record
 * @param {HTMLElement[]} [options.notices] banners under the header
 * @param {HTMLElement[]} [options.actions] buttons or links above the fields
 * @param {HTMLElement} [options.body] replaces the read-only fields
 * @param {boolean} [options.consoleLink] adds a link to the conflict console (supervisors)
 */
export function renderDetail(
  container,
  { entity, record, onClose, title, notices = [], actions = [], body = null, consoleLink = false },
) {
  const cfg = ENTITIES[entity];
  const fields = cfg.detailFields
    .filter((field) => !isEmpty(record[field]))
    .map((field) => [
      h('dt', {}, cfg.fields[field].label),
      h('dd', {}, renderValue(field, cfg.fields[field], record[field])),
    ]);
  replaceChildren(
    container,
    header(title ?? cfg.title(record), onClose),
    record.has_conflict ? conflictBanner(consoleLink) : null,
    notices,
    actions.length ? h('div', { class: 'detail-actions' }, actions) : null,
    body ?? h('dl', { class: 'detail-fields' }, fields),
  );
}

/**
 * Renders a loading, not-found or error state in the detail panel.
 * @param {HTMLElement} container
 * @param {{ title: string, message: string, onClose: () => void, onRetry?: () => void }} options
 */
export function renderDetailMessage(container, { title, message, onClose, onRetry }) {
  replaceChildren(
    container,
    header(title, onClose),
    h(
      'p',
      { class: 'detail-message' },
      message,
      onRetry
        ? [
            ' ',
            h(
              'button',
              { type: 'button', class: 'button button-secondary', onClick: onRetry },
              'Retry',
            ),
          ]
        : null,
    ),
  );
}

/**
 * Shows a discreet "Update available" button under the header (brief → Silent revalidation).
 * The panel keeps the version on screen until the user asks for the new one.
 * @param {HTMLElement} container
 * @param {() => void} onReload
 */
export function showUpdateAvailable(container, onReload) {
  if (container.querySelector('.update-available')) return;
  const header = container.querySelector('.detail-header');
  if (!header) return;
  header.after(
    h(
      'button',
      { type: 'button', class: 'button button-secondary update-available', onClick: onReload },
      h('span', { 'aria-hidden': 'true' }, '↻'),
      'Update available — show the latest version',
    ),
  );
}
