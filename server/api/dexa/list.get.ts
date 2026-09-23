export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  return listRows(event, 'SELECT * FROM dexa_entries ORDER BY date ASC', parseDexaRow)
})
