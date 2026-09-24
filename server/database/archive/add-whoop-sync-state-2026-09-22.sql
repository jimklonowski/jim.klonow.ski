-- Whoop sync state (2026-09-22) — main DB only; the demo sandbox has no Whoop connection.
--
-- Makes a dead connection visible. `revoked` is set when Whoop rejects the stored refresh token
-- (it invalidates one the moment it's consumed, so a rejected refresh can never recover on its
-- own); until now the row simply stayed and /api/whoop/status kept reporting connected while
-- every nightly sync failed into a console.error nobody reads. last_synced_at / last_error back
-- the staleness line in the journal header's Whoop menu.
--
-- Existing rows are a live connection that has never errored — the defaults backfill exactly
-- that, so applying this changes nothing about the current connection.
--
--   npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/archive/add-whoop-sync-state-2026-09-22.sql -y
--   npx wrangler d1 execute jim-klonow-ski-db --local  --file server/database/archive/add-whoop-sync-state-2026-09-22.sql -y

ALTER TABLE whoop_tokens ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE whoop_tokens ADD COLUMN last_synced_at TEXT;
ALTER TABLE whoop_tokens ADD COLUMN last_error TEXT;
ALTER TABLE whoop_tokens ADD COLUMN last_error_at TEXT;
