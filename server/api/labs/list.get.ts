export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const range = dateRange(event, 'date')
  return withEtag(event, await listRows(event, `SELECT * FROM labs_entries ${range.where} ORDER BY date ASC`, parseLabsRow, { binds: range.binds }))
})
