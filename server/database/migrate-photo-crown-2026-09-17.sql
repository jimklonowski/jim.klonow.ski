-- One-time data migration, 2026-09-17. The single 'hairline' progress-photo category was split
-- in two (shared/utils/photoCategories.ts): 'hairline' keeps the forehead / front-hairline shots,
-- and the new 'crown' bucket takes the straight-down top-of-head shots that had been filed under
-- it. The eight crown rows below were sorted by eye from their thumbnails; the other nineteen
-- hairline rows stay put. r2_key is the match column because it embeds the upload timestamp and
-- is identical locally and remote, unlike anything a re-import could renumber.
--
--   npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/migrate-photo-crown-2026-09-17.sql
--
-- Expected: 8 changes. Idempotent: rows already moved no longer match category = 'hairline'.
-- The R2 objects are untouched — their '-hairline-' filename segment is an opaque handle, nothing
-- derives the category from it. The demo DB has no hairline photos (demo-seed.json uses only
-- chest/face), so it needs nothing.
--
-- Crown rows (date · id):
--   2026-07-27 · 5    (back/top of head, the office pair with id 4)
--   2026-08-02 · 112
--   2026-08-10 · 119
--   2026-08-16 · 126
--   2026-08-24 · 132
--   2026-08-30 · 139
--   2026-09-13 · 146
--   2026-09-16 · 152
UPDATE progress_photos
SET category = 'crown'
WHERE category = 'hairline'
  AND r2_key IN (
    '2026-07-27-face_hairline-1785338853226.jpg',
    '2026-08-02-hairline-1785723122171.jpg',
    '2026-08-10-hairline-1786406277174.jpg',
    '2026-08-16-hairline-1786922509638.jpg',
    '2026-08-24-hairline-1787615675810.jpg',
    '2026-08-30-hairline-1788169895398.jpg',
    '2026-09-13-hairline-1789335376383.jpg',
    '2026-09-16-hairline-1789642097841.jpg'
  );
