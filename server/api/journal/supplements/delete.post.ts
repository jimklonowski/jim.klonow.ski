import { zIdOnly } from '#shared/utils/schemas'

// Hard delete — for typos and duplicates. Discontinuing a supplement should instead set
// `stopped` via save, so the row survives as history for the AI prompts.
export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  await db.prepare('DELETE FROM supplements WHERE id = ?1').bind(id).run()

  return { ok: true }
})
