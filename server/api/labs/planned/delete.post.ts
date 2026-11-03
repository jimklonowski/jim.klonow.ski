import { zIdOnly } from '#shared/utils/schemas'

// Hard delete — a plan is a booking, not history; the draw it led to (if any) is its own
// labs_entries row and stays. The delete and its audit entry are one transaction
// (auditedDelete), so /tools/data can put a plan back.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zIdOnly)
  await auditedDelete(event, 'planned_draws', id, before => `${before.date}${before.lab ? ` ${before.lab}` : ''}`)

  return { ok: true }
})
