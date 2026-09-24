export default defineEventHandler(async (event) => {
  // Deliberately not demo: real lab PDFs live here and the demo persona has sources: [] —
  // an explicit role list keeps a demo session from fetching a real PDF by guessing its key.
  requireRole(event, 'owner', 'friend', 'doctor')

  const key = decodeObjectKey(getRouterParam(event, 'key'))
  // Only lab PDFs: the bucket also holds the demo seed and the database backups.
  if (!isLabPdfKey(key)) throw createError({ statusCode: 404, message: 'Not found' })

  return serveR2Object(event, getLabsBucket(event), key, 'application/pdf')
})
