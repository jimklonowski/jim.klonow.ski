import { doctorJournalEntry } from '#shared/utils/journalProjection'

export default defineEventHandler(async (event) => {
  const auth = requireLabsAuth(event)

  const range = dateRange(event, 'date')
  const entries = await listRows(event, `SELECT * FROM journal_entries ${range.where} ORDER BY date ASC`, parseJournalRow, { binds: range.binds })

  // The doctor view is vitals + protocol: an allowlist projection (shared/utils/journalProjection.ts,
  // with a no-leak test), so a column added later is private by default.
  if (auth.role === 'doctor') return withEtag(event, entries.map(doctorJournalEntry))
  return withEtag(event, entries)
})
