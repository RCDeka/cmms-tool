// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { checkPasswordChange, renderAccount } from '../assets/js/account.js';
import {
  checkUserForm,
  parseUserFilters,
  renderUserCreate,
  renderUserPanel,
  usersUrl,
} from '../assets/js/admin-users.js';
import { parseRoute } from '../assets/js/router.js';

const user = {
  id: 7,
  username: 'jdoe',
  first_name: 'Jane',
  last_name: 'Doe',
  role: 'TECHNICIAN',
  site: 'Head office',
  specialty: null,
  power_user: false,
  is_active: true,
  updated_at: '2026-10-01T08:00:00.000Z',
};

describe('user admin routes', () => {
  it.each([
    ['/admin/users', '', { name: 'users', page: 1 }],
    ['/admin/users/', '?page=2', { name: 'users', page: 2 }],
    ['/admin/users/new', '', { name: 'userCreate', page: 1 }],
    ['/admin/users/7', '?role=ADMIN', { name: 'user', id: 7, page: 1, filters: { role: 'ADMIN' } }],
    ['/admin/users/abc', '', { name: 'notFound', page: 1 }],
    ['/admin/users/7/x', '', { name: 'notFound', page: 1 }],
    ['/admin', '', { name: 'notFound', page: 1 }],
    ['/account', '', { name: 'account', page: 1 }],
    ['/account/x', '', { name: 'notFound', page: 1 }],
  ])('%s%s', (path, search, expected) => {
    expect(parseRoute(path, search)).toEqual(expected);
  });

  it('keeps valid filters only', () => {
    const query = new URLSearchParams('q=%20doe%20&role=BOSS&active=false');
    expect(parseUserFilters(query)).toEqual({ q: 'doe', active: 'false' });
  });

  it('builds list and panel URLs', () => {
    expect(usersUrl()).toBe('/admin/users');
    expect(usersUrl({ q: 'doe', role: 'ADMIN', active: 'true', page: 2 })).toBe(
      '/admin/users?q=doe&role=ADMIN&active=true&page=2',
    );
    expect(usersUrl({ id: 7, page: 1 })).toBe('/admin/users/7');
  });
});

describe('checkUserForm', () => {
  const valid = {
    username: 'new.user',
    first_name: 'A',
    last_name: 'B',
    role: 'TECHNICIAN',
    password: 'long-enough-pw',
  };

  it('accepts a valid new user', () => {
    expect(checkUserForm(valid, { creating: true })).toEqual({});
  });

  it('flags a bad username, missing names and role, short password', () => {
    expect(
      checkUserForm(
        { username: 'a b', first_name: ' ', last_name: '', role: '', password: 'short' },
        { creating: true },
      ),
    ).toEqual({
      username: expect.any(String),
      first_name: 'Required',
      last_name: 'Required',
      role: 'Required',
      password: 'At least 10 characters',
    });
  });

  it('ignores username and password when editing', () => {
    expect(
      checkUserForm({ first_name: 'A', last_name: 'B', role: 'ADMIN' }, { creating: false }),
    ).toEqual({});
  });
});

describe('checkPasswordChange', () => {
  it('accepts a valid change', () => {
    expect(
      checkPasswordChange({ current: 'old', next: 'new-password-1', confirm: 'new-password-1' }),
    ).toEqual({});
  });

  it('rejects a short, unchanged or unconfirmed password', () => {
    expect(checkPasswordChange({ current: '', next: 'short', confirm: 'x' })).toEqual({
      current_password: 'Required',
      new_password: 'At least 10 characters',
      confirm_password: 'The two passwords differ',
    });
    expect(
      checkPasswordChange({ current: 'same-pass-1', next: 'same-pass-1', confirm: 'same-pass-1' })
        .new_password,
    ).toMatch(/different/);
  });
});

describe('user forms', () => {
  it('creation: auto-save follows the role until the admin ticks the box', () => {
    const container = document.createElement('div');
    renderUserCreate(container, { refs: {}, onClose: () => {}, onCreate: () => {} });
    const role = container.querySelector('[name="role"]');
    const power = container.querySelector('[name="power_user"]');
    role.value = 'SUPERVISOR';
    role.dispatchEvent(new Event('change'));
    expect(power.checked).toBe(true);
    role.value = 'TECHNICIAN';
    role.dispatchEvent(new Event('change'));
    expect(power.checked).toBe(false);
    power.checked = true;
    power.dispatchEvent(new Event('change'));
    role.value = 'TECHNICIAN';
    role.dispatchEvent(new Event('change'));
    expect(power.checked).toBe(true);
  });

  it('creation: invalid input shows errors and does not call onCreate', () => {
    const container = document.createElement('div');
    const onCreate = vi.fn();
    renderUserCreate(container, { refs: {}, onClose: () => {}, onCreate });
    container.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(container.querySelector('#u-username').getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('#u-password-error').textContent).toMatch(/10/);
  });

  it('panel: sends the edited profile; username is read-only', () => {
    const container = document.createElement('div');
    const onSave = vi.fn();
    renderUserPanel(container, { user, refs: {}, onClose: () => {}, onSave });
    expect(container.querySelector('form:not(.password-reset) [name="username"]')).toBeNull();
    container.querySelector('[name="is_active"]').checked = false;
    container.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSave).toHaveBeenCalledWith(
      {
        first_name: 'Jane',
        last_name: 'Doe',
        role: 'TECHNICIAN',
        site: 'Head office',
        specialty: null,
        power_user: false,
        is_active: false,
      },
      expect.any(HTMLFormElement),
    );
  });

  it('panel: password reset is offered for others, not for oneself', () => {
    const other = document.createElement('div');
    renderUserPanel(other, { user, refs: {}, onClose: () => {} });
    expect(other.querySelector('.password-reset')).not.toBeNull();
    const self = document.createElement('div');
    renderUserPanel(self, { user, refs: {}, isSelf: true, onClose: () => {} });
    expect(self.querySelector('.password-reset')).toBeNull();
    expect(self.querySelector('a[href="/account"]')).not.toBeNull();
  });

  it('account: a valid form calls onChange with both passwords', () => {
    const container = document.createElement('div');
    const onChange = vi.fn();
    renderAccount(container, { onChange });
    container.querySelector('#a-current_password').value = 'old-password';
    container.querySelector('#a-new_password').value = 'new-password-1';
    container.querySelector('#a-confirm_password').value = 'new-password-1';
    container.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onChange).toHaveBeenCalledWith('old-password', 'new-password-1', expect.any(Object));
  });
});
