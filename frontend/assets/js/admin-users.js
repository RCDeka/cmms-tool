// User administration screens (administrators only, online only, D39).
import { badgeClass, h, replaceChildren } from './dom.js';
import { CATEGORIES, ROLES } from './enums.js';
import { formatDateTime } from './format.js';
import { valueLabel } from './labels.js';

export const PASSWORD_MIN_LENGTH = 10;

/** Admin list URL with its filters, or a user's panel when `id` is given. Pure. */
export function usersUrl({ q, role, active, page, id } = {}) {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (role) query.set('role', role);
  if (active) query.set('active', active);
  if (page > 1) query.set('page', String(page));
  const text = query.toString();
  return `/admin/users${id ? `/${id}` : ''}${text ? `?${text}` : ''}`;
}

/** Filters of the user list from the URL query (invalid values dropped). Pure. */
export function parseUserFilters(query) {
  const filters = {};
  const q = query.get('q')?.trim();
  if (q) filters.q = q.slice(0, 100);
  if (ROLES.includes(query.get('role'))) filters.role = query.get('role');
  if (['true', 'false'].includes(query.get('active'))) filters.active = query.get('active');
  return filters;
}

/** Checks before creating a user or setting a password. Pure. */
export function checkUserForm(values, { creating }) {
  const errors = {};
  if (creating && !/^[a-z0-9._-]{3,50}$/.test((values.username ?? '').trim().toLowerCase())) {
    errors.username = 'Letters, digits, dot, dash or underscore, 3 to 50 characters';
  }
  for (const field of ['first_name', 'last_name']) {
    if (!String(values[field] ?? '').trim()) errors[field] = 'Required';
  }
  if (!values.role) errors.role = 'Required';
  if (creating && String(values.password ?? '').length < PASSWORD_MIN_LENGTH) {
    errors.password = `At least ${PASSWORD_MIN_LENGTH} characters`;
  }
  return errors;
}

const roleBadge = (role) =>
  h(
    'span',
    { class: badgeClass('role', role, role === 'ADMIN' ? 'primary' : 'neutral') },
    valueLabel('role', role),
  );
const activeBadge = (active) =>
  h(
    'span',
    { class: badgeClass('active', String(active), active ? 'success' : 'neutral') },
    active ? 'Active' : 'Inactive',
  );

/**
 * User list with its filter row.
 * @param {HTMLElement} container
 * @param {{ data: object, filters: object, selectedId: number | null,
 *   onFilter: (filters: object) => void, pagination: HTMLElement }} options
 */
export function renderUserList(container, { data, filters, selectedId, onFilter, pagination }) {
  const search = h('input', {
    id: 'users-q',
    type: 'search',
    maxlength: '100',
    value: filters.q ?? '',
    placeholder: 'Name or username',
  });
  const role = h(
    'select',
    { id: 'users-role' },
    h('option', { value: '' }, 'Any'),
    ROLES.map((r) => h('option', { value: r }, valueLabel('role', r))),
  );
  role.value = filters.role ?? '';
  const active = h(
    'select',
    { id: 'users-active' },
    h('option', { value: '' }, 'Any'),
    h('option', { value: 'true' }, 'Active'),
    h('option', { value: 'false' }, 'Inactive'),
  );
  active.value = filters.active ?? '';
  const apply = () =>
    onFilter({
      q: search.value.trim() || undefined,
      role: role.value || undefined,
      active: active.value || undefined,
    });
  role.addEventListener('change', apply);
  active.addEventListener('change', apply);

  const rows = data.items.map((u) =>
    h(
      'tr',
      {
        class: u.id === selectedId ? 'is-selected' : null,
        'aria-current': u.id === selectedId ? 'true' : null,
      },
      h(
        'td',
        {},
        h(
          'a',
          { href: `/admin/users/${u.id}${location.search}`, 'data-link': true },
          `${u.first_name} ${u.last_name}`,
        ),
      ),
      h('td', {}, u.username),
      h('td', {}, roleBadge(u.role)),
      h('td', { class: 'col-secondary' }, u.site ?? '—'),
      h('td', {}, activeBadge(u.is_active)),
    ),
  );
  replaceChildren(
    container,
    h('h2', { class: 'table-title visually-hidden', tabindex: '-1' }, 'Users'),
    h(
      'form',
      {
        class: 'filter-bar',
        role: 'search',
        'aria-label': 'Search users',
        onSubmit: (event) => {
          event.preventDefault();
          apply();
        },
      },
      h(
        'div',
        { class: 'filter-field filter-search' },
        h('label', { for: 'users-q' }, 'Search'),
        search,
      ),
      h('div', { class: 'filter-field' }, h('label', { for: 'users-role' }, 'Role'), role),
      h('div', { class: 'filter-field' }, h('label', { for: 'users-active' }, 'Account'), active),
      h('button', { type: 'submit', class: 'button button-secondary' }, 'Search'),
    ),
    h(
      'div',
      { class: 'table-header' },
      h(
        'p',
        { class: 'table-count', role: 'status' },
        `${data.total} ${data.total === 1 ? 'user' : 'users'}`,
      ),
      h(
        'a',
        { href: '/admin/users/new', 'data-link': true, class: 'button button-primary' },
        '+ New user',
      ),
    ),
    data.items.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data-table users-table' },
            h('caption', { class: 'visually-hidden' }, `Users, page ${data.page} of ${data.pages}`),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ['Name', 'Username', 'Role', 'Site', 'Account'].map((t) =>
                  h('th', { scope: 'col', class: t === 'Site' ? 'col-secondary' : null }, t),
                ),
              ),
            ),
            h('tbody', {}, rows),
          ),
        )
      : h('p', { class: 'empty-state' }, 'No user matches this search.'),
    pagination,
  );
}

