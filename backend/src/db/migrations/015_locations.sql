-- SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- 015_locations: the location tree (D82, docs/spec-locations.md, Phase 32). Places of any level
-- type, under one site each, replace the building, floor and room columns: assets, work orders
-- and plans point to one place (location_id) and keep their words about it (exact_location,
-- location). `site` stays, the name of the place's site. `place` is the path below the site
-- ("Tower A › B1 › Plant room 2", empty for the site itself), kept by the server so lists and
-- the search need no walk up the tree. Today's sites, buildings, floors and rooms become places.

CREATE TABLE level_types (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 50),
  -- The name used in asset code patterns ({BUILDING}, Phase 33).
  token            TEXT NOT NULL UNIQUE CHECK (
    length(token) BETWEEN 1 AND 20 AND token GLOB '[A-Z]*' AND token NOT GLOB '*[^A-Z0-9_]*'
  ),
  offered_to_staff INTEGER NOT NULL DEFAULT 0 CHECK (offered_to_staff IN (0, 1)),
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by       INTEGER REFERENCES users (id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  -- The site type (id 1) is always in use.
  CHECK (id <> 1 OR (token = 'SITE' AND is_active = 1))
) STRICT;

CREATE UNIQUE INDEX level_types_name_idx ON level_types (name COLLATE NOCASE);

