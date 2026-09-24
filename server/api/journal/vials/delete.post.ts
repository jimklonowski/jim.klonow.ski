import { zIdOnly } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  const before = await auditBefore(event, 'vials', id)
  await db.prepare('DELETE FROM vials WHERE id = ?1').bind(id).run()
  if (before) await recordAudit(event, { table: 'vials', key: id, before, deleted: true, summary: `${before.compound} ${before.vial_amount} ${before.vial_unit}` })

  return { ok: true }
})
