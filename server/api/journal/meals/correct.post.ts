import { zMealCorrect } from '#shared/utils/schemas'
import { mealKey } from '#shared/utils/mealKey'

// A hand correction of one meal's figures. Stored as source 'manual', which the estimator's
// upsert never overwrites — so a fixed "Costco pizza" stays fixed across every spelling of it.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const body = await readValidatedJson(event, zMealCorrect)
  const key = mealKey(body.text)
  if (!key) throw createError({ statusCode: 400, message: 'That meal text has nothing to key on' })

  const db = getDb(event)
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO meal_estimates (key, text, kcal, protein_g, carbs_g, fat_g, confidence, assumptions, source, model, prompt_hash, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'high', 'corrected by hand', 'manual', NULL, NULL, ?7, ?7)
    ON CONFLICT(key) DO UPDATE SET
      kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
      confidence = 'high', assumptions = 'corrected by hand', source = 'manual', model = NULL, prompt_hash = NULL,
      updated_at = excluded.updated_at
  `).bind(key, body.text, body.kcal, body.protein_g, body.carbs_g, body.fat_g, now).run()

  const [estimate] = await estimatesForKeys(db, [key])
  return { estimate }
})
