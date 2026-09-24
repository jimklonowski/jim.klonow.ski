import { localToday } from '#shared/utils/time'
import { zPhotoUploadQuery } from '#shared/utils/schemas'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif'
}

export default defineEventHandler(async (event) => {
  requireOwner(event)

  // Raw binary body + query-string metadata rather than multipart/form-data - h3's multipart
  // parser has to scan the whole body for boundary markers, which is real CPU work on a
  // multi-MB photo and was itself enough to trip Workers' tight per-request CPU time limit even
  // after removing the redundant server-side EXIF parse below.
  const { category, date: suppliedDate } = validatedQuery(event, zPhotoUploadQuery)

  const contentType = getHeader(event, 'content-type') ?? 'application/octet-stream'
  const data = await readRawBody(event, false)
  if (!data?.length) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  // The client already parses EXIF and sends a resolved date on the common path - only pay for
  // a server-side EXIF parse (real CPU cost on a full-res photo, and Workers CPU time is tight)
  // when it didn't, e.g. a non-JS client or a request that raced ahead of the client-side parse.
  const taken_at = suppliedDate ?? await extractPhotoDate(data)
  const date = taken_at ?? localToday()

  const ext = EXT_BY_MIME[contentType] ?? 'jpg'
  const r2Key = `${date}-${category}-${Date.now()}.${ext}`

  const bucket = getPhotosBucket(event)
  await bucket.put(r2Key, data, {
    httpMetadata: { contentType }
  })

  const created_at = new Date().toISOString()

  const db = getDb(event)
  const result = await db.prepare(`
    INSERT INTO progress_photos (date, category, r2_key, taken_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `).bind(date, category, r2Key, taken_at, created_at).run()

  return parseProgressPhotoRow({
    id: result.meta.last_row_id,
    date,
    category,
    r2_key: r2Key,
    taken_at,
    created_at
  })
})
