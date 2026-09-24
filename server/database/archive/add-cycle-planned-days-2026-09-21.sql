-- One-time migration (2026-09-21): day-exact cycle spans. Some protocols are not a whole number
-- of weeks (a 10-day iron load) and weeks could not express them — 10 days is 1.43 weeks, not
-- 1.5. NULL means "span is planned_weeks * 7", which is how every existing row already reads,
-- so nothing changes for them. See the note at the foot of schema.sql and Cycle.planned_days in
-- shared/utils/cycles.ts.
--
-- Main DB only: the demo DB has no cycles table (api/journal/cycles/list.get.ts).
--   npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/archive/add-cycle-planned-days-2026-09-21.sql
ALTER TABLE cycles ADD COLUMN planned_days INTEGER;
