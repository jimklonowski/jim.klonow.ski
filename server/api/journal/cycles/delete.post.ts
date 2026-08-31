// Hard delete — for abandoned drafts and mistakes. A cycle that actually ran should instead
// get actual_end set via save, so it survives as history for the dossier and the AI prompts.
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<{ id?: number }>(event)
  if (body?.id == null) {
    throw createError({ statusCode: 400, message: 'Missing id field' })
  }

  const db = getDb(event)
  await db.prepare('DELETE FROM cycles WHERE id = ?1').bind(body.id).run()

  return { ok: true }
})
