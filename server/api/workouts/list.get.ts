export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const range = dateRange(event, 'date')
  // Whoop + Apple Health + Peloton can each record the same session; merge them at read time.
  return withEtag(event, mergeWorkouts(await listRows(event, `SELECT * FROM workouts ${range.where} ORDER BY date ASC`, parseWorkoutRow, { binds: range.binds })))
})
