export default defineEventHandler(async (event) => {
  requireRole(event, 'owner', 'friend', 'demo')

  return listRows(event, 'SELECT * FROM progress_photos ORDER BY date ASC, id ASC', parseProgressPhotoRow)
})
