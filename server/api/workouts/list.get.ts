export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const db = getDb(event)
  const { results } = await db.prepare('SELECT * FROM workouts ORDER BY date ASC').all()

  return (results ?? []).map(parseWorkoutRow)
})
