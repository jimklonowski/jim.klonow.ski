-- Water log (2026-10-20): one JSON array per day of {time, oz} taps, beside `sodas` and shaped
-- like it — appended atomically with json_insert by server/api/journal/water.post.ts, removed by
-- index with json_remove, and carried through the full-day save. Ounces, not cups: the cup Jim
-- refills at work is nominally 12 oz but holds less once it's packed with ice, so the cup size is
-- a profile setting (cup_oz) and every entry stores the volume it actually meant.
ALTER TABLE journal_entries ADD COLUMN water TEXT NOT NULL DEFAULT '[]'; -- JSON [{time, oz}]
