import { zIdOnly } from '#shared/utils/schemas'

// Hard delete — a vaccination row is a dated fact, so there is no "stopped" state to prefer
// over deleting; this is for typos and duplicates.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  const before = await auditBefore(event, 'vaccinations', id)
  await db.prepare('DELETE FROM vaccinations WHERE id = ?1').bind(id).run()
  if (before) await recordAudit(event, { table: 'vaccinations', key: id, before, deleted: true, summary: `${before.date} ${before.vaccine}` })

  return { ok: true }
})
