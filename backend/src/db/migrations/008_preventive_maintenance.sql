-- 008_preventive_maintenance: maintenance plans and the year planner (D48, Phase 17).
-- 1. Maintenance plans and their occurrences (one visit of a plan in an ISO week).
-- 2. Work orders released from a plan keep the link and the week they are planned in.
-- 3. Planning settings (one row), managed by the administrators.
-- 4. The audit log accepts the new records: SQLite cannot change a CHECK, so it is rebuilt.
-- Weeks are ISO weeks written 'YYYY-Www'. Tables of the week scheduler (allocations, capacity
-- overrides, open weekends) and blocked weeks come with their own phases.

CREATE TABLE maintenance_plans (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL UNIQUE CHECK (code GLOB 'PM-[0-9][0-9][0-9][0-9]*'),
  title            TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description      TEXT CHECK (description IS NULL OR length(description) <= 4000),
  -- Work order type of the visits.
  type             TEXT NOT NULL CHECK (type IN ('PREVENTIVE', 'REGULATORY')),
  category         TEXT NOT NULL CHECK (category IN ('HVAC', 'ELECTRICAL', 'FIRE_SAFETY', 'PLUMBING', 'NETWORK_CABLING', 'SECURITY')),
  asset_id         INTEGER REFERENCES assets (id),
  -- Follow the asset when there is one (BR-P9).
  site             TEXT NOT NULL CHECK (length(trim(site)) > 0),
  building         TEXT,
  location         TEXT CHECK (location IS NULL OR length(location) <= 200),
  -- Per visit, in half hours.
  estimated_hours  REAL NOT NULL CHECK (
    estimated_hours > 0 AND estimated_hours <= 200 AND estimated_hours * 2 = round(estimated_hours * 2)
  ),
  frequency_weeks  INTEGER NOT NULL CHECK (frequency_weeks BETWEEN 1 AND 104),
  -- First occurrence; the series is anchor + k × frequency (BR-P1).
  anchor_week      TEXT NOT NULL CHECK (anchor_week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  -- Last week (contract end); open-ended when NULL. The API keeps it after the anchor.
  end_week         TEXT CHECK (end_week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  schedule_mode    TEXT NOT NULL DEFAULT 'FIXED' CHECK (schedule_mode IN ('FIXED', 'FLOATING')),
  tolerance_weeks  INTEGER NOT NULL CHECK (tolerance_weeks BETWEEN 0 AND 8),
  -- Allowed season, in week numbers; may wrap over the new year (45 → 10).
  season_from_week INTEGER CHECK (season_from_week BETWEEN 1 AND 53),
  season_to_week   INTEGER CHECK (season_to_week BETWEEN 1 AND 53),
  performed_by     TEXT NOT NULL DEFAULT 'INTERNAL' CHECK (performed_by IN ('INTERNAL', 'CONTRACTOR')),
  supplier         TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by       INTEGER NOT NULL REFERENCES users (id),
  updated_by       INTEGER REFERENCES users (id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK ((season_from_week IS NULL) = (season_to_week IS NULL))
) STRICT;

CREATE INDEX maintenance_plans_site_idx ON maintenance_plans (site, building);
CREATE INDEX maintenance_plans_category_idx ON maintenance_plans (category);
CREATE INDEX maintenance_plans_active_idx ON maintenance_plans (is_active);

CREATE TABLE plan_occurrences (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id       INTEGER NOT NULL REFERENCES maintenance_plans (id),
  -- Week given by the series.
  due_week      TEXT NOT NULL CHECK (due_week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  -- Week it is planned in: the due week unless moved.
  week          TEXT NOT NULL CHECK (week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  status        TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'RELEASED', 'SKIPPED')),
  -- Set by the release; UNIQUE makes a second release impossible (BR-P6). A visit skipped by
  -- cancelling its work order keeps the link (BR-P7).
  work_order_id INTEGER UNIQUE REFERENCES work_orders (id),
  skip_reason   TEXT,
  moved_by      INTEGER REFERENCES users (id),
  moved_at      TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (plan_id, due_week),
  CHECK (status <> 'RELEASED' OR work_order_id IS NOT NULL),
  CHECK (status <> 'PLANNED' OR work_order_id IS NULL),
  CHECK (status <> 'SKIPPED' OR coalesce(length(trim(skip_reason)), 0) > 0)
) STRICT;

CREATE INDEX plan_occurrences_week_idx ON plan_occurrences (week);
CREATE INDEX plan_occurrences_plan_week_idx ON plan_occurrences (plan_id, week);

-- The plan of a preventive visit, and the week the work is planned in.
ALTER TABLE work_orders ADD COLUMN plan_id INTEGER REFERENCES maintenance_plans (id);
ALTER TABLE work_orders ADD COLUMN planned_week TEXT
  CHECK (planned_week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]');
CREATE INDEX work_orders_plan_id_idx ON work_orders (plan_id);
CREATE INDEX work_orders_planned_week_idx ON work_orders (planned_week);

-- One row (id = 1), edited by the administrators (P16).
CREATE TABLE planning_settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  daily_hours         REAL NOT NULL DEFAULT 7 CHECK (
    daily_hours BETWEEN 0.5 AND 12 AND daily_hours * 2 = round(daily_hours * 2)
  ),
  -- Share of each week kept free for breakdowns and staff requests.
  reserve_percent     INTEGER NOT NULL DEFAULT 30 CHECK (reserve_percent BETWEEN 0 AND 80),
  release_weeks_ahead INTEGER NOT NULL DEFAULT 4 CHECK (release_weeks_ahead BETWEEN 1 AND 12),
  max_block_hours     REAL NOT NULL DEFAULT 3.5 CHECK (
    max_block_hours BETWEEN 0.5 AND 8 AND max_block_hours * 2 = round(max_block_hours * 2)
  ),
  version             INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by          INTEGER REFERENCES users (id),
  updated_at          TEXT NOT NULL
) STRICT;

INSERT INTO planning_settings (id, updated_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- The audit log gains the planning records.
CREATE TABLE audit_log_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('assets', 'work_orders', 'users',
                'maintenance_plans', 'plan_occurrences', 'allocations', 'planning_settings')),
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'CONFLICT', 'RESOLVE')),
  changes     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(changes)),
  note        TEXT CHECK (note IS NULL OR json_valid(note)),
  label       TEXT NOT NULL,
  user_id     INTEGER REFERENCES users (id),
  version     INTEGER,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO audit_log_new (id, entity_type, entity_id, action, changes, note, label, user_id, version, at)
SELECT id, entity_type, entity_id, action, changes, note, label, user_id, version, at FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, at);
CREATE INDEX audit_log_at_idx ON audit_log (at);
