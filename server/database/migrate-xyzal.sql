-- One-time migration — allergy-pill switch (2026-09-01): the old OTC bottle ran out and was
-- replaced by Xyzal. Retires the generic row rather than renaming it, so the "recently
-- discontinued" context the digest and labs prompts read still shows the changeover.
-- Mirrors seed-supplements.sql. Equivalent to doing it by hand on /journal/supplements — run
-- one or the other, not both, and do NOT re-run (the INSERT would duplicate).
--
--   npx wrangler d1 execute jim-klonow-ski-db --local  --file server/database/migrate-xyzal.sql
--   npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/migrate-xyzal.sql
UPDATE supplements
SET name = 'Allergy pill (OTC antihistamine)', status = 'stopped', stopped = '2026-09-01', sort = 150,
    notes = 'Daily for a long stretch; the 300-count bottle ran out and was replaced by Xyzal'
WHERE name = 'Allergy pill';

INSERT INTO supplements (name, dose, category, status, schedule, started, stopped, notes, sort, created_at) VALUES
  ('Xyzal (levocetirizine)', '5 mg', 'supplement', 'active', 'daily', '2026-09-01', NULL,
   'Replaced the prior OTC allergy pill when that bottle ran out. Levocetirizine can be mildly sedating — worth weighing when sleep or HRV shifts',
   120, '2026-09-01T00:00:00.000Z');
