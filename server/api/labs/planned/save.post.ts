import { zPlannedDrawSave } from '#shared/utils/schemas'

// Insert a new planned draw (no id) or update one (id present). Owner-only, like cycles and
// shots: the demo sandbox's plan is seeded showcase data. labs_date normally arrives set by the
// upload save (save-json.post.ts) and round-trips through the edit form untouched.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readValidatedJson(event, zPlannedDrawSave)

  // A checkpoint link is both halves or neither: a key without its cycle (or the reverse) would
  // read as a booked checkpoint on no cycle's dossier.
  if ((body.cycle_id == null) !== (body.checkpoint_key == null)) {
    throw createError({ statusCode: 400, message: 'cycle_id and checkpoint_key go together' })
  }

  const db = getDb(event)
  const summary = `${body.date}${body.lab ? ` ${body.lab}` : ''}`
  const fasting = body.fasting ? 1 : 0

  if (body.id != null) {
    const before = await auditBefore(event, 'planned_draws', body.id)
    await db.prepare(`
      UPDATE planned_draws SET
        date = ?2, lab = ?3, panel = ?4, fasting = ?5, purpose = ?6,
        cycle_id = ?7, checkpoint_key = ?8, labs_date = ?9
      WHERE id = ?1
    `).bind(body.id, body.date, body.lab, body.panel, fasting, body.purpose, body.cycle_id, body.checkpoint_key, body.labs_date).run()
    await recordAudit(event, { table: 'planned_draws', key: body.id, before, summary })
    return { ok: true, id: body.id }
  }

  const result = await db.prepare(`
    INSERT INTO planned_draws (date, lab, panel, fasting, purpose, cycle_id, checkpoint_key, labs_date, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `).bind(body.date, body.lab, body.panel, fasting, body.purpose, body.cycle_id, body.checkpoint_key, body.labs_date, new Date().toISOString()).run()
  await recordAudit(event, { table: 'planned_draws', key: result.meta.last_row_id, before: null, summary })

  return { ok: true, id: result.meta.last_row_id }
})
