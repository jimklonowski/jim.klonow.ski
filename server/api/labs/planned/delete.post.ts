import { zIdOnly } from '#shared/utils/schemas'

// Hard delete — a plan is a booking, not history; the draw it led to (if any) is its own
// labs_entries row and stays. Audited, so /tools/data can put a plan back.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  const before = await auditBefore(event, 'planned_draws', id)
  await db.prepare('DELETE FROM planned_draws WHERE id = ?1').bind(id).run()
  if (before) {
    await recordAudit(event, { table: 'planned_draws', key: id, before, deleted: true, summary: `${before.date}${before.lab ? ` ${before.lab}` : ''}` })
  }

  return { ok: true }
})
