// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from 'vitest';
import { initSchedulePage, showMyWeek } from '../assets/js/schedule-page.js';
import { clearSession, saveSession } from '../assets/js/session.js';

// Unsigned token with a future expiry: enough for the client, which only reads `exp`.
const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
const token = `x.${payload.replace(/=+$/, '')}.x`;

describe('My week', () => {
  afterEach(() => clearSession());

  it('tells administrators it is for technicians and supervisors (DT16)', async () => {
    const hooks = { leaveRecordViews: vi.fn(), showPlaceholder: vi.fn() };
    initSchedulePage(hooks);
    saveSession(token, { id: 1, role: 'ADMIN' });
    await showMyWeek({ name: 'myWeek', week: null, page: 1 }, () => true);
    expect(hooks.showPlaceholder).toHaveBeenCalledWith(
      null,
      'My week',
      expect.stringContaining('technicians and supervisors'),
      true,
    );
    expect(hooks.leaveRecordViews).not.toHaveBeenCalled();
  });
});
