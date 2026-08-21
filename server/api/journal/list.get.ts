export default defineEventHandler(async (event) => {
  const auth = requireLabsAuth(event)

  const db = getDb(event)
  const { results } = await db.prepare('SELECT * FROM journal_entries ORDER BY date ASC').all()
  const entries = (results ?? []).map(parseJournalRow)

  // The doctor view is vitals + protocol: personal notes and the soda log stay owner/friend-only.
  if (auth.role === 'doctor') {
    return entries.map(e => ({ ...e, notes: null, sodas: [] }))
  }
  return entries
})
