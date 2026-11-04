import { zIdOnly } from '#shared/utils/schemas'

// Hard delete, for typos and duplicates — a visit is a dated fact with no "stopped" state. The
// delete and its audit entry are one transaction (auditedDelete).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const { id } = await readValidatedJson(event, zIdOnly)
  await auditedDelete(event, 'phlebotomies', id, before => `${before.date} ${before.kind}`)
  return { ok: true }
})
