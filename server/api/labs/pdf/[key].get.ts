export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const rawKey = getRouterParam(event, 'key')
  if (!rawKey) {
    throw createError({ statusCode: 400, message: 'Missing key' })
  }
  const key = decodeURIComponent(rawKey)

  const bucket = getLabsBucket(event)
  const object = await bucket.get(key)
  if (!object) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/pdf',
      'Content-Length': String(object.size),
      'Cache-Control': 'private, max-age=3600'
    }
  })
})
