-- The standing protocol as data (the protocol plan, P1–P3; 2026-10-23). schema.sql carries the
-- column-by-column notes. NOT READ by the app yet: PROTOCOL_RULES / STANDING_COMPOUNDS /
-- AS_NEEDED_COMPOUNDS (shared/utils/protocolRules.ts) and the supplements table stay the source
-- of truth until the loader (P4) and the cutover (P11/P12). The supplements copy below is
-- generic so it fits both databases; the code constants are seeded into the MAIN database only,
-- by scripts/protocol-seed.mjs (server/database/seed-protocol.sql).
CREATE TABLE IF NOT EXISTS protocol_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- 'logged' | 'standing' | 'as_needed'
  category TEXT NOT NULL,                    -- 'injectable' | 'oral' | 'supplement' | 'skin'
  injected INTEGER NOT NULL DEFAULT 0,
  on_hand INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  stop_note TEXT,
  sort INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_protocol_items_kind ON protocol_items(kind);

CREATE TABLE IF NOT EXISTS protocol_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES protocol_items(id) ON DELETE CASCADE,
  from_date TEXT,
  to_date TEXT,
  dose_label TEXT,
  weekdays TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_protocol_versions_item ON protocol_versions(item_id, from_date);

-- Every supplements row becomes a standing item with one version: on_hand rows (owned, not
-- taken) keep theirs open-ended too, since it carries the dose on hand and on_hand decides the
-- status; stopped rows close on their stopped date or, lacking one, the day the row was created;
-- the three schedule spellings in use map to weekday sets and anything else is kept as the
-- version's note. Guarded so a re-run, or a database seeded before this migration, adds nothing.
INSERT INTO protocol_items (name, kind, category, injected, on_hand, notes, stop_note, sort, created_at)
SELECT s.name, 'standing', CASE s.category WHEN 'skin' THEN 'skin' ELSE 'supplement' END, 0,
       CASE s.status WHEN 'on_hand' THEN 1 ELSE 0 END, s.notes, NULL, s.sort, s.created_at
FROM supplements s
WHERE NOT EXISTS (SELECT 1 FROM protocol_items p WHERE p.name = s.name AND p.kind = 'standing');

INSERT INTO protocol_versions (item_id, from_date, to_date, dose_label, weekdays, note, created_at)
SELECT p.id, s.started,
       CASE WHEN s.status = 'stopped' THEN COALESCE(s.stopped, substr(s.created_at, 1, 10)) ELSE s.stopped END,
       s.dose,
       CASE s.schedule
         WHEN 'daily' THEN '[0,1,2,3,4,5,6]'
         WHEN 'Mondays + Thursdays' THEN '[1,4]'
         WHEN 'Sundays' THEN '[0]'
         ELSE NULL
       END,
       CASE WHEN s.schedule IN ('daily', 'Mondays + Thursdays', 'Sundays') THEN NULL ELSE s.schedule END,
       s.created_at
FROM supplements s
JOIN protocol_items p ON p.name = s.name AND p.kind = 'standing'
WHERE NOT EXISTS (SELECT 1 FROM protocol_versions v WHERE v.item_id = p.id);
