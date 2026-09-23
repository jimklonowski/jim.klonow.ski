export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'owner', 'friend', 'demo')

  const key = decodeObjectKey(getRouterParam(event, 'key'))

  // The photos bucket is shared between real and demo data; the demo/ prefix is the wall.
  // A demo session must never be able to fetch a real progress photo by guessing its key.
  if (auth.role === 'demo' && !key.startsWith('demo/')) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  return serveR2Object(event, getPhotosBucket(event), key, 'application/octet-stream')
})
