// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// "Change my password", for every user (BR-U8): other sessions end, this one gets a new token.
import { PASSWORD_MIN_LENGTH, showErrors } from './admin-users.js';
import { h, replaceChildren } from './dom.js';
import { t } from './i18n.js';

/** Checks of the change-password form. Pure. */
export function checkPasswordChange({ current, next, confirm }) {
  const errors = {};
  if (!current) errors.current_password = t('Required');
  if (next.length < PASSWORD_MIN_LENGTH)
    errors.new_password = t('At least {PASSWORD_MIN_LENGTH} characters', { PASSWORD_MIN_LENGTH });
  else if (next === current)
    errors.new_password = t('Choose a password different from the current one');
  if (confirm !== next) errors.confirm_password = t('The two passwords differ');
  return errors;
}

/**
 * @param {HTMLElement} container
 * @param {{ username?: string, onChange: (current: string, next: string, form: HTMLFormElement) => void }} options
 */
export function renderAccount(container, { username = '', onChange }) {
  const field = (name, label, autocomplete, hint) => {
    const input = h('input', {
      id: `a-${name}`,
      name,
      type: 'password',
      autocomplete,
      'aria-describedby': `a-${name}-error`,
    });
    return {
      input,
      row: h(
        'div',
        { class: 'form-row' },
        h('label', { for: input.id }, label),
        h(
          'div',
          { class: 'form-control' },
          input,
          hint ? h('p', { class: 'field-hint' }, hint) : null,
          h('p', { id: `a-${name}-error`, class: 'field-error' }),
        ),
      ),
    };
  };
  const current = field('current_password', t('Current password'), 'current-password');
  const next = field(
    'new_password',
    t('New password'),
    'new-password',
    t('At least {PASSWORD_MIN_LENGTH} characters.', { PASSWORD_MIN_LENGTH }),
  );
  const confirm = field('confirm_password', t('Repeat the new password'), 'new-password');
  const form = h(
    'form',
    {
      class: 'detail-form account-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = {
          current: current.input.value,
          next: next.input.value,
          confirm: confirm.input.value,
        };
        const errors = checkPasswordChange(values);
        if (Object.keys(errors).length)
          return showErrors(form, errors, t('Check the highlighted fields.'));
        onChange(values.current, values.next, form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    // Lets password managers know whose password this is.
    h('input', {
      type: 'text',
      name: 'username',
      autocomplete: 'username',
      value: username,
      hidden: true,
      readonly: true,
    }),
    h(
      'p',
      { class: 'form-help' },
      t('Your other sessions (other browsers or devices) will end; this one stays open.'),
    ),
    current.row,
    next.row,
    confirm.row,
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        { type: 'submit', class: 'button button-primary online-only' },
        t('Change password'),
      ),
    ),
  );
  replaceChildren(
    container,
    h(
      'div',
      { class: 'account-page' },
      h('h2', { class: 'placeholder-title', tabindex: '-1' }, t('Change my password')),
      form,
    ),
  );
}
