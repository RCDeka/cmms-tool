// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { nowIso } from '../lib/dates.js';

/**
 * GET /api/health: public. Also used by the client to check that the server is reachable.
 * @param {import('better-sqlite3').Database} db
 */
export function healthRouter(db) {
  const router = Router();
  const ping = db.prepare('SELECT 1');
  router.get('/', (_req, res) => {
    ping.get(); // throws, and so answers 500, if the database is unusable
    res.json({ status: 'ok', time: nowIso() });
  });
  return router;
}
