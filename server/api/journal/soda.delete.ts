// Removes one entry (by index) from a day's `sodas` array - lets the dashboard widget undo a mis-tap.
//
// The removal itself is a single atomic UPDATE via SQLite's json_remove rather than SELECT-then-
// JS-splice-then-UPDATE, for the same lost-update-under-concurrency reason as soda.post.ts. The
// updated array is fetched with a follow-up SELECT rather than an `UPDATE ... RETURNING` - the
// latter reliably hung the Workers D1 binding when it landed within ~1s of another write to the
// same row (confirmed: the raw SQL runs instantly via `wrangler d1 execute`, so this is specific
// to how the binding handles RETURNING on an UPDATE, not the query itself).
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<{ date?: string, index?: number }>(event)
  if (!body?.date || typeof body.index !== 'number') {
    throw createError({ statusCode: 400, message: 'Missing date or index field' })
  }

  const db = getDb(event)
  await db.prepare(`
    UPDATE journal_entries SET sodas = json_remove(sodas, '$[' || CAST(?2 AS INTEGER) || ']') WHERE date = ?1
  `).bind(body.date, body.index).run()

  const row = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(body.date).first<{ sodas: string }>()
  const sodas = JSON.parse(row?.sodas ?? '[]') as Array<{ time: string, drink?: string, size?: string }>
  return { ok: true, date: body.date, sodas }
})
