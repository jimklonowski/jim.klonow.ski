// Hard delete — a vaccination row is a dated fact, so there is no "stopped" state to prefer
// over deleting; this is for typos and duplicates.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<{ id?: number }>(event)
  if (body?.id == null) {
    throw createError({ statusCode: 400, message: 'Missing id field' })
  }

  const db = getDb(event)
  await db.prepare('DELETE FROM vaccinations WHERE id = ?1').bind(body.id).run()

  return { ok: true }
})
