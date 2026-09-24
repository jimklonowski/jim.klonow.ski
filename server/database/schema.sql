-- The current schema, with the reasoning behind each table — a snapshot for reading, NOT what
-- builds a database. Databases are built and changed by the numbered files in ./migrations,
-- applied by wrangler and recorded in each database's d1_migrations ledger:
--
--   pnpm db:new <name>        new migration file (next number) in ./migrations
--   pnpm db:migrate           apply pending migrations to both local databases (main + demo)
--   pnpm db:migrate:remote    the same against the real ones — before deploying code that needs it
--   pnpm db:status[:remote]   what each database has applied
--
-- A schema change is a migration AND the matching edit here, in the same change:
-- tests/migrations.test.mjs replays every migration and fails if the result differs from this file.
-- The one-off files applied by hand before the ledger existed (2026-09-24) are in ./archive.

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

-- recovery_score / strain / sleep_performance_pct arrived as ALTERs (footer) but belong in the
-- CREATE too, or a from-scratch DB (the local demo sandbox after `pnpm sync:local`) is missing
-- columns the Whoop sync and demo seed write to.
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

-- Single-row OAuth state for the Whoop connection. `revoked` is set when Whoop rejects the saved
-- refresh token: the row is kept (rather than deleted) so /api/whoop/status can explain why
-- syncing stopped instead of silently reporting "connected" while every nightly run fails.
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

-- Stock inventory: sealed containers and the active (opened) ones. `form` says what a container
-- is — 'vial' (lyophilized powder, oil, pen) or a pill bottle ('tablet' | 'capsule'). vial_amount
-- is ALWAYS the total content of one container: for a bottle that is unit_count × per-pill
-- strength (100 × 25 mg tabs → 2500 mg), so the depletion/runway math stays form-agnostic and
-- the UI translates back to label terms (shared/utils/vialForm.ts).
-- A sealed batch has quantity = number of identical containers on hand; opening one decrements
-- the batch and spawns an active row (quantity 1) with opened_date (+ bac_water_ml for vials).
-- Active remaining amount is derived at read time from journal_entries.peptides doses
-- of the same compound logged on/after opened_date (see app/utils/vialInventory.ts).
CREATE TABLE IF NOT EXISTS vials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compound TEXT NOT NULL,
  supplier TEXT,
  vial_amount REAL NOT NULL,
  vial_unit TEXT NOT NULL DEFAULT 'mg',
  form TEXT NOT NULL DEFAULT 'vial', -- 'vial' | 'tablet' | 'capsule'
  unit_count INTEGER,                -- tablets/capsules per bottle; NULL for vials
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
  category TEXT NOT NULL, -- PHOTO_CATEGORIES values, shared/utils/photoCategories.ts ('chest' | ... | 'hairline' | 'crown')
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

-- Standing vitamin/supplement/skin-routine stack. Unlike journal peptides these are not
-- dose-logged day by day — rows describe the ongoing regimen and feed the AI digest and
-- lab-summary prompts as protocol context (see server/utils/supplementContext.ts).
-- status 'on_hand' = owned but not being taken (support supplements staged for a future
-- cycle, a possible finasteride->dutasteride switch, etc.) — listed to the AI separately.
-- status 'stopped' rows are kept: recent stops are relevant context for lab trends.
-- dose and schedule are freeform text ("160 mg", "2 capsules", "~10 min each morning").
CREATE TABLE IF NOT EXISTS supplements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dose TEXT,
  category TEXT NOT NULL DEFAULT 'supplement', -- 'supplement' | 'skin'
  status TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'on_hand' | 'stopped'
  schedule TEXT NOT NULL DEFAULT 'daily',
  started TEXT,  -- YYYY-MM-DD; NULL = long-standing / unknown
  stopped TEXT,  -- YYYY-MM-DD; set when status = 'stopped'
  notes TEXT,    -- shown to the AI too, e.g. "raised from 25 mg on 2026-08-22"
  sort INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);

-- Planned protocol cycles ("blasts"/"runs") — a named, dated phase layered on top of the
-- standing schedule. The plan is stored relative to start_date (per-compound week numbers in
-- the compounds JSON, shape shared/utils/cycles.ts:CyclePlanItem[]) so shifting the start is a
-- one-field edit. actual_end is only set when a cycle ends off-plan (cut early on bad labs, or
-- extended); status (upcoming/active/done) is always derived from the dates, never stored.
-- Read by the adherence panel, calendar rings, home dashboard strip, and the AI prompt
-- context (server/utils/cycleContext.ts).
--
-- start_precision records how much of start_date is a commitment: 'day' is a picked start,
-- while 'month'/'quarter' mean "sometime in Oct 2026" / "sometime in Q4 2026" and store only
-- the first day of that month/quarter as an anchor. Tentative cycles stay 'upcoming' and
-- derive nothing dated — no rings, no adherence, no checkpoint windows (shared/utils/cycles.ts
-- :isTentative) — so a guessed date can't invent expectations.
CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  goal TEXT,
  start_date TEXT NOT NULL,
  start_precision TEXT NOT NULL DEFAULT 'day',  -- 'day' | 'month' | 'quarter'; see below
  planned_weeks INTEGER NOT NULL,
  planned_days INTEGER,             -- exact span when not a whole number of weeks; see below
  actual_end TEXT,
  compounds TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL
);

-- Share invites: owner-minted links (/share/<id>) that grant read-only role sessions.
-- Redemption is gated by expires_at/max_uses; setting revoked=1 (or deleting the row) also
-- invalidates every session cookie minted from the invite — the auth middleware re-checks
-- invite liveness on each guest request.
CREATE TABLE IF NOT EXISTS invites (
  -- SHA-256 (hex) of the URL token, never the token itself: the token is the credential, so a
  -- database copy (including the plaintext dump `pnpm sync:local` writes) must not carry live
  -- links. See hashInviteToken in server/utils/auth.ts.
  id TEXT PRIMARY KEY,               -- sha256 hex of the URL token (which is 24 random bytes, base64url)
  role TEXT NOT NULL,                -- 'friend' | 'doctor'
  label TEXT,                        -- who this link is for, e.g. "Dr. Smith"
  created_at TEXT NOT NULL,
  expires_at TEXT,                   -- redemption deadline (NULL = no deadline)
  max_uses INTEGER,                  -- NULL = unlimited redemptions
  uses INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- Vaccination log: one row per dose. Exists because "when was your last tetanus shot?" had no
-- answer (2026-09-09). /journal/vaccines groups rows into per-family coverage with next-due
-- dates (shared/utils/vaccines.ts); recent shots feed the AI digest and lab-summary prompts as
-- an acute-response caveat (server/utils/vaccineContext.ts). vaccine is freeform,
-- usually a KNOWN_VACCINES name via autocomplete; product is the brand/formulation.
CREATE TABLE IF NOT EXISTS vaccinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  vaccine TEXT NOT NULL,
  product TEXT,
  notes TEXT,       -- shown to the AI too, e.g. "given after the 07:50 blood draw"
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vaccinations_date ON vaccinations(date);

-- Standing personal facts that are looked up, not trended — blood type first (2026-09-09).
-- Key/value so the next fact (height, allergies, …) is a one-line addition to PROFILE_FIELDS in
-- shared/utils/profile.ts with no migration. Rendered on the /journal/vaccines card and read
-- by the ask-the-data prompt. A cleared value deletes the row rather than storing ''.
CREATE TABLE IF NOT EXISTS profile (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
