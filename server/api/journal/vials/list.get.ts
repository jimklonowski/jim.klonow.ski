export default defineEventHandler(async (event) => {
  // owner + demo: the vial inventory is one of the showcase features, and for demo every
  // query lands in the sandbox DB. friend/doctor never had this page.
  requireRole(event, 'owner', 'demo')

  const db = getDb(event)
  const { results } = await db.prepare(
    'SELECT * FROM vials ORDER BY status ASC, compound ASC, id ASC'
  ).all()

  return (results ?? []).map(parseVialRow)
})
