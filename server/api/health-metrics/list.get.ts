export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const range = dateRange(event, 'date')
  return withEtag(event, await listRows(event, `SELECT * FROM health_metrics ${range.where} ORDER BY date ASC`, parseHealthMetricsRow, { binds: range.binds }))
})
