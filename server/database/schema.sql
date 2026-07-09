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
  workout TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS labs_entries (
  date TEXT PRIMARY KEY,
  fasting INTEGER NOT NULL DEFAULT 0,
  sources TEXT NOT NULL DEFAULT '[]',
  markers TEXT NOT NULL DEFAULT '{}',
  qualitative TEXT NOT NULL DEFAULT '[]'
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
