import { zIdOnly } from '#shared/utils/schemas'

// Hard delete — a vaccination row is a dated fact, so there is no "stopped" state to prefer
// over deleting; this is for typos and duplicates. The delete and its audit entry are one
// transaction (auditedDelete).
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zIdOnly)
  await auditedDelete(event, 'vaccinations', id, before => `${before.date} ${before.vaccine}`)

  return { ok: true }
})
