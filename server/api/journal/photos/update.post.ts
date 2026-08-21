const CATEGORIES = ['chest', 'left_bicep', 'right_bicep', 'face', 'hairline'] as const

export default defineEventHandler(async (event) => {
  requireOwner(event)

  const body = await readBody<{
    id?: number
    date?: string
    category?: string
    frameOffsetX?: number
    frameOffsetY?: number
    frameScale?: number
  }>(event)
  if (body?.id == null) {
    throw createError({ statusCode: 400, message: 'Missing photo id' })
  }

  const sets: string[] = []
  const values: unknown[] = []
  function addSet(column: string, value: unknown) {
    sets.push(`${column} = ?${sets.length + 1}`)
    values.push(value)
  }

  if (body.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      throw createError({ statusCode: 400, message: 'Invalid date' })
    }
    addSet('date', body.date)
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category as typeof CATEGORIES[number])) {
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
  values.push(body.id)
  await db.prepare(`UPDATE progress_photos SET ${sets.join(', ')} WHERE id = ?${sets.length + 1}`).bind(...values).run()

  return { ok: true }
})
