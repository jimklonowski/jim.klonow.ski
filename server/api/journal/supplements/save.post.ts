import { zSupplementSave } from '#shared/utils/schemas'

// Insert a new supplement (no id) or update an existing one (id present). Discontinuing is
// just an update that sets `stopped` — rows are kept so recent stops remain AI context.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const body = await readValidatedJson(event, zSupplementSave)

  const db = getDb(event)

  const fields = {
    ...body,
    // A stopped date only makes sense on a stopped row — clear it on reactivate.
    stopped: body.status === 'stopped' ? body.stopped : null
  }

  if (body.id != null) {
    await db.prepare(`
      UPDATE supplements SET
        name = ?2, dose = ?3, category = ?4, status = ?5, schedule = ?6, started = ?7,
        stopped = ?8, notes = ?9, sort = ?10
      WHERE id = ?1
    `).bind(
      body.id, fields.name, fields.dose, fields.category, fields.status, fields.schedule,
      fields.started, fields.stopped, fields.notes, fields.sort
    ).run()
    return { ok: true, id: body.id }
  }

  const result = await db.prepare(`
    INSERT INTO supplements (name, dose, category, status, schedule, started, stopped, notes, sort, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  `).bind(
    fields.name, fields.dose, fields.category, fields.status, fields.schedule, fields.started,
    fields.stopped, fields.notes, fields.sort, new Date().toISOString()
  ).run()

  return { ok: true, id: result.meta.last_row_id }
})
