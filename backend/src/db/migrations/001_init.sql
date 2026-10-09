-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 001_init: full MVP schema (docs/data-model.md).
-- STRICT tables enforce column types. Enumerated columns use CHECK constraints whose values
-- must match src/rules/enums.js. A NULL passes an `IN (...)` check, so nullable enums need no
-- extra clause. Datetimes are ISO 8601 UTC with milliseconds; dates are YYYY-MM-DD.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name     TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
  first_name    TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
  username      TEXT NOT NULL UNIQUE CHECK (length(username) > 0 AND username = lower(username)),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('TECHNICIAN', 'SUPERVISOR', 'ADMIN')),
  site          TEXT,
  specialty     TEXT CHECK (specialty IN ('HVAC', 'ELECTRICAL', 'FIRE_SAFETY', 'PLUMBING', 'NETWORK_CABLING', 'SECURITY')),
  power_user    INTEGER NOT NULL DEFAULT 0 CHECK (power_user IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE assets (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  code                   TEXT NOT NULL UNIQUE CHECK (length(code) > 0),
  name                   TEXT NOT NULL CHECK (length(trim(name)) > 0),
  site                   TEXT NOT NULL CHECK (length(trim(site)) > 0),
  building               TEXT,
  floor                  TEXT,
  category               TEXT NOT NULL CHECK (category IN ('HVAC', 'ELECTRICAL', 'FIRE_SAFETY', 'PLUMBING', 'NETWORK_CABLING', 'SECURITY')),
  subcategory            TEXT,
  criticality            TEXT NOT NULL CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status                 TEXT NOT NULL CHECK (status IN ('IN_SERVICE', 'BROKEN_DOWN', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE')),
  brand                  TEXT,
  model                  TEXT,
  serial_number          TEXT,
  commissioned_on        TEXT CHECK (commissioned_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  last_serviced_on       TEXT CHECK (last_serviced_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  supplier               TEXT,
  maintenance_contract   INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_contract IN (0, 1)),
  responsible_technician TEXT,
  exact_location         TEXT,
  comment                TEXT,
  version                INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  has_conflict           INTEGER NOT NULL DEFAULT 0 CHECK (has_conflict IN (0, 1)),
  updated_by             INTEGER REFERENCES users (id),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX assets_site_idx ON assets (site);
CREATE INDEX assets_category_idx ON assets (category);
CREATE INDEX assets_status_idx ON assets (status);
CREATE INDEX assets_updated_at_idx ON assets (updated_at);

CREATE TABLE work_orders (
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
  -- BR-W8
  CHECK (due_on IS NULL OR due_on >= created_on),
  CHECK (closed_on IS NULL OR started_on IS NULL OR closed_on >= started_on),
  -- BR-W6: a closed work order has a closing date and a work report. coalesce() is needed:
  -- length(NULL) is NULL, and a CHECK that evaluates to NULL passes.
  CHECK (status <> 'CLOSED' OR (closed_on IS NOT NULL AND coalesce(length(trim(work_report)), 0) > 0))
) STRICT;

CREATE INDEX work_orders_status_idx ON work_orders (status);
CREATE INDEX work_orders_asset_id_idx ON work_orders (asset_id);
CREATE INDEX work_orders_assignee_id_idx ON work_orders (assignee_id);
CREATE INDEX work_orders_created_on_idx ON work_orders (created_on);
CREATE INDEX work_orders_updated_at_idx ON work_orders (updated_at);

CREATE TABLE conflicts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('assets', 'work_orders')),
  entity_id         INTEGER NOT NULL,
  base_version      INTEGER NOT NULL,
  server_version    INTEGER NOT NULL,
  server_snapshot   TEXT NOT NULL CHECK (json_valid(server_snapshot)),
  client_changes    TEXT NOT NULL CHECK (json_valid(client_changes)),
  server_updated_by INTEGER REFERENCES users (id),
  server_updated_at TEXT NOT NULL,
  client_user_id    INTEGER NOT NULL REFERENCES users (id),
  client_edited_at  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  resolution        TEXT CHECK (resolution IN ('A', 'B', 'MERGE')),
  resolved_by       INTEGER REFERENCES users (id),
  resolved_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Resolution fields are set together, and only on resolved conflicts.
  CHECK (
    (status = 'OPEN' AND resolution IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status = 'RESOLVED' AND resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
) STRICT;

-- D4: at most one open conflict per record.
CREATE UNIQUE INDEX conflicts_one_open_per_record_idx
  ON conflicts (entity_type, entity_id) WHERE status = 'OPEN';
CREATE INDEX conflicts_status_idx ON conflicts (status);
