import { localToday } from '#shared/utils/time'
import { zPhotoUploadQuery } from '#shared/utils/schemas'
import { wipeGps } from '#shared/utils/exifGps'

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

  // Only a known image type is stored as the object's content type: the proxy serves it back
  // verbatim to the friend role, so a client's arbitrary header must never become the served
  // type. Anything else is stored as plain bytes (an <img> decodes by content, not by header).
  const declared = getHeader(event, 'content-type') ?? ''
  const contentType = EXT_BY_MIME[declared] ? declared : 'application/octet-stream'
  const data = await readRawBody(event, false)
  if (!data?.length) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  // The client already parses EXIF and sends a resolved date on the common path - only pay for
  // a server-side EXIF parse (real CPU cost on a full-res photo, and Workers CPU time is tight)
  // when it didn't, e.g. a non-JS client or a request that raced ahead of the client-side parse.
  const taken_at = suppliedDate ?? await extractPhotoDate(data)
  const date = taken_at ?? localToday()

  // Phone cameras GPS-tag by default, and originals are served to the friend role — wipe the
  // coordinates before anything is stored. In-place byte edit, no decode/re-encode: pixels,
  // orientation and the date tags above are untouched. `scripts/strip-photo-gps.mjs` applies
  // the same wipe to photos uploaded before this existed.
  wipeGps(data)

  const ext = EXT_BY_MIME[contentType] ?? 'jpg'
  const r2Key = `${date}-${category}-${Date.now()}.${ext}`
  const created_at = new Date().toISOString()

  // The row first, then the file: with the file stored first, an INSERT that failed left an
  // object in the bucket nothing would ever name or delete (audit #43 item 45). A row whose file
  // then fails to land is worse than no row (a gallery entry that 404s), so a failed put takes
  // the row back out before the error reaches the caller.
  const db = getDb(event)
  const result = await db.prepare(`
    INSERT INTO progress_photos (date, category, r2_key, taken_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `).bind(date, category, r2Key, taken_at, created_at).run()
  const id = result.meta.last_row_id

  const bucket = getPhotosBucket(event)
  try {
    await bucket.put(r2Key, data, { httpMetadata: { contentType } })
  }
  catch (err) {
    await db.prepare('DELETE FROM progress_photos WHERE id = ?1').bind(id).run().catch(() => {})
    throw err
  }
  await recordAudit(event, { table: 'progress_photos', key: id, before: null, summary: `photo ${date} ${category}` })

  return parseProgressPhotoRow({
    id,
    date,
    category,
    r2_key: r2Key,
    taken_at,
    created_at
  })
})
