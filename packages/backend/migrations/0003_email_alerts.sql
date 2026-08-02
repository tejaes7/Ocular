-- Email price alerts, and the device -> account link they require.
--
-- ---------------------------------------------------------------------------
-- THIS SUPERSEDES THE NOTE AT THE TOP OF 0002_users.sql.
--
-- That file says joining accounts to price data "needs a decision, not a
-- patch". This is that decision, taken by Sathwik on 2026-08-02: a price drop
-- found while the browser is closed cannot reach the user through any channel
-- that does not know who they are, and email was chosen as that channel.
--
-- What it costs, stated plainly so nobody has to rediscover it:
--
--   devices.user_id makes price data attributable to a person. Not directly --
--   no price row carries a user id, and the prices table is untouched -- but
--   prices -> device -> user is now a two-hop join that anyone with database
--   access can make. The "two identities, never joined" guarantee in
--   docs/API.md and packages/web/public/privacy.html no longer holds as
--   written, and both need updating to match. The link is nullable and only
--   set when someone signs in and opts into email alerts, so a signed-out
--   device remains exactly as anonymous as it was before.
-- ---------------------------------------------------------------------------

-- Nullable on purpose: accounts stay optional, and a device with no user_id is
-- the normal case. ON DELETE SET NULL is not available without a table rebuild
-- in SQLite, so removing a user is handled in application code.
ALTER TABLE devices ADD COLUMN user_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices (user_id);

-- Alert de-duplication state.
--
-- Without these the cron would re-send the same email on every tick for as long
-- as the price stayed low -- once every 30 minutes, forever. `last_alert_price`
-- is what makes a *further* drop still able to alert while a flat one cannot.
ALTER TABLE products ADD COLUMN last_alert_price REAL;
ALTER TABLE products ADD COLUMN last_alert_at INTEGER NOT NULL DEFAULT 0;
