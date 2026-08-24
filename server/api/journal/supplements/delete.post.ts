// Hard delete — for typos and duplicates. Discontinuing a supplement should instead set
// `stopped` via save, so the row survives as history for the AI prompts.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<{ id?: number }>(event)
  if (body?.id == null) {
    throw createError({ statusCode: 400, message: 'Missing id field' })
  }

  const db = getDb(event)
  await db.prepare('DELETE FROM supplements WHERE id = ?1').bind(body.id).run()

  return { ok: true }
})
