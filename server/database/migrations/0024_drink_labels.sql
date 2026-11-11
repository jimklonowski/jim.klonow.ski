-- The owner's own label figures for a drink (shared/utils/drinks.ts): the built-in drink table
-- was written from memory, so a drink whose can or bottle has been read — typed, or scanned and
-- checked — carries a row here and every figure reads it instead. One row per drink name; the
-- figures are the ones printed for one container, with that container's size.
CREATE TABLE IF NOT EXISTS drink_labels (
  key TEXT PRIMARY KEY,          -- the drink's name, trimmed and lowercased (drinkKey)
  name TEXT NOT NULL,            -- as the owner logs it
  serving_oz REAL NOT NULL,      -- the container the figures describe, fl oz
  kcal REAL NOT NULL,
  caffeine_mg REAL NOT NULL,
  sodium_mg REAL NOT NULL,
  sugar_g REAL NOT NULL,
  barcode TEXT,                  -- the UPC/EAN it was looked up by, when it was
  updated_at TEXT NOT NULL
);
