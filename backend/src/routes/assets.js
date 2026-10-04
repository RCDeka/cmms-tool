import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { idParams, pageQueryFields, sortQueryFields } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ASSET_STATUSES, CATEGORIES, CRITICALITIES } from '../rules/enums.js';
import { ASSET_SORTS } from '../services/assets.js';
import { sendUpdateResult } from './write-response.js';

const listQuery = z.strictObject({
  ...pageQueryFields,
  ...sortQueryFields(ASSET_SORTS, 'code', 'asc'),
});

const searchQuery = z.strictObject({
  q: z.string().trim().max(100).optional(),
  site: z.string().max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  criticality: z.enum(CRITICALITIES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * @param {object} deps
 * @param {ReturnType<import('../services/assets.js').createAssetService>} deps.assets
 * @param {() => Date} deps.now
 */
export function assetsRouter({ assets, now }) {
  const router = Router();

  router.get('/', validate({ query: listQuery }), (req, res) => {
    res.json(assets.list(req.valid.query));
  });

  // Declared before /:id so "search" is not taken for an id.
  router.get('/search', validate({ query: searchQuery }), (req, res) => {
    res.json(assets.search(req.valid.query));
  });

  router.get('/:id', validate({ params: idParams }), (req, res) => {
    const asset = assets.getById(req.valid.params.id);
    if (!asset) throw new HttpError(404, 'Asset not found');
    res.json(asset);
  });

  router.put('/:id', validate({ params: idParams }), (req, res) => {
    sendUpdateResult(res, assets.update(req.valid.params.id, req.body, req.user, { now: now() }));
  });

  router.put(
    '/:id/resolve-conflict',
    requireRole('SUPERVISOR', 'ADMIN'),
    validate({ params: idParams }),
    (req, res) => {
      const item = assets.resolveConflict(req.valid.params.id, req.body, req.user, { now: now() });
      res.json({ resolved: true, version: item.version, item });
    },
  );

  return router;
}
