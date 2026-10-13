// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Dashboard widgets switched on or off by the administrators (D65). A widget without a row is
// on. Not in the audit log: the row keeps who changed it last and when.
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { fieldErrors } from '../middleware/validate.js';
import { WIDGET_KEYS, widgetAvailable } from '../rules/dashboards.js';
import { userRef, userRefColumns } from './mappers.js';

const updateSchema = z.strictObject({ enabled: z.boolean() });

/** @param {import('better-sqlite3').Database} db */
export function createWidgetSettingsService(db) {
  const disabledKeys = db.prepare('SELECT key FROM widget_settings WHERE enabled = 0').pluck();
  const all = db.prepare(
    `SELECT s.key, s.enabled, s.updated_at, ${userRefColumns('ub')} FROM widget_settings s
     LEFT JOIN users ub ON ub.id = s.updated_by`,
  );
  const upsert = db.prepare(
    `INSERT INTO widget_settings (key, enabled, updated_by, updated_at)
     VALUES (@key, @enabled, @user_id, @now)
     ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  );

  /** Keys switched off; unknown keys (a widget since removed) are left out. */
  const disabled = () => new Set(disabledKeys.all().filter((key) => WIDGET_KEYS.includes(key)));

  /** One widget's setting, in catalogue shape. */
  const toItem = (key, row) => ({
    key,
    enabled: row ? row.enabled === 1 : true,
    updated_by: row ? userRef(row, 'ub') : null,
    updated_at: row?.updated_at ?? null,
  });

  /** GET /api/dashboards/widgets: every widget of the catalogue, in its order. */
  const list = () => {
    const rows = new Map(all.all().map((r) => [r.key, r]));
    return { items: WIDGET_KEYS.map((key) => toItem(key, rows.get(key))) };
  };

  return {
    disabled,
    list,

    /** 403 when the widget is switched off and the user is not an administrator. */
    assertAvailable(key, user) {
      if (!widgetAvailable(key, user.role, disabled())) {
        throw new HttpError(403, 'This widget is switched off by an administrator', {
          rule: 'D65',
        });
      }
    },

    /** PUT /api/dashboards/widgets/:key (administrators). */
    update(key, body, user, { now }) {
      const result = updateSchema.safeParse(body ?? {});
      if (!result.success) throw new HttpError(400, 'Invalid body', fieldErrors(result.error));
      upsert.run({
        key,
        enabled: result.data.enabled ? 1 : 0,
        user_id: user.id,
        now: now.toISOString(),
      });
      return list().items.find((item) => item.key === key);
    },
  };
}
