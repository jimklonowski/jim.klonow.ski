import { zJournalSave } from '#shared/utils/schemas'

export default defineEventHandler(async (event) => {
  requireWriteAccess(event)

  // Shape, bounds and date validity come from the shared schema; a bad field is a named 400
  // rather than a D1 bind error surfacing as a 500 (or, worse, a string landing in a REAL column).
  const body = await readValidatedJson(event, zJournalSave)

  const db = getDb(event)
  // The `day` column (a hand-typed notebook index) is no longer read or written. It stays in the
  // schema holding its historical values, and is deliberately absent from this statement so a
  // re-save doesn't null out what's already recorded.
  await db.prepare(`
    INSERT INTO journal_entries (date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, reconstitutions, food, sodas, notes)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT(date) DO UPDATE SET
      weight_lbs = excluded.weight_lbs,
      bp_systolic = excluded.bp_systolic,
      bp_diastolic = excluded.bp_diastolic,
      rhr = excluded.rhr,
      hrv = excluded.hrv,
      peptides = excluded.peptides,
      reconstitutions = excluded.reconstitutions,
      food = excluded.food,
      sodas = excluded.sodas,
      notes = excluded.notes
  `).bind(
    body.date,
    body.weight_lbs,
    body.bp_systolic,
    body.bp_diastolic,
    body.rhr,
    body.hrv,
    JSON.stringify(body.peptides),
    JSON.stringify(body.reconstitutions),
    JSON.stringify(body.food),
    JSON.stringify(body.sodas),
    body.notes
  ).run()

  return { ok: true, date: body.date }
})
