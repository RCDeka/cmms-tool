// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Sends the result of a versioned update (docs/api-design.md → PUT /api/assets/:id).
 * @param {import('express').Response} res
 * @param {{ status: string, conflictId?: number, item: object, changes: object, version: number }} result
 */
export function sendUpdateResult(res, result) {
  if (result.status === 'locked') {
    return res.status(409).json({ conflict: true, locked: true, conflict_id: result.conflictId });
  }
  if (result.status === 'conflict') {
    return res.status(409).json({
      conflict: true,
      conflict_id: result.conflictId,
      server_version: result.item,
      client_version: { ...result.changes, version: result.version },
    });
  }
  return res.json({ updated: true, version: result.item.version, item: result.item });
}
