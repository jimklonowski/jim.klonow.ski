export default defineEventHandler(async (event) => {
  // Deliberately not demo: real lab PDFs live here and the demo persona has sources: [] —
  // an explicit role list keeps a demo session from fetching a real PDF by guessing its key.
  requireRole(event, 'owner', 'friend', 'doctor')

  const key = decodeObjectKey(getRouterParam(event, 'key'))

  return serveR2Object(event, getLabsBucket(event), key, 'application/pdf')
})
