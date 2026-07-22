// Removes one entry (by index) from a day's `sodas` array - lets the dashboard widget undo a mis-tap.
//
// The removal itself is a single atomic UPDATE via SQLite's json_remove rather than SELECT-then-
// JS-splice-then-UPDATE, for the same lost-update-under-concurrency reason as soda.post.ts. The
// updated array is fetched with a follow-up SELECT rather than an `UPDATE ... RETURNING` - the
// latter reliably hung the Workers D1 binding when it landed within ~1s of another write to the
// same row (confirmed: the raw SQL runs instantly via `wrangler d1 execute`, so this is specific
// to how the binding handles RETURNING on an UPDATE, not the query itself).
// TEMPORARY: console.log tracing to find exactly where production requests hang under
// `wrangler tail`. Remove once the hang is root-caused.
export default defineEventHandler(async (event) => {
  console.log('[soda.delete] start')
  requireLabsAuth(event)
  console.log('[soda.delete] auth ok')

  const body = await readBody<{ date?: string, index?: number }>(event)
  console.log('[soda.delete] body read', JSON.stringify(body))
  if (!body?.date || typeof body.index !== 'number') {
    throw createError({ statusCode: 400, message: 'Missing date or index field' })
  }

  const db = getDb(event)
  console.log('[soda.delete] got db binding, running UPDATE')
  await db.prepare(`
    UPDATE journal_entries SET sodas = json_remove(sodas, '$[' || CAST(?2 AS INTEGER) || ']') WHERE date = ?1
  `).bind(body.date, body.index).run()
  console.log('[soda.delete] UPDATE done, running SELECT')

  const row = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(body.date).first<{ sodas: string }>()
  console.log('[soda.delete] SELECT done', JSON.stringify(row))
  const sodas = JSON.parse(row?.sodas ?? '[]') as Array<{ time: string, drink?: string, size?: string }>
  console.log('[soda.delete] returning')
  return { ok: true, date: body.date, sodas }
})
