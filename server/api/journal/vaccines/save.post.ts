// Insert a new dose (no id) or update an existing one (id present). Owner-only rather than
// requireWriteAccess: the demo sandbox has no vaccinations table, so a demo session has
// nothing to write into (the list endpoint returns [] for it for the same reason).
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<Record<string, unknown>>(event)
  const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
  if (!date) {
    throw createError({ statusCode: 400, message: 'Missing or invalid date field' })
  }
  const vaccine = typeof body.vaccine === 'string' ? body.vaccine.trim() : ''
  if (!vaccine) {
    throw createError({ statusCode: 400, message: 'Missing vaccine field' })
  }

  // UInput v-models send '' for an empty field; store NULL so the prompts can skip it.
  const text = (v: unknown) => (typeof v === 'string' && v.trim()) ? v.trim() : null
  const fields = { date, vaccine, product: text(body.product), notes: text(body.notes) }

  const db = getDb(event)

  if (body.id != null) {
    await db.prepare(`
      UPDATE vaccinations SET date = ?2, vaccine = ?3, product = ?4, notes = ?5
      WHERE id = ?1
    `).bind(body.id, fields.date, fields.vaccine, fields.product, fields.notes).run()
    return { ok: true, id: body.id }
  }

  const result = await db.prepare(`
    INSERT INTO vaccinations (date, vaccine, product, notes, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `).bind(fields.date, fields.vaccine, fields.product, fields.notes, new Date().toISOString()).run()

  return { ok: true, id: result.meta.last_row_id }
})
