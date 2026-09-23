export default defineEventHandler(async (event) => {
  const auth = requireLabsAuth(event)

  const entries = await listRows(event, 'SELECT * FROM journal_entries ORDER BY date ASC', parseJournalRow)

  // The doctor view is vitals + protocol. Projected as an allowlist rather than nulling named
  // fields, so a column added later is private by default: dates, watch vitals, and the dose /
  // reconstitution log stay; food, sodas and personal notes are blanked to their empty shapes so
  // the client type is unchanged.
  if (auth.role === 'doctor') {
    return entries.map(({ date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, reconstitutions }) => ({
      date, weight_lbs, bp_systolic, bp_diastolic, rhr, hrv, peptides, reconstitutions,
      food: {},
      sodas: [],
      notes: null
    }))
  }
  return entries
})
