-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 016_work_order_process: the technical end apart from the administrative closing (D86, D87,
-- docs/spec-work-order-process.md, Phase 35). COMPLETED ("Technically done") joins the statuses;
-- a hold has a reason; a supervisor or an admin may waive the work report; the moments of the
-- SLA (reported, first assigned, first started, completed) are kept on the work order. The audit
-- log keeps the client's time of each write (`edited_at`).

ALTER TABLE audit_log ADD COLUMN edited_at TEXT;

DROP TRIGGER work_orders_fts_insert;
DROP TRIGGER work_orders_fts_delete;
DROP TRIGGER work_orders_fts_update;
DROP TABLE work_orders_fts;

CREATE TABLE work_orders_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  number            TEXT NOT NULL UNIQUE CHECK (number GLOB 'WO-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9]'),
  client_id         TEXT UNIQUE,
  type              TEXT NOT NULL CHECK (type IN ('CORRECTIVE', 'PREVENTIVE', 'IMPROVEMENT', 'REGULATORY')),
  status            TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED')),
  priority          TEXT NOT NULL CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  title             TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description       TEXT,
  asset_id          INTEGER REFERENCES assets (id),
  -- The name of the place's site (BR-L7).
  site              TEXT NOT NULL CHECK (length(trim(site)) > 0),
  location_id       INTEGER NOT NULL REFERENCES locations (id),
  place             TEXT NOT NULL DEFAULT '',
  category          TEXT CHECK (category IN ('HVAC', 'ELECTRICAL', 'FIRE_SAFETY', 'PLUMBING', 'NETWORK_CABLING', 'SECURITY')),
  assignee_id       INTEGER REFERENCES users (id),
  supervisor_id     INTEGER REFERENCES users (id),
  created_on        TEXT NOT NULL CHECK (created_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  due_on            TEXT CHECK (due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  started_on        TEXT CHECK (started_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- Date of the technical end (BR-W6); editable like started_on (BR-W7).
  completed_on      TEXT CHECK (completed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- Date of the administrative end.
  closed_on         TEXT CHECK (closed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  estimated_hours   REAL CHECK (estimated_hours >= 0),
  actual_hours      REAL CHECK (actual_hours >= 0),
  work_report       TEXT,
  -- BR-W6: technically done without a work report, by decision of a supervisor or an admin.
  report_waived     INTEGER NOT NULL DEFAULT 0 CHECK (report_waived IN (0, 1)),
  -- BR-W14: why the work order is on hold, and a note.
  hold_reason       TEXT CHECK (hold_reason IN ('WAITING_PARTS', 'WAITING_CONTRACTOR', 'WAITING_ACCESS', 'WAITING_APPROVAL', 'OTHER')),
  hold_note         TEXT CHECK (hold_note IS NULL OR length(trim(hold_note)) BETWEEN 1 AND 500),
  -- Moments of the SLA (BR-W18): the client's edited_at of the write that set them.
  reported_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  first_assigned_at TEXT,
  first_started_at  TEXT,
  completed_at      TEXT,
  created_by        INTEGER NOT NULL REFERENCES users (id),
  version           INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  has_conflict      INTEGER NOT NULL DEFAULT 0 CHECK (has_conflict IN (0, 1)),
  updated_by        INTEGER REFERENCES users (id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- The words about the place ("desk 12-21").
  location          TEXT,
  review_status     TEXT CHECK (
    review_status IS NULL OR (
      review_status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')
      -- BR-R6: a request waiting for review is open and nobody is assigned yet.
      AND (review_status <> 'PENDING' OR (status = 'OPEN' AND assignee_id IS NULL))
      -- BR-R8, BR-R10: a rejected or withdrawn request is cancelled.
      AND (review_status NOT IN ('REJECTED', 'WITHDRAWN') OR status = 'CANCELLED')
    )
  ),
  reviewed_by       INTEGER REFERENCES users (id),
  reviewed_at       TEXT,
  review_note       TEXT,
  plan_id           INTEGER REFERENCES maintenance_plans (id),
  planned_week      TEXT CHECK (planned_week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  -- BR-W8
  CHECK (due_on IS NULL OR due_on >= created_on),
  CHECK (completed_on IS NULL OR started_on IS NULL OR completed_on >= started_on),
  CHECK (closed_on IS NULL OR started_on IS NULL OR closed_on >= started_on),
  CHECK (closed_on IS NULL OR completed_on IS NULL OR closed_on >= completed_on),
  -- BR-W6: technically done (and closed) work orders have their technical end, and a work
  -- report or its waiver. coalesce() is needed: length(NULL) is NULL, and a CHECK that
  -- evaluates to NULL passes.
  CHECK (status NOT IN ('COMPLETED', 'CLOSED') OR (
    completed_on IS NOT NULL AND completed_at IS NOT NULL
    AND (coalesce(length(trim(work_report)), 0) > 0 OR report_waived = 1)
  )),
  CHECK (report_waived = 0 OR status IN ('COMPLETED', 'CLOSED')),
  CHECK (status <> 'CLOSED' OR closed_on IS NOT NULL),
  -- BR-W14: a reason if and only if on hold; a note only while on hold.
  CHECK ((hold_reason IS NOT NULL) = (status = 'ON_HOLD')),
  CHECK (hold_note IS NULL OR status = 'ON_HOLD')
) STRICT;

-- Moments read from the audit log: `at` is the server time (the client's time was not kept).
CREATE TEMP TABLE m_moments (
  id           INTEGER PRIMARY KEY,
  started_at   TEXT,
  assigned_at  TEXT,
  closed_at    TEXT
);
INSERT INTO m_moments
SELECT w.id,
  (SELECT min(l.at) FROM audit_log l WHERE l.entity_type = 'work_orders' AND l.entity_id = w.id
     AND l.action <> 'CONFLICT' AND json_extract(l.changes, '$.status.to') = 'IN_PROGRESS'),
  (SELECT min(l.at) FROM audit_log l WHERE l.entity_type = 'work_orders' AND l.entity_id = w.id
     AND l.action <> 'CONFLICT' AND json_extract(l.changes, '$.assignee_id.to') IS NOT NULL),
  (SELECT max(l.at) FROM audit_log l WHERE l.entity_type = 'work_orders' AND l.entity_id = w.id
     AND l.action <> 'CONFLICT' AND json_extract(l.changes, '$.status.to') = 'CLOSED')
FROM work_orders w;

INSERT INTO work_orders_new (id, number, client_id, type, status, priority, title, description,
  asset_id, site, location_id, place, category, assignee_id, supervisor_id, created_on, due_on,
  started_on, completed_on, closed_on, estimated_hours, actual_hours, work_report, report_waived,
  hold_reason, hold_note, reported_at, first_assigned_at, first_started_at, completed_at,
  created_by, version, has_conflict, updated_by, created_at, updated_at, location, review_status,
  reviewed_by, reviewed_at, review_note, plan_id, planned_week)
SELECT w.id, w.number, w.client_id, w.type, w.status, w.priority, w.title, w.description,
  w.asset_id, w.site, w.location_id, w.place, w.category, w.assignee_id, w.supervisor_id,
  w.created_on, w.due_on, w.started_on,
  -- A closed work order was technically done when it was closed.
  CASE WHEN w.status = 'CLOSED' THEN w.closed_on END,
  w.closed_on, w.estimated_hours, w.actual_hours, w.work_report,
  -- BR-W6 was checked in code only: a closed one without a report has it waived.
  CASE WHEN w.status = 'CLOSED' AND coalesce(length(trim(w.work_report)), 0) = 0 THEN 1 ELSE 0 END,
  CASE WHEN w.status = 'ON_HOLD' THEN 'OTHER' END,
  NULL,
  w.created_at,
  coalesce(m.assigned_at, CASE WHEN w.assignee_id IS NOT NULL THEN w.created_at END),
  m.started_at,
  -- The last change to CLOSED, else noon of the closing day (SQL has no time zone: noon UTC
  -- keeps the closing day in every time zone of the estate, D89).
  CASE WHEN w.status = 'CLOSED' THEN coalesce(m.closed_at, w.closed_on || 'T12:00:00.000Z') END,
  w.created_by, w.version, w.has_conflict, w.updated_by, w.created_at, w.updated_at, w.location,
  w.review_status, w.reviewed_by, w.reviewed_at, w.review_note, w.plan_id, w.planned_week
FROM work_orders w
JOIN m_moments m ON m.id = w.id;

DROP TABLE work_orders;
ALTER TABLE work_orders_new RENAME TO work_orders;
DROP TABLE m_moments;

CREATE INDEX work_orders_status_idx ON work_orders (status);
CREATE INDEX work_orders_asset_id_idx ON work_orders (asset_id);
CREATE INDEX work_orders_location_idx ON work_orders (location_id);
CREATE INDEX work_orders_assignee_id_idx ON work_orders (assignee_id);
CREATE INDEX work_orders_created_on_idx ON work_orders (created_on);
CREATE INDEX work_orders_completed_on_idx ON work_orders (completed_on);
CREATE INDEX work_orders_updated_at_idx ON work_orders (updated_at);
CREATE INDEX work_orders_created_by_idx ON work_orders (created_by, created_at);
CREATE INDEX work_orders_to_review_idx ON work_orders (review_status) WHERE review_status = 'PENDING';
CREATE INDEX work_orders_plan_id_idx ON work_orders (plan_id);
CREATE INDEX work_orders_planned_week_idx ON work_orders (planned_week);

CREATE VIRTUAL TABLE work_orders_fts USING fts5(
  number, title, description, site, work_report, location, place,
  content = 'work_orders', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER work_orders_fts_insert AFTER INSERT ON work_orders BEGIN
  INSERT INTO work_orders_fts (rowid, number, title, description, site, work_report, location,
    place)
  VALUES (new.id, new.number, new.title, new.description, new.site, new.work_report,
    new.location, new.place);
END;

CREATE TRIGGER work_orders_fts_delete AFTER DELETE ON work_orders BEGIN
  INSERT INTO work_orders_fts (work_orders_fts, rowid, number, title, description, site,
    work_report, location, place)
  VALUES ('delete', old.id, old.number, old.title, old.description, old.site, old.work_report,
    old.location, old.place);
END;

CREATE TRIGGER work_orders_fts_update AFTER UPDATE ON work_orders BEGIN
  INSERT INTO work_orders_fts (work_orders_fts, rowid, number, title, description, site,
    work_report, location, place)
  VALUES ('delete', old.id, old.number, old.title, old.description, old.site, old.work_report,
    old.location, old.place);
  INSERT INTO work_orders_fts (rowid, number, title, description, site, work_report, location,
    place)
  VALUES (new.id, new.number, new.title, new.description, new.site, new.work_report,
    new.location, new.place);
END;

INSERT INTO work_orders_fts (work_orders_fts) VALUES ('rebuild');