/** One labelled form row with its error line. */
function row(id, label, control, { required = false, hint = null } = {}) {
  control.id = id;
  control.setAttribute('aria-describedby', `${id}-error${hint ? ` ${id}-hint` : ''}`);
  return h(
    'div',
    { class: 'form-row' },
    h(
      'label',
      { for: id },
      label,
      required ? h('span', { class: 'required', 'aria-hidden': 'true' }, ' *') : null,
    ),
    h(
      'div',
      { class: 'form-control' },
      control,
      hint ? h('p', { id: `${id}-hint`, class: 'field-hint' }, hint) : null,
      h('p', { id: `${id}-error`, class: 'field-error' }),
    ),
  );
}

/** Shows server or local errors next to the fields and in the summary. */
export function showErrors(form, fields = {}, message = '') {
  for (const input of form.querySelectorAll('input, select')) {
    const name = input.name;
    const text = fields[name] ?? '';
    const line = form.querySelector(`#${input.id}-error`);
    if (line) line.textContent = text;
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  const summary = form.querySelector('.form-summary');
  summary.textContent = message;
  (form.querySelector('[aria-invalid="true"]') ?? (message ? summary : null))?.focus();
}

/**
 * Fields of the user form; `user` is null when creating.
 * @returns {{ elements: HTMLElement[], read: () => object }}
 */
function userFields(user, refs) {
  const text = (name, value, attrs = {}) =>
    h('input', { name, type: 'text', maxlength: '100', value: value ?? '', ...attrs });
  const username = user
    ? null
    : text('username', '', {
        autocomplete: 'off',
        autocapitalize: 'none',
        spellcheck: 'false',
        maxlength: '50',
      });
  const first = text('first_name', user?.first_name, { autocomplete: 'off' });
  const last = text('last_name', user?.last_name, { autocomplete: 'off' });
  const role = h(
    'select',
    { name: 'role' },
    user ? null : h('option', { value: '' }, '— Choose —'),
    ROLES.map((r) => h('option', { value: r }, valueLabel('role', r))),
  );
  role.value = user?.role ?? '';
  const site = text('site', user?.site, {
    list: 'user-site-options',
    maxlength: '200',
    autocomplete: 'off',
  });
  const specialty = h(
    'select',
    { name: 'specialty' },
    h('option', { value: '' }, '— None —'),
    CATEGORIES.map((c) => h('option', { value: c }, valueLabel('category', c))),
  );
  specialty.value = user?.specialty ?? '';
  const power = h('input', { name: 'power_user', type: 'checkbox', class: 'checkbox' });
  power.checked = user ? user.power_user : false;
  // New users: auto-save follows the role until the admin decides otherwise (D21).
  let powerTouched = Boolean(user);
  power.addEventListener('change', () => (powerTouched = true));
  role.addEventListener('change', () => {
    if (!powerTouched) power.checked = role.value !== '' && role.value !== 'TECHNICIAN';
  });
  const active = user
    ? h('input', { name: 'is_active', type: 'checkbox', class: 'checkbox' })
    : null;
  if (active) active.checked = user.is_active;
  const password = user
    ? null
    : h('input', {
        name: 'password',
        type: 'password',
        autocomplete: 'new-password',
        minlength: String(PASSWORD_MIN_LENGTH),
      });

  const elements = [
    username
      ? row('u-username', 'Username', username, {
          required: true,
          hint: 'Used to log in; cannot be changed later.',
        })
      : null,
    row('u-first_name', 'First name', first, { required: true }),
    row('u-last_name', 'Last name', last, { required: true }),
    row('u-role', 'Role', role, { required: true }),
    row('u-site', 'Site', site),
    h(
      'datalist',
      { id: 'user-site-options' },
      (refs.sites ?? []).map((s) => h('option', { value: s })),
    ),
    row('u-specialty', 'Specialty', specialty),
    row('u-power_user', 'Auto-save', power, {
      hint: 'Changes are saved when leaving a record (power user).',
    }),
    active
      ? row('u-is_active', 'Account active', active, {
          hint: 'Inactive users cannot log in; their sessions end at once.',
        })
      : null,
    password
      ? row('u-password', 'Password', password, {
          required: true,
          hint: `At least ${PASSWORD_MIN_LENGTH} characters. Give it to the user privately.`,
        })
      : null,
  ].filter(Boolean);

  const read = () => ({
    ...(username && { username: username.value.trim().toLowerCase() }),
    first_name: first.value.trim(),
    last_name: last.value.trim(),
    role: role.value,
    site: site.value.trim() || null,
    specialty: specialty.value || null,
    power_user: power.checked,
    ...(active && { is_active: active.checked }),
    ...(password && { password: password.value }),
  });
  return { elements, read };
}

const panelHeader = (title, onClose) =>
  h(
    'div',
    { class: 'detail-header' },
    h(
      'button',
      { type: 'button', class: 'button button-secondary back-to-list', onClick: onClose },
      '← Back to list',
    ),
    h('h2', { class: 'detail-title', tabindex: '-1' }, title),
    h(
      'button',
      { type: 'button', class: 'icon-button', 'aria-label': 'Close details', onClick: onClose },
      h('span', { 'aria-hidden': 'true' }, '✕'),
    ),
  );

/**
 * Panel of one user: profile form and password reset.
 * @param {HTMLElement} container
 * @param {{ user: object, refs: object, onClose: () => void,
 *   onSave: (changes: object, form: HTMLFormElement) => void,
 *   onResetPassword: (password: string, form: HTMLFormElement) => void }} options
 */
export function renderUserPanel(
  container,
  { user, refs, isSelf = false, onClose, onSave, onResetPassword },
) {
  const { elements, read } = userFields(user, refs);
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = read();
        const errors = checkUserForm(values, { creating: false });
        if (Object.keys(errors).length)
          return showErrors(form, errors, 'Check the highlighted fields.');
        onSave(values, form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h(
      'div',
      { class: 'form-row is-readonly' },
      h('span', { class: 'field-label' }, 'Username'),
      h('div', { class: 'field-value' }, user.username),
    ),
    elements,
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'submit', class: 'button button-primary online-only' }, 'Save'),
    ),
  );

  const newPassword = h('input', {
    name: 'password',
    type: 'password',
    autocomplete: 'new-password',
    minlength: String(PASSWORD_MIN_LENGTH),
  });
  const resetForm = h(
    'form',
    {
      class: 'detail-form password-reset',
      novalidate: true,
      'aria-labelledby': 'reset-title',
      onSubmit: (event) => {
        event.preventDefault();
        if (newPassword.value.length < PASSWORD_MIN_LENGTH) {
          return showErrors(
            resetForm,
            { password: `At least ${PASSWORD_MIN_LENGTH} characters` },
            '',
          );
        }
        onResetPassword(newPassword.value, resetForm);
      },
    },
    h('h3', { id: 'reset-title' }, 'Reset password'),
    // Lets password managers know whose password this is.
    h('input', {
      type: 'text',
      name: 'username',
      autocomplete: 'username',
      value: user.username,
      hidden: true,
      readonly: true,
    }),
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    row('u-new-password', 'New password', newPassword, {
      hint: "The user's open sessions end at once.",
    }),
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        { type: 'submit', class: 'button button-secondary online-only' },
        'Set new password',
      ),
    ),
  );

  replaceChildren(
    container,
    panelHeader(`${user.first_name} ${user.last_name}`, onClose),
    h(
      'p',
      { class: 'muted user-meta' },
      roleBadge(user.role),
      ' ',
      activeBadge(user.is_active),
      user.updated_at ? ` · Last changed ${formatDateTime(user.updated_at)}` : '',
    ),
    form,
    // A reset of one's own password would end this session: the account page keeps it (BR-U8).
    isSelf
      ? h(
          'p',
          { class: 'form-help' },
          'To change your own password, use ',
          h('a', { href: '/account', 'data-link': true }, 'Change my password'),
          '.',
        )
      : resetForm,
  );
}

/** Field errors of an API failure, for showErrors. */
export const apiFieldErrors = (err) => err.body?.details?.fields ?? {};

/** Creation form of a user. */
export function renderUserCreate(container, { refs, onClose, onCreate }) {
  const { elements, read } = userFields(null, refs);
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = read();
        const errors = checkUserForm(values, { creating: true });
        if (Object.keys(errors).length)
          return showErrors(form, errors, 'Check the highlighted fields.');
        onCreate(values, form);
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h('p', { class: 'form-help' }, 'Fields marked * are required.'),
    elements,
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'submit', class: 'button button-primary online-only' }, 'Create user'),
    ),
  );
  replaceChildren(container, panelHeader('New user', onClose), form);
}
