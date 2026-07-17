CREATE TABLE IF NOT EXISTS journal_entries (
  date TEXT PRIMARY KEY,
  day INTEGER,
  weight_lbs REAL,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  rhr INTEGER,
  hrv INTEGER,
  peptides TEXT NOT NULL DEFAULT '[]',
  reconstitutions TEXT NOT NULL DEFAULT '[]',
  food TEXT NOT NULL DEFAULT '{}',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS labs_entries (
  date TEXT PRIMARY KEY,
  fasting INTEGER NOT NULL DEFAULT 0,
  sources TEXT NOT NULL DEFAULT '[]',
  markers TEXT NOT NULL DEFAULT '{}',
  qualitative TEXT NOT NULL DEFAULT '[]',
  ai_summary TEXT
);

CREATE TABLE IF NOT EXISTS dexa_entries (
  date TEXT PRIMARY KEY,
  weight_lbs REAL NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  total TEXT NOT NULL,
  regions TEXT NOT NULL,
  vat TEXT,
  ag_ratio REAL,
  bone_density TEXT,
  symmetry TEXT
);

CREATE TABLE IF NOT EXISTS health_metrics (
  date TEXT PRIMARY KEY,
  vo2_max REAL,
  body_fat_pct REAL,
  lean_body_mass_lbs REAL,
  sleep_total_min INTEGER,
  sleep_rem_min INTEGER,
  sleep_deep_min INTEGER,
  sleep_core_min INTEGER,
  sleep_awake_min INTEGER
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  date TEXT NOT NULL,
  workout_type TEXT,
  start_time TEXT,
  duration_min REAL,
  calories REAL,
  avg_hr INTEGER,
  max_hr INTEGER,
  distance_mi REAL
);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);

CREATE TABLE IF NOT EXISTS whoop_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Vial inventory: sealed fridge stock (lyophilized) and active reconstituted vials.
-- A sealed batch has quantity = number of identical vials on hand; opening one decrements
-- the batch and spawns an active row (quantity 1) with opened_date + bac_water_ml set.
-- Active-vial remaining mg is derived at read time from journal_entries.peptides doses
-- of the same compound logged on/after opened_date (see app/utils/vialInventory.ts).
CREATE TABLE IF NOT EXISTS vials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compound TEXT NOT NULL,
  supplier TEXT,
  vial_amount REAL NOT NULL,
  vial_unit TEXT NOT NULL DEFAULT 'mg',
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'sealed', -- 'sealed' | 'active' | 'finished'
  opened_date TEXT,
  bac_water_ml REAL,
  lot TEXT,
  expiry TEXT,
  cost REAL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vials_compound ON vials(compound);
CREATE INDEX IF NOT EXISTS idx_vials_status ON vials(status);

-- One-time migration, do not re-run after it lands on an environment:
-- ALTER TABLE labs_entries ADD COLUMN ai_summary TEXT;

-- One-time migration, do not re-run after it lands on an environment:
-- ALTER TABLE health_metrics ADD COLUMN recovery_score REAL;
-- ALTER TABLE health_metrics ADD COLUMN strain REAL;
-- ALTER TABLE health_metrics ADD COLUMN sleep_performance_pct REAL;

-- One-time migration, do not re-run after it lands on an environment.
-- Folds the retired freehand `workout` field into `notes` (structured workouts now come from
-- the `workouts` table via Whoop sync) before dropping the column, so no historical text is lost:
-- UPDATE journal_entries
-- SET notes = CASE
--   WHEN notes IS NOT NULL AND notes != '' THEN notes || char(10) || char(10) || 'Workout: ' || workout
--   ELSE 'Workout: ' || workout
-- END
-- WHERE workout IS NOT NULL AND workout != '';
-- ALTER TABLE journal_entries DROP COLUMN workout;
