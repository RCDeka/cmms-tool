import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { idParams, pageQueryFields } from '../lib/pagination.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const listQuery = z.strictObject({
  ...pageQueryFields,
  entity_type: z.enum(['assets', 'work_orders', 'users']).optional(),
});

/**
 * GET /api/<entity>/:id/history handler: history of one record, newest first. Deleted
 * records keep their history; 404 only when nothing ever existed.
 * @param {ReturnType<import('../services/audit.js').createAuditService>} audit
 * @param {string} entityType
 * @param {(id: number) => object | null} getById
 */
export function historyHandler(audit, entityType, getById) {
  return [
    validate({ params: idParams }),
    (req, res) => {
      const history = audit.history(entityType, req.valid.params.id);
      if (!history.items.length && !getById(req.valid.params.id)) {
        throw new HttpError(404, 'Record not found');
      }
      res.json(history);
    },
  ];
}

/**
 * GET /api/audit-log: the global log (supervisors and admins). Changes to user accounts are
 * for administrators only (D39).
 */
export function auditRouter({ audit }) {
  const router = Router();
  router.get(
    '/',
    requireRole('SUPERVISOR', 'ADMIN'),
    validate({ query: listQuery }),
    (req, res) => {
      const isAdmin = req.user.role === 'ADMIN';
      if (req.valid.query.entity_type === 'users' && !isAdmin) {
        throw new HttpError(403, 'Only administrators can see changes to user accounts');
      }
      res.json(audit.list({ ...req.valid.query, includeUsers: isAdmin }));
    },
  );
  return router;
}
