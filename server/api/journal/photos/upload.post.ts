const CATEGORIES = ['chest', 'left_bicep', 'right_bicep', 'face_hairline'] as const

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif'
}

export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData?.length) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const photo = formData.find(p => p.type?.startsWith('image/'))
  if (!photo) {
    throw createError({ statusCode: 400, message: 'No image file found in request' })
  }

  const category = formData.find(p => p.name === 'category')?.data?.toString() ?? ''
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    throw createError({ statusCode: 400, message: 'Invalid or missing category' })
  }

  // The client already parses EXIF and sends a resolved date on the common path - only pay for
  // a server-side EXIF parse (real CPU cost on a full-res photo, and Workers CPU time is tight)
  // when it didn't, e.g. a non-JS client or a request that raced ahead of the client-side parse.
  const suppliedDate = formData.find(p => p.name === 'date')?.data?.toString()
  const hasValidSuppliedDate = !!suppliedDate && /^\d{4}-\d{2}-\d{2}$/.test(suppliedDate)

  const taken_at = hasValidSuppliedDate ? suppliedDate! : await extractPhotoDate(photo.data)
  const date = taken_at ?? new Date().toISOString().slice(0, 10)

  const ext = EXT_BY_MIME[photo.type ?? ''] ?? photo.filename?.split('.').pop() ?? 'jpg'
  const r2Key = `${date}-${category}-${Date.now()}.${ext}`

  const bucket = getPhotosBucket(event)
  await bucket.put(r2Key, photo.data, {
    httpMetadata: { contentType: photo.type ?? 'application/octet-stream' }
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
