-- Blood removed on purpose — a donation or a therapeutic phlebotomy — logged against the
-- hematocrit campaign (audit #43 item 59, /labs/hematocrit). One row per visit: what kind,
-- how much, and the hemoglobin the clinic measured before taking it. Both databases (the demo
-- sandbox gets the table empty; it is not seeded).
CREATE TABLE IF NOT EXISTS phlebotomies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,            -- 'donation' | 'therapeutic'
  ml INTEGER,                    -- volume removed; a whole-blood donation is ~500 mL
  pre_hgb REAL,                  -- the finger-stick hemoglobin before, g/dL, when given
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_phlebotomies_date ON phlebotomies(date);
