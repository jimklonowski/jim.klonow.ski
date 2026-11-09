import { zIdOnly } from '#shared/utils/schemas'

// Hard delete: a goal withdrawn is gone, the audit log keeps what it said (auditedDelete makes
// the delete and its entry one transaction).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const { id } = await readValidatedJson(event, zIdOnly)
  await auditedDelete(event, 'marker_goals', id, before => `${before.marker} ${before.comparator}${before.target != null ? ` ${before.target}` : ''}`)
  return { ok: true }
})
