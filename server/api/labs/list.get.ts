export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  return listRows(event, 'SELECT * FROM labs_entries ORDER BY date ASC', parseLabsRow)
})
