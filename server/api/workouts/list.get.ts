export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  // Whoop + Apple Health + Peloton can each record the same session; merge them at read time.
  return mergeWorkouts(await listRows(event, 'SELECT * FROM workouts ORDER BY date ASC', parseWorkoutRow))
})
