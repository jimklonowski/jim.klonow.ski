export default defineEventHandler(async (event) => {
  requireRole(event, 'owner', 'friend', 'demo')

  // Newest 60 by default (the panel pages through them); a range reads by period end instead.
  const range = dateRange(event, 'period_end')
  return withEtag(event, await listRows(event, `SELECT * FROM digests ${range.where} ORDER BY period_end DESC, id DESC LIMIT ${range.where ? 1000 : 60}`, parseDigestRow, { binds: range.binds }))
})
