export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const db = getDb(event)
  const { results } = await db.prepare(
    'SELECT * FROM vials ORDER BY status ASC, compound ASC, id ASC'
  ).all()

  return (results ?? []).map(parseVialRow)
})
