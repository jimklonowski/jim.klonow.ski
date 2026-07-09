export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const db = getDb(event)
  const { results } = await db.prepare('SELECT * FROM dexa_entries ORDER BY date ASC').all()

  return (results ?? []).map(parseDexaRow)
})
