-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 002_audit_log: who changed what and when (docs/data-model.md → audit_log).
-- Rows are append-only: the application never updates or deletes them.

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('assets', 'work_orders', 'users')),
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'CONFLICT', 'RESOLVE')),
  -- {"field": {"from": old, "to": new}, ...}: API values (booleans as true/false).
  changes     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(changes)),
  -- Extra facts, e.g. {"conflict_id": 7, "choice": "MERGE"}.
  note        TEXT CHECK (note IS NULL OR json_valid(note)),
  -- Label of the record at the time (kept for deleted records).
  label       TEXT NOT NULL,
  user_id     INTEGER REFERENCES users (id),
  version     INTEGER,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, at);
CREATE INDEX audit_log_at_idx ON audit_log (at);
