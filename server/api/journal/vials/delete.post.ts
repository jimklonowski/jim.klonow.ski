export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<Record<string, unknown>>(event)
  if (body?.id == null) {
    throw createError({ statusCode: 400, message: 'Missing vial id' })
  }

  const db = getDb(event)
  await db.prepare('DELETE FROM vials WHERE id = ?1').bind(body.id).run()

  return { ok: true }
})
