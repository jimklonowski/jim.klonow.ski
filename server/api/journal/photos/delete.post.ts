export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<Record<string, unknown>>(event)
  if (body?.id == null) {
    throw createError({ statusCode: 400, message: 'Missing photo id' })
  }

  const db = getDb(event)
  const row = await db.prepare('SELECT r2_key, thumb_r2_key FROM progress_photos WHERE id = ?1').bind(body.id).first<{ r2_key: string, thumb_r2_key: string | null }>()
  if (!row) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const bucket = getPhotosBucket(event)
  await bucket.delete(row.r2_key)
  if (row.thumb_r2_key) await bucket.delete(row.thumb_r2_key)
  await db.prepare('DELETE FROM progress_photos WHERE id = ?1').bind(body.id).run()

  return { ok: true }
})
