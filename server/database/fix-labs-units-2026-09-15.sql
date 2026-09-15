-- One-time data fix, 2026-09-15. Every statement re-checks its own precondition, so the file is
-- idempotent — safe to run against local and remote, and harmless if run twice.
--
--   npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/fix-labs-units-2026-09-15.sql
--
-- Three parts: the fasting flag on the CHW draws, the K/uL → cells/uL differential, and a backfill
-- of the CHW-only markers on all three CHW rows. After running it on remote, hit "regen" on the 2026-09-09 AI
-- summary at /labs — the stored one was written against the non-fasting flag and the K/uL
-- differential.

-- 1. All three annual CHW draws (2024-09-26, 2025-09-11, 2026-09-09) were fasted — confirmed by Jim
--    2026-09-15. CHW reports don't carry Quest's "FASTING: YES" line, so the extractor stored
--    fasting = 0 on each.
UPDATE labs_entries SET fasting = 1
WHERE date IN ('2024-09-26', '2025-09-11', '2026-09-09') AND fasting = 0;

-- 2. The WBC differential absolute counts are stored in cells/uL (BIOMARKERS refs 1500–7800 etc.),
--    but five draws hold them in K/uL — 2019-12-10, 2021-01-11, 2024-09-26, 2025-09-11 and
--    2026-09-09 (values like 3.1 / 1.5 / 0.4 that add up to the WBC). Neutrophils below 100 cells/uL
--    would be agranulocytosis, so abs_neutrophils < 100 is the tell that the whole differential is
--    in K/uL. Eosinophils/basophils are legitimately < 100 cells/uL and can't be judged on their own,
--    which is why every statement keys off neutrophils — and why neutrophils are converted LAST.
UPDATE labs_entries
SET markers = json_set(markers, '$.abs_lymphocytes', CAST(round(json_extract(markers, '$.abs_lymphocytes') * 1000) AS INTEGER))
WHERE json_extract(markers, '$.abs_neutrophils') < 100 AND json_extract(markers, '$.abs_lymphocytes') IS NOT NULL;

UPDATE labs_entries
SET markers = json_set(markers, '$.abs_monocytes', CAST(round(json_extract(markers, '$.abs_monocytes') * 1000) AS INTEGER))
WHERE json_extract(markers, '$.abs_neutrophils') < 100 AND json_extract(markers, '$.abs_monocytes') IS NOT NULL;

UPDATE labs_entries
SET markers = json_set(markers, '$.abs_eosinophils', CAST(round(json_extract(markers, '$.abs_eosinophils') * 1000) AS INTEGER))
WHERE json_extract(markers, '$.abs_neutrophils') < 100 AND json_extract(markers, '$.abs_eosinophils') IS NOT NULL;

UPDATE labs_entries
SET markers = json_set(markers, '$.abs_basophils', CAST(round(json_extract(markers, '$.abs_basophils') * 1000) AS INTEGER))
WHERE json_extract(markers, '$.abs_neutrophils') < 100 AND json_extract(markers, '$.abs_basophils') IS NOT NULL;

UPDATE labs_entries
SET markers = json_set(markers, '$.abs_neutrophils', CAST(round(json_extract(markers, '$.abs_neutrophils') * 1000) AS INTEGER))
WHERE json_extract(markers, '$.abs_neutrophils') < 100;

-- 3. Backfill the CHW-only markers the key map didn't know at upload time (added to BIOMARKERS
--    and the extraction prompt on 2026-09-15) on all three annual CHW draws. Values transcribed
--    from the source PDFs (2024-09-26-CHWLabs.pdf, 2025-09-11-CHWLabs.pdf,
--    2026-09-09-CHW-LabResults.pdf); B12 and folate only appear on the 2026 panel. Each statement
--    is guarded on uric_acid so a re-run is a no-op.
UPDATE labs_entries
SET markers = json_set(markers,
  '$.uric_acid', 4.9,
  '$.phosphorus', 3.5,
  '$.bun_creatinine_ratio', 9,
  '$.bilirubin_direct', 0.15,
  '$.ggt', 13,
  '$.ldh', 169,
  '$.psa', 1.1
)
WHERE date = '2024-09-26' AND json_extract(markers, '$.uric_acid') IS NULL;

UPDATE labs_entries
SET markers = json_set(markers,
  '$.uric_acid', 5.2,
  '$.phosphorus', 3.6,
  '$.bun_creatinine_ratio', 8,
  '$.bilirubin_direct', 0.19,
  '$.ggt', 7,
  '$.ldh', 174,
  '$.psa', 1.1
)
WHERE date = '2025-09-11' AND json_extract(markers, '$.uric_acid') IS NULL;

UPDATE labs_entries
SET markers = json_set(markers,
  '$.uric_acid', 4.9,
  '$.phosphorus', 3.4,
  '$.bun_creatinine_ratio', 10,
  '$.bilirubin_direct', 0.15,
  '$.ggt', 11,
  '$.ldh', 168,
  '$.psa', 1.0,
  '$.vitamin_b12', 776,
  '$.folate', 20.0
)
WHERE date = '2026-09-09' AND json_extract(markers, '$.uric_acid') IS NULL;
