import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/http-error.js';
import { toBool } from './mappers.js';

/**
 * @param {{ jwtSecret: string, jwtExpiresIn: string }} config
 * @param {ReturnType<import('./users.js').createUserService>} users
 */
export function createAuthService(config, users) {
  // Verifying against a dummy hash when the username is unknown keeps response times similar,
  // so timing does not reveal which usernames exist.
  let dummyHash;
  const getDummyHash = () => (dummyHash ??= argon2.hash('dummy-password-never-matches'));

  /** Signed JWT for a user, with its lifetime in seconds. */
  const issueToken = (user) => {
    const token = jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiresIn,
    });
    const { iat, exp } = jwt.decode(token);
    return { token, expires_in: exp - iat };
  };

  const loginUser = (found) => ({
    id: found.id,
    last_name: found.last_name,
    first_name: found.first_name,
    role: found.role,
    power_user: toBool(found.power_user),
  });

  return {
    /**
     * Checks credentials and issues a JWT.
     * @returns {Promise<{ token: string, expires_in: number, user: object }>}
     */
    async login(username, password) {
      const found = users.findCredentials(username);
      const hash = found ? found.password_hash : await getDummyHash();
      const valid = await argon2.verify(hash, password);
      // Deactivated accounts get the same answer as a wrong password (BR-U7).
      if (!found || !valid || found.is_active !== 1) {
        throw new HttpError(401, 'Invalid username or password');
      }
      return { ...issueToken(found), user: loginUser(found) };
    },

    /**
     * POST /api/auth/change-password: the user's own password. Earlier sessions end
     * (BR-U8); the answer carries a new token for this one.
     */
    async changePassword(user, currentPassword, newPassword, { now }) {
      if (!(await users.verifyPassword(user.id, currentPassword))) {
        // 400, not 401: a wrong current password must not log the user out.
        throw new HttpError(400, 'The current password is not correct', {
          fields: { current_password: 'Not correct' },
        });
      }
      await users.setPassword(user.id, newPassword, user, {
        now,
        note: { password_changed: true },
      });
      return issueToken(user);
    },
  };
}
