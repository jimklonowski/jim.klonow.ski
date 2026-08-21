export default defineEventHandler(async (event) => {
  requireOwner(event)

  const db = getDb(event)
  const tokens = await getWhoopTokens(db)
  return { connected: !!tokens }
})
