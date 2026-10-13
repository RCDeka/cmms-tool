-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 012_widget_settings: administrators switch dashboard widgets on or off for supervisors
-- (D65), to hide widgets still in development or not working. A widget without a row is on;
-- a new widget can ship switched off with a row (enabled = 0, updated_by NULL) in its own
-- migration. The key is checked by the API against the widget catalogue.

CREATE TABLE widget_settings (
  key        TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 60),
  enabled    INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_by INTEGER REFERENCES users (id),
  updated_at TEXT
) STRICT;
