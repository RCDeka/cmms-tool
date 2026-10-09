// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  ASSET_STATUSES,
  CATEGORIES,
  CRITICALITIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from '../rules/enums.js';

/** @param {import('better-sqlite3').Database} db */
export function createReferenceDataService(db) {
  const sites = db
    .prepare('SELECT site FROM assets UNION SELECT site FROM work_orders ORDER BY site')
    .pluck();

  return {
    /** Lists for filters and dropdowns; sites come from the data, the rest from the enums. */
    get() {
      return {
        sites: sites.all(),
        categories: CATEGORIES,
        criticalities: CRITICALITIES,
        asset_statuses: ASSET_STATUSES,
        work_order_types: WORK_ORDER_TYPES,
        work_order_statuses: WORK_ORDER_STATUSES,
        work_order_priorities: WORK_ORDER_PRIORITIES,
      };
    },
  };
}
