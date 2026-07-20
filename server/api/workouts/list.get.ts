export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const db = getDb(event)
  const { results } = await db.prepare('SELECT * FROM workouts ORDER BY date ASC').all()

  // Whoop + Apple Health + Peloton can each record the same session; merge them at read time.
  return mergeWorkouts((results ?? []).map(parseWorkoutRow))
})
