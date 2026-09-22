import { zIdOnly } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  await db.prepare('DELETE FROM vials WHERE id = ?1').bind(id).run()

  return { ok: true }
})
