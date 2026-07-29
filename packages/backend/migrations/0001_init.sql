-- Ocular sync worker — D1 schema.
-- Apply with:  npx wrangler d1 execute ocular --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,      -- client-generated UUID, not an account
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id              TEXT    NOT NULL,
  device_id       TEXT    NOT NULL,
  url             TEXT    NOT NULL,
  canonical_url   TEXT    NOT NULL,
  hostname        TEXT    NOT NULL,
  title           TEXT,
  currency        TEXT    NOT NULL DEFAULT 'INR',
  added_at        INTEGER NOT NULL,
  last_checked_at INTEGER NOT NULL DEFAULT 0,
  last_price      REAL,
  last_error      TEXT,
  fail_count      INTEGER NOT NULL DEFAULT 0,
  blocked_until   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, id)
);

-- The cron scan orders by these two columns; without the index it degrades to a
-- full table scan on every run.
CREATE INDEX IF NOT EXISTS idx_products_due
  ON products (blocked_until, last_checked_at);

CREATE INDEX IF NOT EXISTS idx_products_host
  ON products (hostname);

CREATE TABLE IF NOT EXISTS prices (
  device_id  TEXT    NOT NULL,
  product_id TEXT    NOT NULL,
  ts         INTEGER NOT NULL,
  price      REAL    NOT NULL,
  in_stock   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (device_id, product_id, ts)
);

CREATE INDEX IF NOT EXISTS idx_prices_pull
  ON prices (device_id, ts);
