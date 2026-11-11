import { zDrinkLabelSave } from '#shared/utils/schemas'
import { drinkKey } from '#shared/utils/drinks'

// The figures off a drink's label, kept under the drink's name: every log of it, past and
// future, is summed from them instead of the built-in table. Write access like the other journal
// facts — the owner, or a demo session into its sandbox (audited for the owner only).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const body = await readValidatedJson(event, zDrinkLabelSave)
  const key = drinkKey(body.name)
  if (!key) throw createError({ statusCode: 400, message: 'A label needs the drink\'s name' })

  const db = getDb(event)
  const before = await auditBefore(event, 'drink_labels', key)
  await db.prepare(`INSERT INTO drink_labels (key, name, serving_oz, kcal, caffeine_mg, sodium_mg, sugar_g, barcode, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(key) DO UPDATE SET name = excluded.name, serving_oz = excluded.serving_oz, kcal = excluded.kcal,
      caffeine_mg = excluded.caffeine_mg, sodium_mg = excluded.sodium_mg, sugar_g = excluded.sugar_g,
      barcode = COALESCE(excluded.barcode, drink_labels.barcode), updated_at = excluded.updated_at`)
    .bind(key, body.name, body.serving_oz, body.kcal, body.caffeine_mg, body.sodium_mg, body.sugar_g, body.barcode, new Date().toISOString()).run()
  await recordAudit(event, {
    table: 'drink_labels',
    key,
    before,
    summary: `label for ${body.name}: ${body.kcal} kcal · ${body.sugar_g} g sugar · ${body.sodium_mg} mg sodium · ${body.caffeine_mg} mg caffeine per ${body.serving_oz} oz`
  })

  const row = await db.prepare('SELECT * FROM drink_labels WHERE key = ?1').bind(key).first<Record<string, unknown>>()
  return { label: row ? parseDrinkLabelRow(row) : null }
})
