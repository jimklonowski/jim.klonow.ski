// Removes one entry (by index) from a day's `sodas` array - lets the dashboard widget undo a mis-tap.
//
// Done as a single atomic UPDATE via SQLite's json_remove rather than SELECT-then-JS-splice-then-
// UPDATE, for the same lost-update-under-concurrency reason as soda.post.ts.
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<{ date?: string, index?: number }>(event)
  if (!body?.date || typeof body.index !== 'number') {
    throw createError({ statusCode: 400, message: 'Missing date or index field' })
  }

  const db = getDb(event)
  const row = await db.prepare(`
    UPDATE journal_entries SET sodas = json_remove(sodas, '$[' || CAST(?2 AS INTEGER) || ']') WHERE date = ?1
    RETURNING sodas
  `).bind(body.date, body.index).first<{ sodas: string }>()

  const sodas = JSON.parse(row?.sodas ?? '[]') as Array<{ time: string, drink?: string, size?: string }>
  return { ok: true, date: body.date, sodas }
})
