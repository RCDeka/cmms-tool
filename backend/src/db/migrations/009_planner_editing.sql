-- 009_planner_editing: year planner editing (D48, Phase 18).
-- 1. Blocked weeks: weeks where visits should not take place (a data center change freeze,
--    the summer holidays), for one site or every site. The planner warns, it never refuses
--    (BR-P8).
-- 2. Occurrences get a version: a move or a skip is checked against what the user saw.

CREATE TABLE blocked_weeks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  week       TEXT NOT NULL CHECK (week GLOB '[0-9][0-9][0-9][0-9]-W[0-5][0-9]'),
  -- NULL: every site.
  site       TEXT CHECK (site IS NULL OR length(trim(site)) > 0),
  reason     TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 200),
  created_by INTEGER NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL
) STRICT;

-- One entry per week and site ("every site" counted once too).
CREATE UNIQUE INDEX blocked_weeks_week_site_idx ON blocked_weeks (week, coalesce(site, ''));

ALTER TABLE plan_occurrences ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
