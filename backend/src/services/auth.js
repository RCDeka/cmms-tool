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

  return {
    /**
     * Checks credentials and issues a JWT.
     * @returns {Promise<{ token: string, expires_in: number, user: object }>}
     */
    async login(username, password) {
      const found = users.findCredentials(username);
      const hash = found ? found.password_hash : await getDummyHash();
      const valid = await argon2.verify(hash, password);
      if (!found || !valid) throw new HttpError(401, 'Invalid username or password');

      const token = jwt.sign({ sub: String(found.id), role: found.role }, config.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: config.jwtExpiresIn,
      });
      const { iat, exp } = jwt.decode(token);
      return {
        token,
        expires_in: exp - iat,
        user: {
          id: found.id,
          last_name: found.last_name,
          first_name: found.first_name,
          role: found.role,
          power_user: toBool(found.power_user),
        },
      };
    },
  };
}
