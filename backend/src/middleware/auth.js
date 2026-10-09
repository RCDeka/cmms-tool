// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/http-error.js';
import { isTokenCurrent } from '../rules/users.js';

/**
 * Requires a valid `Authorization: Bearer <jwt>` header. The user is reloaded from the
 * database on every request, so a deactivated user, or a token issued before the last
 * password change, stops working at once (BR-U7, BR-U8).
 * Sets `req.user` (public user shape).
 * @param {{ jwtSecret: string }} config
 * @param {ReturnType<import('../services/users.js').createUserService>} users
 */
export function authenticate(config, users) {
  return (req, _res, next) => {
    const match = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '');
    if (!match) return next(new HttpError(401, 'Missing bearer token'));

    let payload;
    try {
      payload = jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'] });
    } catch (err) {
      const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
      return next(new HttpError(401, message));
    }

    const session = /^\d+$/.test(String(payload.sub)) ? users.session(Number(payload.sub)) : null;
    if (!session) return next(new HttpError(401, 'Invalid token'));
    if (!session.isActive) return next(new HttpError(401, 'This account is deactivated'));
    if (!isTokenCurrent(payload.iat, session.credentialsChangedAt)) {
      return next(new HttpError(401, 'Your password changed: log in again'));
    }
    req.user = session.user;
    next();
  };
}

/**
 * Restricts a route to the given roles (403 otherwise). Use after `authenticate`.
 * @param {...string} roles
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user?.role)) {
      return next(new HttpError(403, 'Your role does not allow this action'));
    }
    next();
  };
}
