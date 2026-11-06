-- The acne photo set got its own chest and face-front buckets ('acne_chest', 'acne_face' in
-- shared/utils/photoCategories.ts) on 2026-11-06: the first design shared 'chest' and 'face' with
-- the physique set, and the first acne session's close-ups (2026-11-06, the baseline set before
-- capsule one) landed in the physique compare and timelapse beside full-torso mirror shots. These
-- are those two rows — matched by id so the physique session of 2026-11-02 (ids 195–200) and every
-- older chest/face stays put. R2 keys are opaque handles and are not rewritten.
-- Data only — no schema change. Expect 2 changes on the main DB, 0 on the demo DB; idempotent.
UPDATE progress_photos SET category = 'acne_chest' WHERE id = 201 AND category = 'chest' AND date = '2026-11-06';
UPDATE progress_photos SET category = 'acne_face' WHERE id = 202 AND category = 'face' AND date = '2026-11-06';
