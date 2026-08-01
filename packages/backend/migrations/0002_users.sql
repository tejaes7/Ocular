-- Optional accounts, for syncing a watchlist across a person's own devices.
--
-- This table is deliberately NOT joined to price data. Product price series are
-- collected anonymously and carry no user_id and no device id — see docs/API.md
-- ("Two identities, never joined"). Adding a user_id to a price row is the one
-- change that would break that guarantee, so it needs a decision, not a patch.
--
-- Edited in place rather than superseded by an 0003: nothing had applied this
-- file yet. `db:init` only ever ran 0001_init.sql, so `users` has never existed
-- in any environment. Safe to change; if you have a local D1 that somehow has
-- it, drop the table and re-run the migrations.

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- The only identity key. Firebase guarantees `sub` is stable and unique.
    firebase_uid TEXT NOT NULL UNIQUE,

    -- Nullable and NOT unique, both deliberately:
    --   * Not every Firebase token carries an email. Phone and anonymous
    --     sign-in produce a valid token with no email claim, so NOT NULL turns
    --     a legitimate first login into a constraint violation.
    --   * One person can hold two uids with the same address — signing in with
    --     Google and later with email/password mints a second uid. UNIQUE here
    --     would reject that second login permanently, with no way back.
    email TEXT,

    display_name TEXT,
    photo_url TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
