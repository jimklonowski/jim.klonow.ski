export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const db = getDb(event)
  const { results } = await db.prepare('SELECT * FROM progress_photos ORDER BY date ASC, id ASC').all()

  return (results ?? []).map(parseProgressPhotoRow)
})
