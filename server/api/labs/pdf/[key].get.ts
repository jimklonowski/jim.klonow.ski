export default defineEventHandler(async (event) => {
  // Deliberately not demo: real lab PDFs live here and the demo persona has sources: [] —
  // an explicit role list keeps a demo session from fetching a real PDF by guessing its key.
  requireRole(event, 'owner', 'friend', 'doctor')

  const key = decodeObjectKey(getRouterParam(event, 'key'))

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
