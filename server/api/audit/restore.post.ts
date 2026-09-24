import { zAuditRestore } from '#shared/utils/schemas'

// Puts one history entry's before-image back (see restoreAudit in server/utils/audit.ts).
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { id } = await readValidatedJson(event, zAuditRestore)
  return { ok: true, ...await restoreAudit(getRealDb(event), id) }
})
