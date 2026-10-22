// The meal_estimates upsert, in one place for its two writers (audit #42 item 40): the
// estimator's model rows and the owner's hand corrections carried the same thirteen-column
// INSERT in two files. The rule the two statements share is the one that matters: a 'manual'
// row is never overwritten by a model row, while a correction overwrites anything. Binds are
// positional and listed per source below. Plain TS so tests/mealEstimateSql.test.mjs can run the
// statements against the real schema in node:sqlite.

export const MEAL_ESTIMATE_COLUMNS = 'key, text, kcal, protein_g, carbs_g, fat_g, confidence, assumptions, source, model, prompt_hash, created_at, updated_at'

/**
 * A model estimate: ?1 key, ?2 text, ?3 kcal, ?4 protein_g, ?5 carbs_g, ?6 fat_g, ?7 confidence,
 * ?8 assumptions, ?9 model, ?10 prompt_hash, ?11 now. Leaves a 'manual' row alone.
 */
export const MEAL_ESTIMATE_AI_UPSERT = `
  INSERT INTO meal_estimates (${MEAL_ESTIMATE_COLUMNS})
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'ai', ?9, ?10, ?11, ?11)
  ON CONFLICT(key) DO UPDATE SET
    text = excluded.text, kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g, confidence = excluded.confidence, assumptions = excluded.assumptions,
    model = excluded.model, prompt_hash = excluded.prompt_hash, updated_at = excluded.updated_at
  WHERE meal_estimates.source != 'manual'
`

/**
 * A hand correction: ?1 key, ?2 text, ?3 kcal, ?4 protein_g, ?5 carbs_g, ?6 fat_g, ?7 now.
 * Overwrites whatever is there and marks the row 'manual' (high confidence, no model).
 */
export const MEAL_ESTIMATE_MANUAL_UPSERT = `
  INSERT INTO meal_estimates (${MEAL_ESTIMATE_COLUMNS})
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'high', 'corrected by hand', 'manual', NULL, NULL, ?7, ?7)
  ON CONFLICT(key) DO UPDATE SET
    kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
    confidence = 'high', assumptions = 'corrected by hand', source = 'manual', model = NULL, prompt_hash = NULL,
    updated_at = excluded.updated_at
`
