export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const range = dateRange(event, 'date')
  return withEtag(event, await listRows(event, `SELECT * FROM dexa_entries ${range.where} ORDER BY date ASC`, parseDexaRow, { binds: range.binds }))
})
