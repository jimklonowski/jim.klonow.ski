export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'owner', 'friend', 'demo')

  const key = decodeObjectKey(getRouterParam(event, 'key'))

  // The photos bucket is shared between real and demo data; the demo/ prefix is the wall.
  // A demo session must never be able to fetch a real progress photo by guessing its key.
  if (auth.role === 'demo' && !key.startsWith('demo/')) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  // Guests only get files a live photo row points at. The owner is exempt on purpose: a deleted
  // photo's files outlive the row for the change-history undo window (audit:purge collects them
  // weeks later), and only the owner should be able to see a photo while it's in that limbo.
  if (auth.role !== 'owner') {
    const row = await getDb(event)
      .prepare('SELECT 1 FROM progress_photos WHERE r2_key = ?1 OR thumb_r2_key = ?1')
      .bind(key).first()
    if (!row) throw createError({ statusCode: 404, message: 'Not found' })
  }

  return serveR2Object(event, getPhotosBucket(event), key, 'application/octet-stream')
})
