import { localToday } from '#shared/utils/time'

// The owner's whole record as one JSON download — every table, in the same format as the weekly
// backup (shared/utils/backup.ts), so scripts/restore-backup.mjs can load it too. OAuth tokens
// and operational tables are left out, as in the backup. Always the real database.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { backup } = await snapshotDatabase(getRealDb(event), 'jim-klonow-ski-db')
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="jim-klonow-ski-export-${localToday()}.json"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return JSON.stringify(backup)
})
