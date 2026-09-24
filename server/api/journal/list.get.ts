export default defineEventHandler(async (event) => {
  const auth = requireLabsAuth(event)

  const range = dateRange(event, 'date')
  const entries = await listRows(event, `SELECT * FROM journal_entries ${range.where} ORDER BY date ASC`, parseJournalRow, { binds: range.binds })

  // The doctor view is vitals + protocol. Projected as an allowlist rather than nulling named
  // fields, so a column added later is private by default: dates, watch vitals, and the dose /
  // reconstitution log stay; food, sodas and personal notes are blanked to their empty shapes so
  // the client type is unchanged.
  if (auth.role === 'doctor') {
    return withEtag(event, entries.map(({ date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, reconstitutions }) => ({
      date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, reconstitutions,
      food: {},
      sodas: [],
      notes: null
    })))
  }
  return withEtag(event, entries)
})
