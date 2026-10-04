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

function conflictBanner() {
  return h(
    'div',
    { class: 'banner banner-warning', role: 'note' },
    h('span', { 'aria-hidden': 'true' }, '⚠ '),
    h('strong', {}, 'Conflict'),
    ' — two versions of this record are waiting for a supervisor to arbitrate.',
  );
}

/**
 * Renders a record.
 * @param {HTMLElement} container
 * @param {{ entity: string, record: object, onClose: () => void }} options
 */
export function renderDetail(container, { entity, record, onClose }) {
  const cfg = ENTITIES[entity];
  const fields = cfg.detailFields
    .filter((field) => !isEmpty(record[field]))
    .map((field) => [
      h('dt', {}, cfg.fields[field].label),
      h('dd', {}, renderValue(field, cfg.fields[field], record[field])),
    ]);
  replaceChildren(
    container,
    header(cfg.title(record), onClose),
    record.has_conflict ? conflictBanner() : null,
    h('dl', { class: 'detail-fields' }, fields),
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
