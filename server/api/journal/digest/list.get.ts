export default defineEventHandler(async (event) => {
  requireRole(event, 'owner', 'friend', 'demo')

  return listRows(event, 'SELECT * FROM digests ORDER BY period_end DESC, id DESC LIMIT 60', parseDigestRow)
})
