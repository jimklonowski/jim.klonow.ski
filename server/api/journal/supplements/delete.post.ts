import { zIdOnly } from '#shared/utils/schemas'

// Hard delete — for typos and duplicates. Discontinuing a supplement should instead set
// `stopped` via save, so the row survives as history for the AI prompts.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  const before = await auditBefore(event, 'supplements', id)
  await db.prepare('DELETE FROM supplements WHERE id = ?1').bind(id).run()
  if (before) await recordAudit(event, { table: 'supplements', key: id, before, deleted: true, summary: [before.name, before.dose].filter(Boolean).join(' ') })

  return { ok: true }
})
