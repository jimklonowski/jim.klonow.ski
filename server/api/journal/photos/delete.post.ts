import { zIdOnly } from '#shared/utils/schemas'

// Removes the photo's row. Its R2 files are deliberately left in place: the audit log keeps the
// row's before-image, so the delete can be restored from /tools/data, and the weekly audit:purge
// task removes the files once the photo has been gone 30 days (server/tasks/audit/purge.ts).
export default defineEventHandler(async (event) => {
  requireOwner(event)

  const { id } = await readValidatedJson(event, zIdOnly)

  const db = getDb(event)
  const before = await db.prepare('SELECT * FROM progress_photos WHERE id = ?1').bind(id).first<Record<string, unknown>>()
  if (!before) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  await db.prepare('DELETE FROM progress_photos WHERE id = ?1').bind(id).run()
  await recordAudit(event, { table: 'progress_photos', key: id, before, deleted: true, summary: `photo ${before.date} ${before.category}` })

  return { ok: true }
})
