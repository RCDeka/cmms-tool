// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Login page.
import { login } from './auth.js';
import { APP_NAME } from './config.js';
import { h, replaceChildren } from './dom.js';
import { languageSwitch } from './layout.js';
import { t } from './i18n.js';

/** Message for a failed login, by status. */
export function loginErrorMessage(error) {
  if (error.status === 401) return t('Wrong username or password.');
  if (error.status === 429) return t('Too many attempts. Wait a few minutes and try again.');
  if (error.status === 0)
    return t('The server cannot be reached. Check your connection and try again.');
  return t('Login failed. Try again later.');
}

/**
 * @param {HTMLElement} container
 * @param {{ onLoggedIn: (user: object) => void }} options
 */
export function renderLogin(container, { onLoggedIn }) {
  const error = h('p', { class: 'form-error', id: 'login-error', role: 'alert' });
  const username = h('input', {
    id: 'login-username',
    name: 'username',
    autocomplete: 'username',
    required: true,
    autocapitalize: 'none',
    spellcheck: 'false',
  });
  const password = h('input', {
    id: 'login-password',
    name: 'password',
    type: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const submit = h('button', { type: 'submit', class: 'button button-primary' }, t('Log in'));

  const form = h(
    'form',
    {
      class: 'login-form',
      novalidate: true,
      'aria-describedby': 'login-error',
      onSubmit: async (event) => {
        event.preventDefault();
        error.textContent = '';
        if (!username.value.trim() || !password.value) {
          error.textContent = t('Enter your username and password.');
          (username.value.trim() ? password : username).focus();
          return;
        }
        submit.disabled = true;
        submit.textContent = t('Logging in…');
        try {
          onLoggedIn(await login(username.value.trim(), password.value));
        } catch (err) {
          error.textContent = loginErrorMessage(err);
          password.value = '';
          password.focus();
        } finally {
          submit.disabled = false;
          submit.textContent = t('Log in');
        }
      },
    },
    h(
      'div',
      { class: 'form-field' },
      h('label', { for: 'login-username' }, t('Username')),
      username,
    ),
    h(
      'div',
      { class: 'form-field' },
      h('label', { for: 'login-password' }, t('Password')),
      password,
    ),
    error,
    submit,
  );

  replaceChildren(
    container,
    h(
      'main',
      { class: 'login-card' },
      h(
        'div',
        { class: 'login-head' },
        h('img', {
          src: '/assets/img/logo.svg',
          alt: '',
          width: '48',
          height: '48',
          class: 'login-logo',
        }),
        languageSwitch(),
      ),
      h('h1', { class: 'login-title' }, APP_NAME),
      h('p', { class: 'login-subtitle' }, t('Maintenance management')),
      form,
    ),
  );
  username.focus();
}
