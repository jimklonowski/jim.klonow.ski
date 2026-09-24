import { zPhotoUpdate } from '#shared/utils/schemas'
import { isPhotoCategory } from '#shared/utils/photoCategories'

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readValidatedJson(event, zPhotoUpdate)

  const sets: string[] = []
  const values: unknown[] = []
  function addSet(column: string, value: unknown) {
    sets.push(`${column} = ?${sets.length + 1}`)
    values.push(value)
  }

  if (body.date !== undefined) {
    addSet('date', body.date)
  }
  if (body.category !== undefined) {
    if (!isPhotoCategory(body.category)) {
      throw createError({ statusCode: 400, message: 'Invalid category' })
    }
    addSet('category', body.category)
  }
  if (body.frameOffsetX !== undefined) addSet('frame_offset_x', body.frameOffsetX)
  if (body.frameOffsetY !== undefined) addSet('frame_offset_y', body.frameOffsetY)
  if (body.frameScale !== undefined) addSet('frame_scale', body.frameScale)

  if (!sets.length) {
    throw createError({ statusCode: 400, message: 'Nothing to update' })
  }

  const db = getDb(event)
  const before = await auditBefore(event, 'progress_photos', body.id)
  values.push(body.id)
  await db.prepare(`UPDATE progress_photos SET ${sets.join(', ')} WHERE id = ?${sets.length + 1}`).bind(...values).run()
  if (before) await recordAudit(event, { table: 'progress_photos', key: body.id, before, summary: `photo ${before.date} ${before.category}` })

  return { ok: true }
})
