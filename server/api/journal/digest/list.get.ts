export default defineEventHandler(async (event) => {
  requireRole(event, 'owner', 'friend')

  const db = getDb(event)
  const { results } = await db.prepare(
    'SELECT * FROM digests ORDER BY period_end DESC, id DESC LIMIT 60'
  ).all()

  return (results ?? []).map(parseDigestRow)
})
