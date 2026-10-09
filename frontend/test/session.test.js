// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { decodeTokenPayload, isTokenExpired } from '../assets/js/session.js';

const token = (payload) =>
  `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`;

describe('session tokens', () => {
  it('decodes the payload', () => {
    expect(decodeTokenPayload(token({ sub: '2', exp: 100 }))).toEqual({ sub: '2', exp: 100 });
    expect(decodeTokenPayload('garbage')).toBeNull();
  });

  it('detects expiry', () => {
    const now = 1_000_000_000_000;
    expect(isTokenExpired(token({ exp: now / 1000 + 60 }), now)).toBe(false);
    expect(isTokenExpired(token({ exp: now / 1000 - 1 }), now)).toBe(true);
    expect(isTokenExpired(token({ sub: '1' }), now)).toBe(true);
    expect(isTokenExpired(null, now)).toBe(true);
  });
});
