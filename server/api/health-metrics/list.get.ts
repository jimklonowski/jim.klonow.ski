export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  return listRows(event, 'SELECT * FROM health_metrics ORDER BY date ASC', parseHealthMetricsRow)
})
