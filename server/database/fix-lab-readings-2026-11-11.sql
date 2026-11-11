-- One-time backfill, audit #43 item 72: the per-reading provenance the hand-written READING_NOTES
-- (server/data/markerCaveats.ts) already describe, written as data so the same facts hold
-- wherever isCensored and the cards read `readings`:
--   2026-09-09  testosterone_total  printed ">1500" by CHW's immunoassay, range 264–916 ng/dL
--   2026-08-15  estradiol           Quest immunoassay (Whoop Advanced Labs panel)
--               estradiol_sensitive Quest ultrasensitive LC/MS/MS (Jason Health add-on, code 30289)
--   2026-10-17  the same pair
-- Draws uploaded after migration 0021 get this from the extractor; nothing here touches them.
--
-- Idempotent: each statement only sets a key that is not yet present. Run once, remote, after
-- `pnpm db:migrate:remote` (the column must exist):
--   pnpm wrangler d1 execute jim-klonow-ski-db --remote --file=server/database/fix-lab-readings-2026-11-11.sql
-- Verify with:
--   SELECT date, readings FROM labs_entries WHERE date IN ('2026-08-15', '2026-09-09', '2026-10-17');

UPDATE labs_entries
SET readings = json_set(COALESCE(readings, '{}'), '$.testosterone_total', json('{"qualifier":">","unit":"ng/dL","ref_low":264,"ref_high":916,"lab":"CHW","assay":"immunoassay"}'))
WHERE date = '2026-09-09'
  AND json_extract(markers, '$.testosterone_total') = 1500
  AND json_extract(COALESCE(readings, '{}'), '$.testosterone_total') IS NULL;

UPDATE labs_entries
SET readings = json_set(COALESCE(readings, '{}'), '$.estradiol', json('{"unit":"pg/mL","lab":"Quest","assay":"immunoassay"}'))
WHERE date IN ('2026-08-15', '2026-10-17')
  AND json_extract(markers, '$.estradiol') IS NOT NULL
  AND json_extract(COALESCE(readings, '{}'), '$.estradiol') IS NULL;

UPDATE labs_entries
SET readings = json_set(COALESCE(readings, '{}'), '$.estradiol_sensitive', json('{"unit":"pg/mL","ref_high":29,"lab":"Quest","assay":"LC/MS/MS"}'))
WHERE date IN ('2026-08-15', '2026-10-17')
  AND json_extract(markers, '$.estradiol_sensitive') IS NOT NULL
  AND json_extract(COALESCE(readings, '{}'), '$.estradiol_sensitive') IS NULL;
