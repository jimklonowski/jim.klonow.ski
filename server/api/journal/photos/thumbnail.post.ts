// Uploaded as a small follow-up request after the main photo (see upload.post.ts) rather than
// bundled into one multipart request, so the main upload stays a single cheap raw-body PUT -
// multipart parsing on Workers is itself real CPU cost on a multi-MB body.
import { zPhotoThumbnailQuery } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = validatedQuery(event, zPhotoThumbnailQuery)

  const db = getDb(event)
  const row = await db.prepare('SELECT r2_key FROM progress_photos WHERE id = ?1').bind(id).first<{ r2_key: string }>()
  if (!row) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const data = await readRawBody(event, false)
  if (!data?.length) {
    throw createError({ statusCode: 400, message: 'No thumbnail data' })
  }

  const thumbKey = row.r2_key.replace(/\.[^.]+$/, '-thumb.jpg')

  const bucket = getPhotosBucket(event)
  await bucket.put(thumbKey, data, { httpMetadata: { contentType: 'image/jpeg' } })
  await db.prepare('UPDATE progress_photos SET thumb_r2_key = ?1 WHERE id = ?2').bind(thumbKey, id).run()

  return { ok: true, thumbUrl: toPhotoUrl(thumbKey) }
})
