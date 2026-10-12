-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 011_dashboards: personal dashboards of supervisors and admins (D59, Phase 21).
-- Each one holds its widgets in display order and its own filters, as JSON checked by the
-- API against the widget catalogue. Personal preferences: not in the audit log.

CREATE TABLE dashboards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id),
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60 AND name = trim(name)),
  -- Order in the sidebar.
  position   INTEGER NOT NULL,
  -- [{ "key": "by_status", "options": {} }, ...] in display order.
  widgets    TEXT NOT NULL DEFAULT '[]'
             CHECK (json_valid(widgets) AND json_type(widgets) = 'array'),
  -- { "period": 30, "sites": [...], "categories": [...] }
  filters    TEXT NOT NULL DEFAULT '{}'
             CHECK (json_valid(filters) AND json_type(filters) = 'object'),
  version    INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- BR-K2: names are unique per user, ignoring case (the API also compares accented letters).
CREATE UNIQUE INDEX dashboards_name_idx ON dashboards (user_id, name COLLATE NOCASE);
CREATE INDEX dashboards_user_idx ON dashboards (user_id, position);
