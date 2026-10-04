-- 003_search: full-text search indexes (FTS5) for assets and work orders.
-- External-content tables: the text lives in the main tables; triggers keep the indexes in
-- sync. unicode61 with remove_diacritics: "e" also finds "é", case is ignored.

CREATE VIRTUAL TABLE assets_fts USING fts5(
  code, name, site, building, subcategory, brand, model, serial_number, supplier,
  exact_location, comment,
  content = 'assets', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER assets_fts_insert AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts (rowid, code, name, site, building, subcategory, brand, model,
    serial_number, supplier, exact_location, comment)
  VALUES (new.id, new.code, new.name, new.site, new.building, new.subcategory, new.brand,
    new.model, new.serial_number, new.supplier, new.exact_location, new.comment);
END;

CREATE TRIGGER assets_fts_delete AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts (assets_fts, rowid, code, name, site, building, subcategory, brand,
    model, serial_number, supplier, exact_location, comment)
  VALUES ('delete', old.id, old.code, old.name, old.site, old.building, old.subcategory,
    old.brand, old.model, old.serial_number, old.supplier, old.exact_location, old.comment);
END;

CREATE TRIGGER assets_fts_update AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts (assets_fts, rowid, code, name, site, building, subcategory, brand,
    model, serial_number, supplier, exact_location, comment)
  VALUES ('delete', old.id, old.code, old.name, old.site, old.building, old.subcategory,
    old.brand, old.model, old.serial_number, old.supplier, old.exact_location, old.comment);
  INSERT INTO assets_fts (rowid, code, name, site, building, subcategory, brand, model,
    serial_number, supplier, exact_location, comment)
  VALUES (new.id, new.code, new.name, new.site, new.building, new.subcategory, new.brand,
    new.model, new.serial_number, new.supplier, new.exact_location, new.comment);
END;

CREATE VIRTUAL TABLE work_orders_fts USING fts5(
  number, title, description, site, work_report,
  content = 'work_orders', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER work_orders_fts_insert AFTER INSERT ON work_orders BEGIN
  INSERT INTO work_orders_fts (rowid, number, title, description, site, work_report)
  VALUES (new.id, new.number, new.title, new.description, new.site, new.work_report);
END;

CREATE TRIGGER work_orders_fts_delete AFTER DELETE ON work_orders BEGIN
  INSERT INTO work_orders_fts (work_orders_fts, rowid, number, title, description, site, work_report)
  VALUES ('delete', old.id, old.number, old.title, old.description, old.site, old.work_report);
END;

CREATE TRIGGER work_orders_fts_update AFTER UPDATE ON work_orders BEGIN
  INSERT INTO work_orders_fts (work_orders_fts, rowid, number, title, description, site, work_report)
  VALUES ('delete', old.id, old.number, old.title, old.description, old.site, old.work_report);
  INSERT INTO work_orders_fts (rowid, number, title, description, site, work_report)
  VALUES (new.id, new.number, new.title, new.description, new.site, new.work_report);
END;

-- Index the rows that already exist (databases created before this migration).
INSERT INTO assets_fts (assets_fts) VALUES ('rebuild');
INSERT INTO work_orders_fts (work_orders_fts) VALUES ('rebuild');
