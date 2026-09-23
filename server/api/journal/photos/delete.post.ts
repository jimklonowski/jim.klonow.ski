import { zIdOnly } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  const row = await db.prepare('SELECT r2_key, thumb_r2_key FROM progress_photos WHERE id = ?1').bind(id).first<{ r2_key: string, thumb_r2_key: string | null }>()
  if (!row) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const bucket = getPhotosBucket(event)
  await bucket.delete(row.r2_key)
  if (row.thumb_r2_key) await bucket.delete(row.thumb_r2_key)
  await db.prepare('DELETE FROM progress_photos WHERE id = ?1').bind(id).run()

  return { ok: true }
})
