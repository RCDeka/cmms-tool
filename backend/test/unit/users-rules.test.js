import { describe, expect, it } from 'vitest';
import { defaultPowerUser, isTokenCurrent, userChangeBlocker } from '../../src/rules/users.js';

const admin = { id: 1, role: 'ADMIN', is_active: 1 };
const tech = { id: 4, role: 'TECHNICIAN', is_active: 1 };
const blocker = (target, changes, extra = {}) =>
  userChangeBlocker({ target, changes, activeAdmins: 1, openWorkOrders: 0, actorId: 9, ...extra })
    ?.rule ?? null;

describe('userChangeBlocker', () => {
  it('keeps at least one active administrator (BR-U4)', () => {
    expect(blocker(admin, { is_active: false })).toBe('BR-U4');
    expect(blocker(admin, { role: 'SUPERVISOR' })).toBe('BR-U4');
    expect(blocker(admin, { role: 'SUPERVISOR' }, { activeAdmins: 2 })).toBeNull();
    expect(blocker(admin, { role: 'ADMIN', first_name: 'x' })).toBeNull();
  });

  it('refuses deactivating someone with unfinished work (BR-U5)', () => {
    expect(blocker(tech, { is_active: false }, { openWorkOrders: 3 })).toBe('BR-U5');
    expect(blocker(tech, { is_active: false })).toBeNull();
    expect(blocker(tech, { first_name: 'x' }, { openWorkOrders: 3 })).toBeNull();
  });

  it('refuses deactivating your own account (BR-U6)', () => {
    expect(blocker(tech, { is_active: false }, { actorId: 4 })).toBe('BR-U6');
  });

  it('lets an inactive user be reactivated', () => {
    expect(
      blocker({ ...tech, is_active: 0 }, { is_active: true }, { openWorkOrders: 2 }),
    ).toBeNull();
  });
});

describe('isTokenCurrent (BR-U8)', () => {
  const changed = '2026-10-04T12:00:00.500Z'; // second 1791115200
  it('accepts tokens issued in or after the second of the change', () => {
    expect(isTokenCurrent(1791115200, changed)).toBe(true);
    expect(isTokenCurrent(1791115260, changed)).toBe(true);
    expect(isTokenCurrent(1791115199, changed)).toBe(false);
    expect(isTokenCurrent(1, null)).toBe(true);
  });
});

describe('defaultPowerUser (D21)', () => {
  it('turns auto-save on for supervisors and admins', () => {
    expect(defaultPowerUser('ADMIN')).toBe(true);
    expect(defaultPowerUser('SUPERVISOR')).toBe(true);
    expect(defaultPowerUser('TECHNICIAN')).toBe(false);
  });
});
