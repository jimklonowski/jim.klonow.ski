// Removes one entry (by index) from a day's `sodas` array - lets the dashboard widget undo a mis-tap.
//
// Takes `date`/`index` as query params rather than a JSON body - a DELETE with a body reliably
// hung forever in production (confirmed via console.log tracing under `wrangler tail`: execution
// stalled inside `readBody`, never even reaching the DB call). DELETE-with-body is non-standard
// enough that something in Cloudflare's edge path doesn't forward it faithfully to the Worker.
//
// The removal itself is a single atomic UPDATE via SQLite's json_remove rather than SELECT-then-
// JS-splice-then-UPDATE, for the same lost-update-under-concurrency reason as soda.post.ts. The
// updated array is fetched with a follow-up SELECT rather than an `UPDATE ... RETURNING`, which
// separately also hung when it landed within ~1s of another write to the same row.
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const query = getQuery(event)
  const date = typeof query.date === 'string' ? query.date : undefined
  const index = typeof query.index === 'string' ? Number(query.index) : NaN
  if (!date || !Number.isInteger(index)) {
    throw createError({ statusCode: 400, message: 'Missing date or index field' })
  }

  const db = getDb(event)
  await db.prepare(`
    UPDATE journal_entries SET sodas = json_remove(sodas, '$[' || CAST(?2 AS INTEGER) || ']') WHERE date = ?1
  `).bind(date, index).run()

  const row = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(date).first<{ sodas: string }>()
  const sodas = JSON.parse(row?.sodas ?? '[]') as Array<{ time: string, drink?: string, size?: string }>
  return { ok: true, date, sodas }
})
