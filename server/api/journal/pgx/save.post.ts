import { zPgxNoteSave } from '#shared/utils/schemas'

// Insert (no id) or update (id present) a drug-gene note. Write access like the other journal
// facts: the owner, or a demo session into its sandbox (audited for the owner only).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id, ...n } = await readValidatedJson(event, zPgxNoteSave)
  const db = getDb(event)
  // The audit summary names the gene only: the history list is not the place for a genotype.
  const summary = `${n.gene} note`
  const compounds = JSON.stringify(n.compounds)
  const markers = JSON.stringify(n.markers)

  if (id != null) {
    const before = await auditBefore(event, 'pgx_notes', id)
    await db.prepare('UPDATE pgx_notes SET gene = ?2, genotype = ?3, compounds = ?4, markers = ?5, note = ?6 WHERE id = ?1')
      .bind(id, n.gene, n.genotype, compounds, markers, n.note).run()
    await recordAudit(event, { table: 'pgx_notes', key: id, before, summary })
    return { ok: true, id }
  }

  const result = await db.prepare('INSERT INTO pgx_notes (gene, genotype, compounds, markers, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(n.gene, n.genotype, compounds, markers, n.note, new Date().toISOString()).run()
  await recordAudit(event, { table: 'pgx_notes', key: result.meta.last_row_id, before: null, summary })
  return { ok: true, id: result.meta.last_row_id }
})
