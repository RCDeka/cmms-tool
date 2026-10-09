-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 005_feedback: improvement ideas sent from any page of the tool (D40).

CREATE TABLE feedback (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  message        TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 2000),
  -- Where the user was: path and query of the page, and its title.
  page_path      TEXT NOT NULL CHECK (substr(page_path, 1, 1) = '/' AND length(page_path) <= 500),
  page_title     TEXT NOT NULL CHECK (length(page_title) <= 200),
  viewport_width INTEGER CHECK (viewport_width IS NULL OR viewport_width BETWEEN 1 AND 20000),
  user_id        INTEGER NOT NULL REFERENCES users (id),
  -- Role when the idea was sent (roles can change later).
  user_role      TEXT NOT NULL CHECK (user_role IN ('TECHNICIAN', 'SUPERVISOR', 'ADMIN')),
  status         TEXT NOT NULL DEFAULT 'NEW'
                 CHECK (status IN ('NEW', 'PLANNED', 'DONE', 'DECLINED')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     INTEGER REFERENCES users (id)
) STRICT;

CREATE INDEX feedback_created_idx ON feedback (created_at);
CREATE INDEX feedback_status_idx ON feedback (status, created_at);
