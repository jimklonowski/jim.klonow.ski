import { zIdOnly } from '#shared/utils/schemas'

// Hard delete — for abandoned drafts and mistakes. A cycle that actually ran should instead
// get actual_end set via save, so it survives as history for the dossier and the AI prompts.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  const before = await auditBefore(event, 'cycles', id)
  await db.prepare('DELETE FROM cycles WHERE id = ?1').bind(id).run()
  if (before) await recordAudit(event, { table: 'cycles', key: id, before, deleted: true, summary: String(before.name) })

  return { ok: true }
})
