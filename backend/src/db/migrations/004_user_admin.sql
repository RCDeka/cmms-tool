-- 004_user_admin: user administration (docs/data-model.md → users, BR-U3 to BR-U8).
-- Users are deactivated, never deleted: work orders and the audit log keep pointing at them.
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
-- Set when the password changes: tokens issued before it are refused (BR-U8).
ALTER TABLE users ADD COLUMN credentials_changed_at TEXT;
