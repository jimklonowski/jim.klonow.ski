export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const db = getDb(event)
  const { results } = await db.prepare('SELECT * FROM health_metrics ORDER BY date ASC').all()

  return (results ?? []).map(parseHealthMetricsRow)
})
