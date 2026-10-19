-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 017_sla: service levels (D86, D88, docs/spec-work-order-process.md, Phase 36). Response and
-- resolution targets per priority, the settings (response stop, calendar or business hours),
-- the holidays, and the deadlines kept on each work order (BR-SLA4). Work reported before this
-- migration is not measured (measured_from, BR-SLA1).

CREATE TABLE sla_targets (
  priority         TEXT PRIMARY KEY CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  -- Hours; NULL: no target for that clock.
  response_hours   REAL CHECK (response_hours IS NULL OR (response_hours > 0 AND response_hours <= 10000)),
  resolution_hours REAL CHECK (resolution_hours IS NULL OR (resolution_hours > 0 AND resolution_hours <= 10000)),
  updated_by       INTEGER REFERENCES users (id),
  updated_at       TEXT NOT NULL,
  CHECK (response_hours IS NULL OR resolution_hours IS NULL OR resolution_hours >= response_hours)
) STRICT;

INSERT INTO sla_targets (priority, response_hours, resolution_hours, updated_at) VALUES
  ('URGENT', 1, 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('HIGH', 4, 24, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('NORMAL', 24, 72, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('LOW', 72, 240, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE sla_settings (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  response_stop  TEXT NOT NULL DEFAULT 'START' CHECK (response_stop IN ('START', 'ASSIGNMENT')),
  hours_mode     TEXT NOT NULL DEFAULT 'CALENDAR' CHECK (hours_mode IN ('CALENDAR', 'BUSINESS')),
  -- ISO weekdays, e.g. '1,2,3,4,5'.
  business_days  TEXT NOT NULL DEFAULT '1,2,3,4,5' CHECK (
    length(business_days) BETWEEN 1 AND 13 AND business_days NOT GLOB '*[^1-7,]*'
  ),
  -- In APP_TIMEZONE, from business_start included to business_end excluded.
  business_start TEXT NOT NULL DEFAULT '08:00' CHECK (business_start GLOB '[0-2][0-9]:[0-5][0-9]'),
  business_end   TEXT NOT NULL DEFAULT '18:00' CHECK (business_end GLOB '[0-2][0-9]:[0-5][0-9]'),
  -- BR-SLA1: when this migration ran; not editable.
  measured_from  TEXT NOT NULL,
  -- Covers the targets too (D88).
  version        INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by     INTEGER REFERENCES users (id),
  updated_at     TEXT NOT NULL,
  CHECK (business_start < business_end)
) STRICT;

INSERT INTO sla_settings (id, measured_from, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE sla_holidays (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  day        TEXT NOT NULL UNIQUE CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  name       TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL
) STRICT;

-- The deadlines of each work order, kept by the server (BR-SLA4). sla_paused_at: when the
-- current pausing hold began, NULL when not paused (D90).
ALTER TABLE work_orders ADD COLUMN response_due_at TEXT;
ALTER TABLE work_orders ADD COLUMN resolution_due_at TEXT;
ALTER TABLE work_orders ADD COLUMN response_risk_at TEXT;
ALTER TABLE work_orders ADD COLUMN resolution_risk_at TEXT;
ALTER TABLE work_orders ADD COLUMN sla_paused_at TEXT;
CREATE INDEX work_orders_resolution_due_idx ON work_orders (resolution_due_at);

-- The audit log gains the SLA settings; target and holiday changes are logged on them (D90).
CREATE TABLE audit_log_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('assets', 'work_orders', 'users',
                'maintenance_plans', 'plan_occurrences', 'allocations', 'planning_settings',
                'sla_settings')),
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'CONFLICT', 'RESOLVE')),
  changes     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(changes)),
  note        TEXT CHECK (note IS NULL OR json_valid(note)),
  label       TEXT NOT NULL,
  user_id     INTEGER REFERENCES users (id),
  version     INTEGER,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  edited_at   TEXT
) STRICT;

INSERT INTO audit_log_new (id, entity_type, entity_id, action, changes, note, label, user_id,
  version, at, edited_at)
SELECT id, entity_type, entity_id, action, changes, note, label, user_id, version, at, edited_at
FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, at);
CREATE INDEX audit_log_at_idx ON audit_log (at);
