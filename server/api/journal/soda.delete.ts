// Removes one entry (by index) from a day's `sodas` array - lets the dashboard widget undo a mis-tap.
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<{ date?: string, index?: number }>(event)
  if (!body?.date || typeof body.index !== 'number') {
    throw createError({ statusCode: 400, message: 'Missing date or index field' })
  }

  const db = getDb(event)
  const existing = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(body.date).first<{ sodas: string }>()
  const sodas = JSON.parse(existing?.sodas ?? '[]') as Array<{ time: string, drink?: string, size?: string }>
  sodas.splice(body.index, 1)

  await db.prepare('UPDATE journal_entries SET sodas = ?2 WHERE date = ?1').bind(body.date, JSON.stringify(sodas)).run()

  return { ok: true, date: body.date, sodas }
})
