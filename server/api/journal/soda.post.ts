// Lightweight quick-add used by the dashboard soda widget - appends one entry to today's
// (or a given day's) `sodas` array without touching the rest of the journal_entries row,
// so it doesn't require loading the full day's entry form.
//
// The append happens inside a single INSERT ... ON CONFLICT statement via SQLite's json_insert
// (with the '$[#]' append path), rather than a SELECT-then-JS-modify-then-UPDATE - the latter
// raced under rapid repeated taps (two requests could both read the array before either write
// landed, so the second write would silently clobber the first's addition). The updated array is
// fetched with a follow-up SELECT rather than `... RETURNING sodas` - see soda.delete.ts for why.
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<{ date?: string, time?: string, drink?: string, size?: string }>(event)
  const date = body?.date || new Date().toISOString().slice(0, 10)
  const time = body?.time || new Date().toTimeString().slice(0, 5)
  const entry = JSON.stringify({ time, drink: body?.drink || undefined, size: body?.size || undefined })

  const db = getDb(event)
  await db.prepare(`
    INSERT INTO journal_entries (date, sodas) VALUES (?1, json_array(json(?2)))
    ON CONFLICT(date) DO UPDATE SET sodas = json_insert(sodas, '$[#]', json(?2))
  `).bind(date, entry).run()

  const row = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(date).first<{ sodas: string }>()
  const sodas = JSON.parse(row!.sodas) as Array<{ time: string, drink?: string, size?: string }>
  return { ok: true, date, sodas }
})
