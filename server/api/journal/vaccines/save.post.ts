import { zVaccinationSave } from '#shared/utils/schemas'

// Insert a new dose (no id) or update an existing one (id present). Owner-only rather than
// requireWriteAccess: the demo sandbox's shots are seeded read-only showcase data.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  // Blank product/notes store NULL so the prompts can skip them (zOptText).
  const { id, ...fields } = await readValidatedJson(event, zVaccinationSave)

  const db = getDb(event)

  if (id != null) {
    await db.prepare(`
      UPDATE vaccinations SET date = ?2, vaccine = ?3, product = ?4, notes = ?5
      WHERE id = ?1
    `).bind(id, fields.date, fields.vaccine, fields.product, fields.notes).run()
    return { ok: true, id }
  }

  const result = await db.prepare(`
    INSERT INTO vaccinations (date, vaccine, product, notes, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `).bind(fields.date, fields.vaccine, fields.product, fields.notes, new Date().toISOString()).run()

  return { ok: true, id: result.meta.last_row_id }
})
