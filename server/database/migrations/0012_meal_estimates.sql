-- Cached calorie/macro estimates for the meal log (2026-10-20, shared/utils/nutrition.ts). One
-- row per normalized meal text (`key` = mealKey(text): sorted token set), written once by the
-- model via server/utils/nutritionEstimate.ts and never re-estimated; a hand correction sets
-- source = 'manual' and wins over any later estimate. The journal's food strings stay as typed —
-- this table is read-time context beside them, keyed so every spelling of a meal shares one row.
CREATE TABLE IF NOT EXISTS meal_estimates (
  key TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  kcal INTEGER NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
  assumptions TEXT,                          -- the portion the model assumed, one clause
  source TEXT NOT NULL DEFAULT 'ai',         -- ai | manual
  model TEXT,
  prompt_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
