// User administration rules (docs/data-model.md → BR-U2 to BR-U8). Pure.

export const PASSWORD_MIN_LENGTH = 10;

/**
 * Why an admin change to a user is refused, or null.
 * @param {object} input
 * @param {{ id: number, role: string, is_active: number }} input.target stored user
 * @param {{ role?: string, is_active?: boolean }} input.changes
 * @param {number} input.activeAdmins number of active admins, target included
 * @param {number} input.openWorkOrders non-terminal work orders assigned to the target
 * @param {number} input.actorId the admin making the change
 * @returns {{ rule: string, message: string } | null}
 */
export function userChangeBlocker({ target, changes, activeAdmins, openWorkOrders, actorId }) {
  const deactivating = changes.is_active === false && target.is_active === 1;
  const demoting =
    changes.role !== undefined && changes.role !== 'ADMIN' && target.role === 'ADMIN';
  if (deactivating && target.id === actorId) {
    return { rule: 'BR-U6', message: 'You cannot deactivate your own account.' };
  }
  if (
    (deactivating || demoting) &&
    target.role === 'ADMIN' &&
    target.is_active === 1 &&
    activeAdmins <= 1
  ) {
    return { rule: 'BR-U4', message: 'This is the last active administrator: keep at least one.' };
  }
  if (deactivating && openWorkOrders > 0) {
    return {
      rule: 'BR-U5',
      message: `This user has ${openWorkOrders} unfinished work order${openWorkOrders === 1 ? '' : 's'}: reassign ${openWorkOrders === 1 ? 'it' : 'them'} first.`,
    };
  }
  return null;
}

/**
 * True when a token is still valid after password changes (BR-U8): it must have been
 * issued in or after the second of the last change (JWT times are whole seconds).
 * @param {number} issuedAt JWT `iat` (seconds)
 * @param {string | null} credentialsChangedAt ISO datetime or null
 */
export function isTokenCurrent(issuedAt, credentialsChangedAt) {
  if (!credentialsChangedAt) return true;
  return issuedAt >= Math.floor(Date.parse(credentialsChangedAt) / 1000);
}

/** Power-user mode by default for supervisors and admins (D21). */
export const defaultPowerUser = (role) => role === 'SUPERVISOR' || role === 'ADMIN';
