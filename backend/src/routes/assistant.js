// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { validate } from '../middleware/validate.js';
import { RAW_TEXT_MAX_LENGTH, checkRawText } from '../rules/assistant-input.js';

// Generous bound before normalisation (spaces and invisible characters are removed first);
// the real limit is checked by checkRawText (BR-AI2).
const findSchema = z.strictObject({
  raw_text: z.string().max(RAW_TEXT_MAX_LENGTH * 4),
  asset_id: z.number().int().positive().optional(),
  site: z.string().trim().min(1).max(100).optional(),
});

/**
 * /api/assistant (docs/spec-ai-assistant.md, D66, D67). Maintenance roles only (app.js).
 * @param {object} deps
 * @param {ReturnType<import('../services/assistant.js').createAssistantService>} deps.assistant
 * @param {{ windowMs: number, limit: number }} deps.callLimit
 */
export function assistantRouter({ assistant, callLimit }) {
  const router = Router();

  // BR-AI4: per user; only requests that will call the model are counted.
  const limiter = rateLimit({
    ...callLimit,
    keyGenerator: (req) => `user-${req.user.id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      assistant.log({
        event: 'assistant',
        endpoint: 'find-work-order',
        user_id: req.user.id,
        outcome: 'RATE_LIMITED',
      });
      next(new HttpError(429, 'Too many assistant requests. Try again in a few minutes.'));
    },
  });

  router.post(
    '/find-work-order',
    validate({ body: findSchema }),
    // Layer 1 (BR-AI1 to BR-AI3): nothing reaches the model before these checks.
    (req, _res, next) => {
      const checked = checkRawText(req.valid.body.raw_text);
      if (!checked.ok) {
        assistant.log({
          event: 'assistant',
          endpoint: 'find-work-order',
          user_id: req.user.id,
          outcome: 'REJECTED_INPUT',
        });
        throw new HttpError(400, checked.message, {
          rule: 'BR-AI2',
          fields: { raw_text: checked.message },
        });
      }
      req.text = checked.text;
      req.found = assistant.candidates(
        { text: checked.text, assetId: req.valid.body.asset_id, site: req.valid.body.site },
        req.user,
      );
      next();
    },
    (req, res, next) => (assistant.enabled && req.found.length ? limiter(req, res, next) : next()),
    async (req, res) => {
      res.json(await assistant.rank(req.text, req.found, req.user));
    },
  );

  return router;
}
