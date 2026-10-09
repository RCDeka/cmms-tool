-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 006_staff_requests: staff members submit requests (D46).
-- 1. New role STAFF: SQLite cannot change a CHECK constraint, so `users` and `feedback` are
--    rebuilt (create the new table, copy, drop, rename). The runner turns foreign keys off
--    while a migration runs and checks them before commit (src/db/migrate.js).
-- 2. Free-text location on work orders (staff describe where the problem is), searchable.
-- 3. Comments on work orders, shared by the requester and the maintenance team.

CREATE TABLE users_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name     TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
  first_name    TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
  username      TEXT NOT NULL UNIQUE CHECK (length(username) > 0 AND username = lower(username)),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('STAFF', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN')),
  site          TEXT,
  specialty     TEXT CHECK (specialty IN ('HVAC', 'ELECTRICAL', 'FIRE_SAFETY', 'PLUMBING', 'NETWORK_CABLING', 'SECURITY')),
  power_user    INTEGER NOT NULL DEFAULT 0 CHECK (power_user IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  credentials_changed_at TEXT
) STRICT;

INSERT INTO users_new (id, last_name, first_name, username, password_hash, role, site, specialty,
  power_user, created_at, updated_at, is_active, credentials_changed_at)
SELECT id, last_name, first_name, username, password_hash, role, site, specialty,
  power_user, created_at, updated_at, is_active, credentials_changed_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TABLE feedback_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  message        TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 2000),
  page_path      TEXT NOT NULL CHECK (substr(page_path, 1, 1) = '/' AND length(page_path) <= 500),
  page_title     TEXT NOT NULL CHECK (length(page_title) <= 200),
  viewport_width INTEGER CHECK (viewport_width IS NULL OR viewport_width BETWEEN 1 AND 20000),
  user_id        INTEGER NOT NULL REFERENCES users (id),
  user_role      TEXT NOT NULL CHECK (user_role IN ('STAFF', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN')),
  status         TEXT NOT NULL DEFAULT 'NEW'
                 CHECK (status IN ('NEW', 'PLANNED', 'DONE', 'DECLINED')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     INTEGER REFERENCES users (id)
) STRICT;

INSERT INTO feedback_new (id, message, page_path, page_title, viewport_width, user_id, user_role,
  status, created_at, updated_at, updated_by)
SELECT id, message, page_path, page_title, viewport_width, user_id, user_role,
  status, created_at, updated_at, updated_by
FROM feedback;

DROP TABLE feedback;
ALTER TABLE feedback_new RENAME TO feedback;
CREATE INDEX feedback_created_idx ON feedback (created_at);
CREATE INDEX feedback_status_idx ON feedback (status, created_at);

-- Where the problem is, in the requester's words ("Tower A, floor 12, room 1204").
ALTER TABLE work_orders ADD COLUMN location TEXT;
-- "My requests": the work orders a user created.
CREATE INDEX work_orders_created_by_idx ON work_orders (created_by, created_at);

-- The search index gains the location.
DROP TRIGGER work_orders_fts_insert;
DROP TRIGGER work_orders_fts_delete;
DROP TRIGGER work_orders_fts_update;
DROP TABLE work_orders_fts;

CREATE VIRTUAL TABLE work_orders_fts USING fts5(
  number, title, description, site, work_report, location,
  content = 'work_orders', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER work_orders_fts_insert AFTER INSERT ON work_orders BEGIN
  INSERT INTO work_orders_fts (rowid, number, title, description, site, work_report, location)
  VALUES (new.id, new.number, new.title, new.description, new.site, new.work_report, new.location);
END;

CREATE TRIGGER work_orders_fts_delete AFTER DELETE ON work_orders BEGIN
  INSERT INTO work_orders_fts (work_orders_fts, rowid, number, title, description, site,
    work_report, location)
  VALUES ('delete', old.id, old.number, old.title, old.description, old.site, old.work_report,
    old.location);
END;

CREATE TRIGGER work_orders_fts_update AFTER UPDATE ON work_orders BEGIN
  INSERT INTO work_orders_fts (work_orders_fts, rowid, number, title, description, site,
    work_report, location)
  VALUES ('delete', old.id, old.number, old.title, old.description, old.site, old.work_report,
    old.location);
  INSERT INTO work_orders_fts (rowid, number, title, description, site, work_report, location)
  VALUES (new.id, new.number, new.title, new.description, new.site, new.work_report, new.location);
END;

INSERT INTO work_orders_fts (work_orders_fts) VALUES ('rebuild');

-- Comments are append-only, like the audit log: never edited or deleted.
CREATE TABLE work_order_comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL REFERENCES work_orders (id),
  user_id       INTEGER NOT NULL REFERENCES users (id),
  -- Role when the comment was written (shown as "Requester" / "Maintenance team").
  user_role     TEXT NOT NULL CHECK (user_role IN ('STAFF', 'TECHNICIAN', 'SUPERVISOR', 'ADMIN')),
  body          TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at    TEXT NOT NULL
) STRICT;

CREATE INDEX work_order_comments_work_order_idx ON work_order_comments (work_order_id, created_at);
