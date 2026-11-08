-- Which device the day's night came from: 'health' (Apple Health via Health Auto Export — the
-- Apple Watch's staged night, or a stageless session) or 'whoop' (the Whoop sleep record, with
-- its light/slow-wave/REM mapped onto the stage columns). NULL on rows written before this
-- migration, which were all Apple Health's. The upsert (server/utils/db.ts) ranks the sources —
-- a staged Watch night over Whoop's, Whoop's over a stageless Watch session (a nap) — so the
-- night on the home card no longer depends on which delivery arrived last (2026-11-07: Apple
-- Watch on the charger, Whoop on, the card read 0h00m and then the nap).
ALTER TABLE health_metrics ADD COLUMN sleep_source TEXT;
