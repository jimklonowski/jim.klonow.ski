import { zMarkerGoalSave } from '#shared/utils/schemas'

// Insert (no id) or update (id present) a marker goal. Write access like the other journal
// facts: the owner, or a demo session into its sandbox (audited for the owner only).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id, ...g } = await readValidatedJson(event, zMarkerGoalSave)
  const db = getDb(event)
  const summary = `${g.marker} ${g.comparator}${g.target != null ? ` ${g.target}` : ''}${g.by_date ? ` by ${g.by_date}` : ''}`

  // A goal names the cycle it gates, and that cycle can be deleted while the form is open: the
  // write then fails on the foreign key, which used to surface as a bare 500 (audit #44 item 38).
  const write = async (stmt: D1PreparedStatement) => {
    try {
      return await stmt.run()
    }
    catch (err) {
      if (isForeignKeyError(err)) throw createError({ statusCode: 409, message: 'That cycle no longer exists. Pick another one, or none, and save again.' })
      throw err
    }
  }

  if (id != null) {
    const before = await auditBefore(event, 'marker_goals', id)
    const res = await write(db.prepare(`
      UPDATE marker_goals SET marker = ?2, comparator = ?3, target = ?4, by_date = ?5, cycle_id = ?6, stated = ?7, note = ?8
      WHERE id = ?1
    `).bind(id, g.marker, g.comparator, g.target, g.by_date, g.cycle_id, g.stated, g.note))
    // No row by that id (deleted in another tab): the save changed nothing, so it must not say ok.
    if (!res.meta.changes) throw createError({ statusCode: 404, message: 'That goal no longer exists. Reload the page.' })
    await recordAudit(event, { table: 'marker_goals', key: id, before, summary })
    return { ok: true, id }
  }

  const result = await write(db.prepare(`
    INSERT INTO marker_goals (marker, comparator, target, by_date, cycle_id, stated, note, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  `).bind(g.marker, g.comparator, g.target, g.by_date, g.cycle_id, g.stated, g.note, new Date().toISOString()))
  await recordAudit(event, { table: 'marker_goals', key: result.meta.last_row_id, before: null, summary })
  return { ok: true, id: result.meta.last_row_id }
})
