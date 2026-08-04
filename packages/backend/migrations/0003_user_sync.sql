-- Migration 0003: User-centric multi-browser synchronization
-- Links devices and products to users so Chrome, Brave, and Edge share one single database.

ALTER TABLE devices ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE products ADD COLUMN user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_products_user ON products (user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices (user_id);
