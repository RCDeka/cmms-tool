-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 010_week_scheduler: the week scheduler and My week (D48, Phase 19).
-- 1. Allocations: blocks of hours of one person on one day, on a work order (WORK) or for
--    travel, preparation or other time. No clock time, except a locked appointment.
-- 2. Capacity overrides: a person's hours on one day when they differ from the default
--    (leave, part time, training, weekend work).
-- 3. Schedule weeks: Saturday and Sunday opened per week.
-- Allocations are logged in audit_log (its CHECK already accepts them since 008).

CREATE TABLE allocations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN ('WORK', 'TRAVEL', 'PREPARATION', 'OTHER')),
  -- Required for WORK, absent otherwise.
  work_order_id INTEGER REFERENCES work_orders (id),
  -- An active technician or supervisor (checked by the API).
  technician_id INTEGER NOT NULL REFERENCES users (id),
  day           TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- Half hours (P4). The longest block is a planning setting (3.5 h by default, at most 8 h).
  hours         REAL NOT NULL CHECK (
    hours >= 0.5 AND hours <= 8 AND hours * 2 = round(hours * 2)
  ),
  -- Appointment (P6): a start time on the half hour, and who locked it.
  locked_start  TEXT CHECK (locked_start GLOB '[0-2][0-9]:[03]0'),
  locked_by     INTEGER REFERENCES users (id),
  -- The person's own order in the day (BR-S7).
  position      INTEGER,
  note          TEXT CHECK (note IS NULL OR length(note) <= 500),
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by    INTEGER NOT NULL REFERENCES users (id),
  updated_by    INTEGER REFERENCES users (id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK ((kind = 'WORK') = (work_order_id IS NOT NULL)),
  CHECK ((locked_start IS NULL) = (locked_by IS NULL)),
  CHECK (locked_start IS NULL OR kind = 'WORK')
) STRICT;

CREATE INDEX allocations_technician_day_idx ON allocations (technician_id, day);
CREATE INDEX allocations_work_order_idx ON allocations (work_order_id);
CREATE INDEX allocations_day_idx ON allocations (day);

-- Without an override: the daily hours of the settings Monday to Friday, 0 on weekends.
CREATE TABLE capacity_overrides (
  technician_id INTEGER NOT NULL REFERENCES users (id),
  day           TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- 0 = absent.
  hours         REAL NOT NULL CHECK (hours >= 0 AND hours <= 12 AND hours * 2 = round(hours * 2)),
  reason        TEXT NOT NULL CHECK (reason IN ('LEAVE', 'PART_TIME', 'TRAINING', 'WEEKEND', 'OTHER')),
  note          TEXT CHECK (note IS NULL OR length(note) <= 200),
  updated_by    INTEGER NOT NULL REFERENCES users (id),
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (technician_id, day)
) STRICT;

CREATE INDEX capacity_overrides_day_idx ON capacity_overrides (day);

-- Weekend days opened for one week (P11). No row: Monday to Friday only.
CREATE TABLE schedule_weeks (
  week          TEXT PRIMARY KEY CHECK (week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  saturday_open INTEGER NOT NULL DEFAULT 0 CHECK (saturday_open IN (0, 1)),
  sunday_open   INTEGER NOT NULL DEFAULT 0 CHECK (sunday_open IN (0, 1)),
  updated_by    INTEGER NOT NULL REFERENCES users (id),
  updated_at    TEXT NOT NULL
) STRICT;
