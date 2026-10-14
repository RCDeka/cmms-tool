-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 014_rooms: the room list staff pick from when they send a request (D81). Supervisors and
-- admins keep it up to date; rooms are deactivated, never deleted, so the work orders that
-- name one keep it. A room's site is set at creation and never changes (BR-RM2).

CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site       TEXT NOT NULL CHECK (length(trim(site)) BETWEEN 1 AND 200),
  building   TEXT NOT NULL CHECK (length(trim(building)) BETWEEN 1 AND 100),
  floor      TEXT NOT NULL CHECK (length(trim(floor)) BETWEEN 1 AND 50),
  name       TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by INTEGER REFERENCES users (id),
  updated_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- One room of a name per floor of a building, whatever the case (BR-RM1).
CREATE UNIQUE INDEX rooms_place_idx
  ON rooms (site, building COLLATE NOCASE, floor COLLATE NOCASE, name COLLATE NOCASE);

-- The room a staff request was sent from; NULL when none was picked ("Not in the list").
ALTER TABLE work_orders ADD COLUMN room_id INTEGER REFERENCES rooms (id);
CREATE INDEX work_orders_room_idx ON work_orders (room_id) WHERE room_id IS NOT NULL;
