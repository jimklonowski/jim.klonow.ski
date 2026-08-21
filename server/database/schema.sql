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

-- AI-written health digests (daily "yesterday" recap + weekly summary), generated on a schedule
-- and stored for in-app viewing. Unique on (type, period_end) so re-generating a period upserts.
CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'daily' | 'weekly'
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  summary TEXT NOT NULL,
  stats TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_digests_type_period ON digests(type, period_end);

-- Progress photos (chest/bicep/face selfies) tied to a date, stored in PHOTOS_BUCKET (R2).
-- date is what drives calendar/comparison views and defaults from EXIF DateTimeOriginal on
-- upload; taken_at keeps the full EXIF timestamp when present, purely for reference.
-- thumb_r2_key is a small client-generated JPEG (Workers has no sharp/native image resizing)
-- uploaded alongside the original; nullable since rows from before this existed have none -
-- grids fall back to the full-size r2_key for those.
-- frame_offset_x/y (percent of image size, e.g. -30) and frame_scale (1 = no zoom) let a photo be
-- manually repositioned/zoomed for consistent framing across a comparison set without touching
-- the original pixels - applied as a CSS transform wherever the photo renders. Defaults are a
-- no-op so existing rows render unchanged.
CREATE TABLE IF NOT EXISTS progress_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT NOT NULL, -- 'chest' | 'left_bicep' | 'right_bicep' | 'face' | 'hairline'
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

-- Share invites: owner-minted links (/share/<id>) that grant read-only role sessions.
-- Redemption is gated by expires_at/max_uses; setting revoked=1 (or deleting the row) also
-- invalidates every session cookie minted from the invite — the auth middleware re-checks
-- invite liveness on each guest request.
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,               -- URL token (24 random bytes, base64url)
  role TEXT NOT NULL,                -- 'friend' | 'doctor'
  label TEXT,                        -- who this link is for, e.g. "Dr. Smith"
  created_at TEXT NOT NULL,
  expires_at TEXT,                   -- redemption deadline (NULL = no deadline)
  max_uses INTEGER,                  -- NULL = unlimited redemptions
  uses INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- One-time migration, do not re-run after it lands on an environment:
-- ALTER TABLE labs_entries ADD COLUMN ai_summary TEXT;

-- One-time migration, do not re-run after it lands on an environment:
-- ALTER TABLE progress_photos ADD COLUMN thumb_r2_key TEXT;

-- One-time migration, do not re-run after it lands on an environment:
-- ALTER TABLE progress_photos ADD COLUMN frame_offset_x REAL NOT NULL DEFAULT 0;
-- ALTER TABLE progress_photos ADD COLUMN frame_offset_y REAL NOT NULL DEFAULT 0;
-- ALTER TABLE progress_photos ADD COLUMN frame_scale REAL NOT NULL DEFAULT 1;

-- One-time migration, do not re-run after it lands on an environment:
-- ALTER TABLE health_metrics ADD COLUMN recovery_score REAL;
-- ALTER TABLE health_metrics ADD COLUMN strain REAL;
-- ALTER TABLE health_metrics ADD COLUMN sleep_performance_pct REAL;

-- One-time migration, do not re-run after it lands on an environment:
-- ALTER TABLE journal_entries ADD COLUMN sodas TEXT NOT NULL DEFAULT '[]';

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
