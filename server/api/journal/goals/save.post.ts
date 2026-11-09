import { zMarkerGoalSave } from '#shared/utils/schemas'

// Insert (no id) or update (id present) a marker goal. Write access like the other journal
// facts: the owner, or a demo session into its sandbox (audited for the owner only).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id, ...g } = await readValidatedJson(event, zMarkerGoalSave)
  const db = getDb(event)
  const summary = `${g.marker} ${g.comparator}${g.target != null ? ` ${g.target}` : ''}${g.by_date ? ` by ${g.by_date}` : ''}`

  if (id != null) {
    const before = await auditBefore(event, 'marker_goals', id)
    await db.prepare(`
      UPDATE marker_goals SET marker = ?2, comparator = ?3, target = ?4, by_date = ?5, cycle_id = ?6, stated = ?7, note = ?8
      WHERE id = ?1
    `).bind(id, g.marker, g.comparator, g.target, g.by_date, g.cycle_id, g.stated, g.note).run()
    await recordAudit(event, { table: 'marker_goals', key: id, before, summary })
    return { ok: true, id }
  }

  const result = await db.prepare(`
    INSERT INTO marker_goals (marker, comparator, target, by_date, cycle_id, stated, note, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `).bind(g.marker, g.comparator, g.target, g.by_date, g.cycle_id, g.stated, g.note, new Date().toISOString()).run()
  await recordAudit(event, { table: 'marker_goals', key: result.meta.last_row_id, before: null, summary })
  return { ok: true, id: result.meta.last_row_id }
})