INSERT INTO level_types (id, name, token, offered_to_staff, created_at, updated_at) VALUES
  (1, 'Site', 'SITE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (2, 'Building', 'BUILDING', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (3, 'Floor', 'FLOOR', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  (4, 'Room', 'ROOM', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE locations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id     INTEGER REFERENCES locations (id),
  -- The place's site: itself for a site, so a site and everything below it is one lookup.
  site_id       INTEGER NOT NULL REFERENCES locations (id),
  level_type_id INTEGER NOT NULL REFERENCES level_types (id),
  -- 100 characters through the API; site names of older data may be longer.
  name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200 AND instr(name, ' › ') = 0),
  code          TEXT CHECK (code IS NULL OR (length(code) BETWEEN 1 AND 10 AND code NOT GLOB '*[^A-Z0-9]*')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by    INTEGER REFERENCES users (id),
  updated_by    INTEGER REFERENCES users (id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  -- BR-L1: a site has no parent and is its own site; nothing else is a site.
  CHECK ((parent_id IS NULL) = (level_type_id = 1)),
  CHECK (parent_id IS NOT NULL OR site_id = id),
  CHECK (parent_id IS NULL OR site_id <> id)
) STRICT;

CREATE INDEX locations_parent_idx ON locations (parent_id);
CREATE INDEX locations_site_idx ON locations (site_id);
-- BR-L2: names and codes unique among siblings (sites among sites), names whatever the case.
CREATE UNIQUE INDEX locations_name_idx ON locations (coalesce(parent_id, 0), name COLLATE NOCASE);
CREATE UNIQUE INDEX locations_code_idx ON locations (coalesce(parent_id, 0), code)
  WHERE code IS NOT NULL;

-- Today's places: every site, building and floor named by the data.
CREATE TEMP TABLE m_places (site TEXT NOT NULL, building TEXT, floor TEXT);
INSERT INTO m_places SELECT site, nullif(trim(building), ''), nullif(trim(floor), '') FROM assets;
INSERT INTO m_places SELECT site, nullif(trim(building), ''), NULL FROM maintenance_plans;
INSERT INTO m_places SELECT site, trim(building), trim(floor) FROM rooms;
INSERT INTO m_places SELECT site, NULL, NULL FROM work_orders;
INSERT INTO m_places SELECT site, NULL, NULL FROM users WHERE trim(coalesce(site, '')) <> '';
INSERT INTO m_places SELECT site, NULL, NULL FROM blocked_weeks WHERE site IS NOT NULL;

-- Sites, numbered by name; a site is its own site (explicit ids for the CHECK).
INSERT INTO locations (id, parent_id, site_id, level_type_id, name, created_at, updated_at)
SELECT row_number() OVER (ORDER BY name), NULL, row_number() OVER (ORDER BY name), 1, name,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (SELECT min(site) AS name FROM m_places GROUP BY site COLLATE NOCASE);

INSERT INTO locations (parent_id, site_id, level_type_id, name, created_at, updated_at)
SELECT s.id, s.id, 2, min(p.building),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM m_places p JOIN locations s ON s.parent_id IS NULL AND s.name = p.site COLLATE NOCASE
WHERE p.building IS NOT NULL
GROUP BY s.id, p.building COLLATE NOCASE
ORDER BY s.id, min(p.building);

-- Floors under their building, or under the site when no building was given.
INSERT INTO locations (parent_id, site_id, level_type_id, name, created_at, updated_at)
SELECT coalesce(b.id, s.id), s.id, 3, min(p.floor),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM m_places p
JOIN locations s ON s.parent_id IS NULL AND s.name = p.site COLLATE NOCASE
LEFT JOIN locations b ON b.parent_id = s.id AND b.level_type_id = 2
  AND b.name = p.building COLLATE NOCASE
WHERE p.floor IS NOT NULL
GROUP BY s.id, b.id, p.floor COLLATE NOCASE
ORDER BY s.id, b.id, min(p.floor);

-- Where each (site, building, floor) of the data now is.
CREATE TEMP TABLE m_map (site TEXT NOT NULL, building TEXT, floor TEXT, location_id INTEGER NOT NULL);
INSERT INTO m_map
SELECT DISTINCT p.site, p.building, p.floor, coalesce(f.id, b.id, s.id)
FROM m_places p
JOIN locations s ON s.parent_id IS NULL AND s.name = p.site COLLATE NOCASE
LEFT JOIN locations b ON b.parent_id = s.id AND b.level_type_id = 2
  AND b.name = p.building COLLATE NOCASE
LEFT JOIN locations f ON f.parent_id = coalesce(b.id, s.id) AND f.level_type_id = 3
  AND f.name = p.floor COLLATE NOCASE;
CREATE INDEX temp.m_map_idx ON m_map (site, building, floor);

-- Rooms under their floor, as they were (in use, author, dates).
INSERT INTO locations (parent_id, site_id, level_type_id, name, is_active, created_by, updated_by,
  created_at, updated_at)
SELECT m.location_id, l.site_id, 4, r.name, r.is_active, r.created_by, r.updated_by, r.created_at,
  r.updated_at
FROM rooms r
JOIN m_map m ON m.site = r.site AND m.building IS trim(r.building) AND m.floor IS trim(r.floor)
JOIN locations l ON l.id = m.location_id
ORDER BY r.id;

CREATE TEMP TABLE m_rooms (room_id INTEGER PRIMARY KEY, location_id INTEGER NOT NULL);
INSERT INTO m_rooms
SELECT r.id, l.id
FROM rooms r
JOIN m_map m ON m.site = r.site AND m.building IS trim(r.building) AND m.floor IS trim(r.floor)
JOIN locations l ON l.parent_id = m.location_id AND l.level_type_id = 4
  AND l.name = r.name COLLATE NOCASE;

-- The path below the site of every place.
CREATE TEMP TABLE m_paths (id INTEGER PRIMARY KEY, site TEXT NOT NULL, place TEXT NOT NULL);
INSERT INTO m_paths
WITH RECURSIVE p (id, site, place) AS (
  SELECT id, name, '' FROM locations WHERE parent_id IS NULL
  UNION ALL
  SELECT l.id, p.site, CASE WHEN p.place = '' THEN l.name ELSE p.place || ' › ' || l.name END
  FROM locations l JOIN p ON l.parent_id = p.id
)
SELECT id, site, place FROM p;

-- assets: building and floor become the place; exact_location stays the words about it.
DROP TRIGGER assets_fts_insert;
DROP TRIGGER assets_fts_delete;
DROP TRIGGER assets_fts_update;
DROP TABLE assets_fts;

CREATE TABLE assets_new (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  code                   TEXT NOT NULL UNIQUE CHECK (length(code) > 0),
  name                   TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- The name of the place's site (BR-L7).
  site                   TEXT NOT NULL CHECK (length(trim(site)) > 0),
  location_id            INTEGER NOT NULL REFERENCES locations (id),
  place                  TEXT NOT NULL DEFAULT '',
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

INSERT INTO assets_new (id, code, name, site, location_id, place, category, subcategory,
  criticality, status, brand, model, serial_number, commissioned_on, last_serviced_on, supplier,
  maintenance_contract, responsible_technician, exact_location, comment, version, has_conflict,
  updated_by, created_at, updated_at)
SELECT a.id, a.code, a.name, mp.site, m.location_id, mp.place, a.category, a.subcategory,
  a.criticality, a.status, a.brand, a.model, a.serial_number, a.commissioned_on,
  a.last_serviced_on, a.supplier, a.maintenance_contract, a.responsible_technician,
  a.exact_location, a.comment, a.version, a.has_conflict, a.updated_by, a.created_at,
  a.updated_at
FROM assets a
JOIN m_map m ON m.site = a.site AND m.building IS nullif(trim(a.building), '')
  AND m.floor IS nullif(trim(a.floor), '')
JOIN m_paths mp ON mp.id = m.location_id;

DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;

CREATE INDEX assets_site_idx ON assets (site);
CREATE INDEX assets_location_idx ON assets (location_id);
CREATE INDEX assets_category_idx ON assets (category);
CREATE INDEX assets_status_idx ON assets (status);
CREATE INDEX assets_updated_at_idx ON assets (updated_at);

CREATE VIRTUAL TABLE assets_fts USING fts5(
  code, name, site, place, subcategory, brand, model, serial_number, supplier,
  exact_location, comment,
  content = 'assets', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER assets_fts_insert AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts (rowid, code, name, site, place, subcategory, brand, model,
    serial_number, supplier, exact_location, comment)
  VALUES (new.id, new.code, new.name, new.site, new.place, new.subcategory, new.brand,
    new.model, new.serial_number, new.supplier, new.exact_location, new.comment);
END;

CREATE TRIGGER assets_fts_delete AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts (assets_fts, rowid, code, name, site, place, subcategory, brand,
    model, serial_number, supplier, exact_location, comment)
  VALUES ('delete', old.id, old.code, old.name, old.site, old.place, old.subcategory,
    old.brand, old.model, old.serial_number, old.supplier, old.exact_location, old.comment);
END;

CREATE TRIGGER assets_fts_update AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts (assets_fts, rowid, code, name, site, place, subcategory, brand,
    model, serial_number, supplier, exact_location, comment)
  VALUES ('delete', old.id, old.code, old.name, old.site, old.place, old.subcategory,
    old.brand, old.model, old.serial_number, old.supplier, old.exact_location, old.comment);
  INSERT INTO assets_fts (rowid, code, name, site, place, subcategory, brand, model,
    serial_number, supplier, exact_location, comment)
  VALUES (new.id, new.code, new.name, new.site, new.place, new.subcategory, new.brand,
    new.model, new.serial_number, new.supplier, new.exact_location, new.comment);
END;

INSERT INTO assets_fts (assets_fts) VALUES ('rebuild');

-- work_orders: the asset's place (BR-L8), else the room of the request, else the site.
DROP TRIGGER work_orders_fts_insert;
DROP TRIGGER work_orders_fts_delete;
DROP TRIGGER work_orders_fts_update;
DROP TABLE work_orders_fts;

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
  -- The name of the place's site (BR-L7).
  site            TEXT NOT NULL CHECK (length(trim(site)) > 0),
  location_id     INTEGER NOT NULL REFERENCES locations (id),
  place           TEXT NOT NULL DEFAULT '',
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
  -- The words about the place ("desk 12-21").
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
  asset_id, site, location_id, place, category, assignee_id, supervisor_id, created_on, due_on,
  started_on, closed_on, estimated_hours, actual_hours, work_report, created_by, version,
  has_conflict, updated_by, created_at, updated_at, location, review_status, reviewed_by,
  reviewed_at, review_note, plan_id, planned_week)
SELECT w.id, w.number, w.client_id, w.type, w.status, w.priority, w.title, w.description,
  w.asset_id, mp.site, mp.id, mp.place, w.category, w.assignee_id, w.supervisor_id, w.created_on,
  w.due_on, w.started_on, w.closed_on, w.estimated_hours, w.actual_hours, w.work_report,
  w.created_by, w.version, w.has_conflict, w.updated_by, w.created_at, w.updated_at, w.location,
  w.review_status, w.reviewed_by, w.reviewed_at, w.review_note, w.plan_id, w.planned_week
FROM work_orders w
LEFT JOIN assets a ON a.id = w.asset_id
LEFT JOIN m_rooms mr ON mr.room_id = w.room_id
JOIN m_map ms ON ms.site = w.site AND ms.building IS NULL AND ms.floor IS NULL
JOIN m_paths mp ON mp.id = coalesce(a.location_id, mr.location_id, ms.location_id);

DROP TABLE work_orders;
ALTER TABLE work_orders_new RENAME TO work_orders;

CREATE INDEX work_orders_status_idx ON work_orders (status);
CREATE INDEX work_orders_asset_id_idx ON work_orders (asset_id);
CREATE INDEX work_orders_location_idx ON work_orders (location_id);
CREATE INDEX work_orders_assignee_id_idx ON work_orders (assignee_id);
CREATE INDEX work_orders_created_on_idx ON work_orders (created_on);
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

-- maintenance_plans: the asset's place (BR-L8), else the building, else the site.
CREATE TABLE maintenance_plans_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL UNIQUE CHECK (code GLOB 'PM-[0-9][0-9][0-9][0-9]*'),
  title            TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description      TEXT CHECK (description IS NULL OR length(description) <= 4000),
  -- Work order type of the visits.
  type             TEXT NOT NULL CHECK (type IN ('PREVENTIVE', 'REGULATORY')),
  category         TEXT NOT NULL CHECK (category IN ('HVAC', 'ELECTRICAL', 'FIRE_SAFETY', 'PLUMBING', 'NETWORK_CABLING', 'SECURITY')),
  asset_id         INTEGER REFERENCES assets (id),
  -- Follow the asset when there is one (BR-L8); site is the name of the place's site (BR-L7).
  site             TEXT NOT NULL CHECK (length(trim(site)) > 0),
  location_id      INTEGER NOT NULL REFERENCES locations (id),
  place            TEXT NOT NULL DEFAULT '',
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

INSERT INTO maintenance_plans_new (id, code, title, description, type, category, asset_id, site,
  location_id, place, location, estimated_hours, frequency_weeks, anchor_week, end_week,
  schedule_mode, tolerance_weeks, season_from_week, season_to_week, performed_by, supplier,
  is_active, version, created_by, updated_by, created_at, updated_at)
SELECT p.id, p.code, p.title, p.description, p.type, p.category, p.asset_id, mp.site, mp.id,
  mp.place, p.location, p.estimated_hours, p.frequency_weeks, p.anchor_week, p.end_week,
  p.schedule_mode, p.tolerance_weeks, p.season_from_week, p.season_to_week, p.performed_by,
  p.supplier, p.is_active, p.version, p.created_by, p.updated_by, p.created_at, p.updated_at
FROM maintenance_plans p
LEFT JOIN assets a ON a.id = p.asset_id
JOIN m_map m ON m.site = p.site AND m.building IS nullif(trim(p.building), '') AND m.floor IS NULL
JOIN m_paths mp ON mp.id = coalesce(a.location_id, m.location_id);

DROP TABLE maintenance_plans;
ALTER TABLE maintenance_plans_new RENAME TO maintenance_plans;

CREATE INDEX maintenance_plans_site_idx ON maintenance_plans (site);
CREATE INDEX maintenance_plans_location_idx ON maintenance_plans (location_id);
CREATE INDEX maintenance_plans_category_idx ON maintenance_plans (category);
CREATE INDEX maintenance_plans_active_idx ON maintenance_plans (is_active);

-- Conflicts kept the old columns in their JSON: building, floor and the room are gone.
UPDATE conflicts SET
  server_snapshot = json_remove(server_snapshot, '$.building', '$.floor', '$.room_id', '$.room'),
  client_changes = json_remove(client_changes, '$.building', '$.floor', '$.room_id');

-- Users and blocked weeks keep naming their site; same spelling as the site's place.
UPDATE users SET site = (SELECT l.name FROM locations l
  WHERE l.parent_id IS NULL AND l.name = users.site COLLATE NOCASE)
WHERE trim(coalesce(site, '')) <> '';
UPDATE blocked_weeks SET site = (SELECT l.name FROM locations l
  WHERE l.parent_id IS NULL AND l.name = blocked_weeks.site COLLATE NOCASE)
WHERE site IS NOT NULL;

DROP TABLE rooms;
DROP TABLE m_places;
DROP TABLE m_map;
DROP TABLE m_rooms;
DROP TABLE m_paths;
