export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const db = getDb(event)
  const tokens = await getWhoopTokens(db)
  return { connected: !!tokens }
})
