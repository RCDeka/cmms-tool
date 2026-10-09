// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// App shell: sidebar, menu button, page title, status bar, live announcements,
// split view.
import { APP_NAME } from './config.js';
import { h, replaceChildren } from './dom.js';
import { valueLabel } from './labels.js';

const $ = (id) => document.getElementById(id);

/** Wires the static shell from index.html. */
export function initLayout({ onLogout }) {
  for (const el of document.querySelectorAll('[data-app-name]')) el.textContent = APP_NAME;
  $('menu-button').addEventListener('click', () =>
    setMenuOpen(!document.body.classList.contains('menu-open')),
  );
  $('logout-button').addEventListener('click', onLogout);
  // Close the menu after choosing a page, or with Escape.
  $('sidebar').addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });
  // A click on the dimmed backdrop (the body itself) closes the menu.
  document.body.addEventListener('click', (event) => {
    if (event.target === document.body) setMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('menu-open')) {
      setMenuOpen(false);
      $('menu-button').focus();
    }
  });
}

function setMenuOpen(open) {
  document.body.classList.toggle('menu-open', open);
  $('menu-button').setAttribute('aria-expanded', String(open));
  $('menu-button').setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

/**
 * Switches between the app shell and the login page. The `hidden` attribute (not only CSS)
 * keeps a single visible <main> landmark, as HTML requires.
 */
function setShellVisible(visible) {
  document.body.classList.toggle('is-logged-out', !visible);
  $('sidebar').hidden = !visible;
  $('app-main').hidden = !visible;
  $('login-container').hidden = visible;
  if (visible) replaceChildren($('login-container'));
}

/** Shows the app for a logged-in user: user box, role-restricted links. */
export function showLoggedIn(user) {
  setShellVisible(true);
  $('user-name').textContent = `${user.first_name} ${user.last_name}`;
  $('user-role').textContent = valueLabel('role', user.role);
  for (const el of document.querySelectorAll('[data-roles]')) {
    el.hidden = !el.dataset.roles.split(' ').includes(user.role);
  }
  $('session-status').textContent = `Signed in as ${user.first_name} ${user.last_name}`;
}

/** Hides the app shell and shows the login page. */
export function showLoggedOut() {
  setShellVisible(false);
  setMenuOpen(false);
  $('session-status').textContent = '';
}

/** Highlights the sidebar link of the current section. */
export function setActiveNav(section) {
  for (const link of document.querySelectorAll('#sidebar [data-nav]')) {
    if (link.dataset.nav === section) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

/** Sets the visible page heading and the document title. */
export function setTitle(text) {
  $('page-title').textContent = text;
  document.title = `${text} · ${APP_NAME}`;
}

/** Announces a message to screen readers (aria-live region). */
export function announce(message) {
  const region = $('live-region');
  region.textContent = '';
  // A separate task makes repeated identical messages announced again.
  setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/** Table only, or table + detail panel. */
export function setSplitView(open) {
  $('main-content').classList.toggle('split-view', open);
  $('detail-container').classList.toggle('hidden', !open);
}

/** Simple full-width view (dashboard, placeholders, errors). */
export function renderPage(...children) {
  setSplitView(false);
  replaceChildren($('table-container'), ...children);
  replaceChildren($('detail-container'));
}

/** Placeholder for views delivered in a later phase. */
export function renderPlaceholder(title, message) {
  renderPage(
    h(
      'div',
      { class: 'placeholder' },
      h('h2', { class: 'placeholder-title', tabindex: '-1' }, title),
      h('p', {}, message),
    ),
  );
}

/**
 * Modal question with buttons (native <dialog>: focus stays inside, Escape cancels).
 * @param {{ title: string, message: string,
 *   actions: { value: string, label: string, primary?: boolean }[], cancelValue?: string }} options
 * @returns {Promise<string>} value of the chosen action, or cancelValue for Escape
 */
export function confirmDialog({ title, message, actions, cancelValue = 'cancel' }) {
  const dialog = $('confirm-dialog');
  replaceChildren(
    dialog,
    h('h2', { id: 'confirm-title', class: 'dialog-title' }, title),
    h('p', { id: 'confirm-message' }, message),
    h(
      'div',
      { class: 'dialog-actions' },
      actions.map((a) =>
        h(
          'button',
          {
            type: 'button',
            class: `button ${a.primary ? 'button-primary' : 'button-secondary'}`,
            dataset: { value: a.value },
          },
          a.label,
        ),
      ),
    ),
  );
  return new Promise((resolve) => {
    const done = (value) => {
      dialog.close();
      resolve(value);
    };
    dialog.onclick = (event) => {
      const button = event.target.closest('button[data-value]');
      if (button) done(button.dataset.value);
    };
    dialog.oncancel = (event) => {
      event.preventDefault();
      done(cancelValue);
    };
    dialog.showModal();
    (dialog.querySelector('.button-primary') ?? dialog.querySelector('button'))?.focus();
  });
}

/** Status bar: number of writes waiting to be sent. */
export function setSyncStatus(count) {
  $('sync-status').textContent = count
    ? `${count} change${count === 1 ? '' : 's'} waiting to sync`
    : '';
}
