-- One-time data migration, 2026-09-16. The soda size suggestion "Mini can" was renamed
-- "7.5oz mini can" (SODA_SIZES in app/data/journal.ts) so the label carries its volume the way
-- "12oz can" and "20oz bottle" already do. Sizes are freeform strings inside the `sodas` JSON array
-- on journal_entries, so the rows logged under the old spelling are rewritten here to match —
-- otherwise the quick-add header and today's list would show two spellings of the same can.
--
--   npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/migrate-soda-mini-can-2026-09-16.sql
--
-- Idempotent: the WHERE clause only matches rows still holding the old spelling, so a re-run is a
-- no-op. Both write paths store minified JSON (soda.post.ts goes through json()/json_insert,
-- save.post.ts through JSON.stringify), so the exact substring "size":"Mini can" is what's on disk.
-- The demo DB doesn't need this — its nightly reset reseeds from demo-seed.json, which was
-- updated in the same change.
UPDATE journal_entries
SET sodas = replace(sodas, '"size":"Mini can"', '"size":"7.5oz mini can"')
WHERE sodas LIKE '%"size":"Mini can"%';
