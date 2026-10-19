// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  ASSET_STATUSES,
  CATEGORIES,
  CRITICALITIES,
  HOLD_REASONS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from '../rules/enums.js';

/**
 * @param {import('better-sqlite3').Database} _db
 * @param {object} options
 * @param {boolean} options.assistant a model is configured for the assistant (D66)
 * @param {ReturnType<import('./locations.js').createLocationService>} options.locations
 */
export function createReferenceDataService(_db, { assistant, locations }) {
  return {
    /** Lists for filters and dropdowns; sites come from the location tree (D82), the rest from the enums. */
    get() {
      return {
        sites: locations.siteNames(),
        categories: CATEGORIES,
        criticalities: CRITICALITIES,
        asset_statuses: ASSET_STATUSES,
        work_order_types: WORK_ORDER_TYPES,
        work_order_statuses: WORK_ORDER_STATUSES,
        work_order_priorities: WORK_ORDER_PRIORITIES,
        hold_reasons: HOLD_REASONS,
        assistant,
      };
    },
  };
}
