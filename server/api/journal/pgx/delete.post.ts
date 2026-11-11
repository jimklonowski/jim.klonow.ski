import { zIdOnly } from '#shared/utils/schemas'

// Hard delete; the audit log keeps the row (auditedDelete makes the delete and its entry one
// transaction).
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)
  const { id } = await readValidatedJson(event, zIdOnly)
  await auditedDelete(event, 'pgx_notes', id, before => `${before.gene} note`)
  return { ok: true }
})
