-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 013_request_withdrawal: a requester cancels their own request until work starts (D79).
-- The review status gains WITHDRAWN (cancelled by the requester, before or after the review).
-- SQLite cannot change a CHECK constraint, so `work_orders` is rebuilt (create the new table,
-- copy, drop, rename) with the same columns in the same order; its indexes and search
-- triggers are dropped with the old table and created again. The search index itself keeps
-- its content: the ids do not change.

CREATE TABLE work_orders_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  number          TEXT NOT NULL UNIQUE CHECK (number GLOB 'WO-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9]'),
  client_id       TEXT UNIQUE,
  type            TEXT NOT NULL CHECK (type IN ('CORRECTIVE', 'PREVENTIVE', 'IMPROVEMENT', 'REGULATORY')),
  status          TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED')),
  priority        TEXT NOT NULL CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  title           TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description     TEXT,
  asset_id        INTEGER REFERENCES assets (id),
  site            TEXT NOT NULL CHECK (length(trim(site)) > 0),
  category        TEXT CHECK (category IN ('HVAC', 'ELECTRICAL', 'FIRE_SAFETY', 'PLUMBING', 'NETWORK_CABLING', 'SECURITY')),
  assignee_id     INTEGER REFERENCES users (id),
  supervisor_id   INTEGER REFERENCES users (id),
  created_on      TEXT NOT NULL CHECK (created_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  due_on          TEXT CHECK (due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  started_on      TEXT CHECK (started_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  closed_on       TEXT CHECK (closed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  estimated_hours REAL CHECK (estimated_hours >= 0),
  actual_hours    REAL CHECK (actual_hours >= 0),
  work_report     TEXT,
  created_by      INTEGER NOT NULL REFERENCES users (id),
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  has_conflict    INTEGER NOT NULL DEFAULT 0 CHECK (has_conflict IN (0, 1)),
  updated_by      INTEGER REFERENCES users (id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  location        TEXT,
  review_status   TEXT CHECK (
    review_status IS NULL OR (
      review_status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')
      -- BR-R6: a request waiting for review is open and nobody is assigned yet.
      AND (review_status <> 'PENDING' OR (status = 'OPEN' AND assignee_id IS NULL))
      -- BR-R8, BR-R10: a rejected or withdrawn request is cancelled.
      AND (review_status NOT IN ('REJECTED', 'WITHDRAWN') OR status = 'CANCELLED')
    )
  ),
  reviewed_by     INTEGER REFERENCES users (id),
  reviewed_at     TEXT,
  review_note     TEXT,
  plan_id         INTEGER REFERENCES maintenance_plans (id),
  planned_week    TEXT CHECK (planned_week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  -- BR-W8
  CHECK (due_on IS NULL OR due_on >= created_on),
  CHECK (closed_on IS NULL OR started_on IS NULL OR closed_on >= started_on),
  -- BR-W6: a closed work order has a closing date and a work report. coalesce() is needed:
  -- length(NULL) is NULL, and a CHECK that evaluates to NULL passes.
  CHECK (status <> 'CLOSED' OR (closed_on IS NOT NULL AND coalesce(length(trim(work_report)), 0) > 0))
) STRICT;

INSERT INTO work_orders_new (id, number, client_id, type, status, priority, title, description,
  asset_id, site, category, assignee_id, supervisor_id, created_on, due_on, started_on,
  closed_on, estimated_hours, actual_hours, work_report, created_by, version, has_conflict,
  updated_by, created_at, updated_at, location, review_status, reviewed_by, reviewed_at,
  review_note, plan_id, planned_week)
SELECT id, number, client_id, type, status, priority, title, description,
  asset_id, site, category, assignee_id, supervisor_id, created_on, due_on, started_on,
  closed_on, estimated_hours, actual_hours, work_report, created_by, version, has_conflict,
  updated_by, created_at, updated_at, location, review_status, reviewed_by, reviewed_at,
  review_note, plan_id, planned_week
FROM work_orders;

DROP TABLE work_orders;
ALTER TABLE work_orders_new RENAME TO work_orders;

CREATE INDEX work_orders_status_idx ON work_orders (status);
CREATE INDEX work_orders_asset_id_idx ON work_orders (asset_id);
CREATE INDEX work_orders_assignee_id_idx ON work_orders (assignee_id);
CREATE INDEX work_orders_created_on_idx ON work_orders (created_on);
CREATE INDEX work_orders_updated_at_idx ON work_orders (updated_at);
CREATE INDEX work_orders_created_by_idx ON work_orders (created_by, created_at);
CREATE INDEX work_orders_to_review_idx ON work_orders (review_status) WHERE review_status = 'PENDING';
CREATE INDEX work_orders_plan_id_idx ON work_orders (plan_id);
CREATE INDEX work_orders_planned_week_idx ON work_orders (planned_week);

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
