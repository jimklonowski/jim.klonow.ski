export default defineEventHandler(async (event) => {
  requireLabsAuth(event)

  const body = await readBody<Record<string, unknown>>(event)
  if (!body?.date || typeof body.date !== 'string') {
    throw createError({ statusCode: 400, message: 'Missing date field' })
  }

  const db = getDb(event)
  await db.prepare(`
    INSERT INTO journal_entries (date, day, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, reconstitutions, food, notes)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT(date) DO UPDATE SET
      day = excluded.day,
      weight_lbs = excluded.weight_lbs,
      bp_systolic = excluded.bp_systolic,
      bp_diastolic = excluded.bp_diastolic,
      rhr = excluded.rhr,
      hrv = excluded.hrv,
      peptides = excluded.peptides,
      reconstitutions = excluded.reconstitutions,
      food = excluded.food,
      notes = excluded.notes
  `).bind(
    body.date,
    body.day ?? null,
    body.weight_lbs ?? null,
    body.bp_systolic ?? null,
    body.bp_diastolic ?? null,
    body.rhr ?? null,
    body.hrv ?? null,
    JSON.stringify(body.peptides ?? []),
    JSON.stringify(body.reconstitutions ?? []),
    JSON.stringify(body.food ?? {}),
    body.notes ?? ''
  ).run()

  return { ok: true, date: body.date }
})
