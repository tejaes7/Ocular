-- Ocular sync worker — Recovery codes schema migration.

CREATE TABLE IF NOT EXISTS recovery_codes (
  code         TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_device ON recovery_codes (device_id);
