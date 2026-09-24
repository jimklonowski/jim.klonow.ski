-- Baseline (2026-09-24): the schema as it stood when the migrations ledger was introduced —
-- server/database/schema.sql at that date, comments stripped. Every statement is IF NOT EXISTS,
-- so on the databases that predate the ledger (main and demo, local and remote) this records
-- itself in d1_migrations and changes nothing; on an empty database it builds the whole schema.
-- Frozen: never edit an applied migration. Schema changes are new numbered files
-- (pnpm db:new <name>), mirrored into schema.sql in the same change.

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
  sodas TEXT NOT NULL DEFAULT '[]',
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
  sleep_awake_min INTEGER,
  recovery_score REAL,
  strain REAL,
  sleep_performance_pct REAL
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
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT,
  last_error TEXT,
  last_error_at TEXT
);

CREATE TABLE IF NOT EXISTS vials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compound TEXT NOT NULL,
  supplier TEXT,
  vial_amount REAL NOT NULL,
  vial_unit TEXT NOT NULL DEFAULT 'mg',
  form TEXT NOT NULL DEFAULT 'vial',
  unit_count INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'sealed',
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

CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  summary TEXT NOT NULL,
  stats TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_digests_type_period ON digests(type, period_end);

CREATE TABLE IF NOT EXISTS progress_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  thumb_r2_key TEXT,
  taken_at TEXT,
  created_at TEXT NOT NULL,
  frame_offset_x REAL NOT NULL DEFAULT 0,
  frame_offset_y REAL NOT NULL DEFAULT 0,
  frame_scale REAL NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_progress_photos_date ON progress_photos(date);
CREATE INDEX IF NOT EXISTS idx_progress_photos_category ON progress_photos(category);

CREATE TABLE IF NOT EXISTS supplements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dose TEXT,
  category TEXT NOT NULL DEFAULT 'supplement',
  status TEXT NOT NULL DEFAULT 'active',
  schedule TEXT NOT NULL DEFAULT 'daily',
  started TEXT,
  stopped TEXT,
  notes TEXT,
  sort INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  goal TEXT,
  start_date TEXT NOT NULL,
  start_precision TEXT NOT NULL DEFAULT 'day',
  planned_weeks INTEGER NOT NULL,
  planned_days INTEGER,
  actual_end TEXT,
  compounds TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vaccinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  vaccine TEXT NOT NULL,
  product TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vaccinations_date ON vaccinations(date);

CREATE TABLE IF NOT EXISTS profile (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
