export default defineEventHandler(async (event) => {
  requireRole(event, 'owner', 'friend', 'demo')

  const range = dateRange(event, 'date')
  return withEtag(event, await listRows(event, `SELECT * FROM progress_photos ${range.where} ORDER BY date ASC, id ASC`, parseProgressPhotoRow, { binds: range.binds }))
})
