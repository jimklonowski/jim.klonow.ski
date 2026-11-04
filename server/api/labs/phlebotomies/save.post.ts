import { zPhlebotomySave } from '#shared/utils/schemas'

// Insert (no id) or update (id present) a phlebotomy. Write access like the other journal
// facts: the owner, or a demo session into its sandbox (audited for the owner only).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id, ...fields } = await readValidatedJson(event, zPhlebotomySave)
  const db = getDb(event)
  const summary = `${fields.date} ${fields.kind}${fields.ml != null ? ` ${fields.ml} mL` : ''}`

  if (id != null) {
    const before = await auditBefore(event, 'phlebotomies', id)
    await db.prepare(`
      UPDATE phlebotomies SET date = ?2, kind = ?3, ml = ?4, pre_hgb = ?5, notes = ?6
      WHERE id = ?1
    `).bind(id, fields.date, fields.kind, fields.ml, fields.pre_hgb, fields.notes).run()
    await recordAudit(event, { table: 'phlebotomies', key: id, before, summary })
    return { ok: true, id }
  }

  const result = await db.prepare(`
    INSERT INTO phlebotomies (date, kind, ml, pre_hgb, notes, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(fields.date, fields.kind, fields.ml, fields.pre_hgb, fields.notes, new Date().toISOString()).run()
  await recordAudit(event, { table: 'phlebotomies', key: result.meta.last_row_id, before: null, summary })
  return { ok: true, id: result.meta.last_row_id }
})
