export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'owner', 'friend', 'demo')

  const rawKey = getRouterParam(event, 'key')
  if (!rawKey) {
    throw createError({ statusCode: 400, message: 'Missing key' })
  }
  const key = decodeURIComponent(rawKey)

  // The photos bucket is shared between real and demo data; the demo/ prefix is the wall.
  // A demo session must never be able to fetch a real progress photo by guessing its key.
  if (auth.role === 'demo' && !key.startsWith('demo/')) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const bucket = getPhotosBucket(event)
  const object = await bucket.get(key)
  if (!object) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Length': String(object.size),
      'Cache-Control': 'private, max-age=3600'
    }
  })
})
