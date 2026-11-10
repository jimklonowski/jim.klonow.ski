-- One-time data fix, audit #43 item 65: the ultrasensitive LC/MS/MS estradiol add-on used to
-- land on the same `estradiol` key as the panel's immunoassay (save-json merges per key, so the
-- report uploaded last won). Now it has its own key, estradiol_sensitive. The two draws that
-- carried both assays are split here from the values recorded in READING_NOTES
-- (server/data/markerCaveats.ts): 2026-08-15 immunoassay 85 / ultrasensitive 106,
-- 2026-10-17 immunoassay 157 / ultrasensitive 126.
--
-- Idempotent: each UPDATE only fires while the row still holds the pre-split shape (no
-- estradiol_sensitive key and the estradiol value one of the pair's). Run once, remote:
--   npx wrangler d1 execute <DB_NAME> --remote --file=server/database/fix-estradiol-assays-2026-11-10.sql
-- Verify first with:
--   SELECT date, json_extract(markers, '$.estradiol') AS e2, json_extract(markers, '$.estradiol_sensitive') AS e2s
--   FROM labs_entries WHERE date IN ('2026-08-15', '2026-10-17');

UPDATE labs_entries
SET markers = json_set(markers, '$.estradiol', 85, '$.estradiol_sensitive', 106)
WHERE date = '2026-08-15'
  AND json_extract(markers, '$.estradiol_sensitive') IS NULL
  AND json_extract(markers, '$.estradiol') IN (85, 106);

UPDATE labs_entries
SET markers = json_set(markers, '$.estradiol', 157, '$.estradiol_sensitive', 126)
WHERE date = '2026-10-17'
  AND json_extract(markers, '$.estradiol_sensitive') IS NULL
  AND json_extract(markers, '$.estradiol') IN (126, 127, 157);
