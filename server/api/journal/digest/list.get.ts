export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const db = getDb(event)
  const { results } = await db.prepare(
    'SELECT * FROM digests ORDER BY period_end DESC, id DESC LIMIT 60'
  ).all()

  return (results ?? []).map(parseDigestRow)
})
