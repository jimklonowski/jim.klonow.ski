// Lightweight quick-add used by the dashboard soda widget - appends one entry to today's
// (or a given day's) `sodas` array without touching the rest of the journal_entries row,
// so it doesn't require loading the full day's entry form.
export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<{ date?: string, time?: string, drink?: string, size?: string }>(event)
  const date = body?.date || new Date().toISOString().slice(0, 10)
  const time = body?.time || new Date().toTimeString().slice(0, 5)

  const db = getDb(event)
  const existing = await db.prepare('SELECT sodas FROM journal_entries WHERE date = ?1').bind(date).first<{ sodas: string }>()
  const sodas = JSON.parse(existing?.sodas ?? '[]') as Array<{ time: string, drink?: string, size?: string }>
  sodas.push({ time, drink: body?.drink || undefined, size: body?.size || undefined })

  if (existing) {
    await db.prepare('UPDATE journal_entries SET sodas = ?2 WHERE date = ?1').bind(date, JSON.stringify(sodas)).run()
  }
  else {
    await db.prepare('INSERT INTO journal_entries (date, sodas) VALUES (?1, ?2)').bind(date, JSON.stringify(sodas)).run()
  }

  return { ok: true, date, sodas }
})
