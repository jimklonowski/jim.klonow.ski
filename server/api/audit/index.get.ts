import { zAuditList } from '#shared/utils/schemas'

// The write history for /tools/data, newest first. Owner-only, always the real database.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { limit } = validatedQuery(event, zAuditList)
  try {
    return await listAudit(getRealDb(event), limit)
  }
  catch (err) {
    // Before migration 0003 reaches an environment the history is simply empty.
    if (isMissingTable(err)) return []
    throw err
  }
})
