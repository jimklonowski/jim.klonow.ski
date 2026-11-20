export default defineEventHandler(async (event) => {
  const auth = requireLabsAuth(event)

  const range = dateRange(event, 'date')
  const rows = await listRows(event, `SELECT * FROM health_metrics ${range.where} ORDER BY date ASC`, parseHealthMetricsRow, { binds: range.binds })
  // The doctor's view has no water tracking (the journal list blanks the pours, the profile hides
  // the goal), but Apple Health's own dietary-water total rode along on every row here (audit #44
  // item 38). Blanked rather than dropped, so the row keeps one shape for every reader.
  if (auth.role === 'doctor') return withEtag(event, rows.map(r => ({ ...r, dietary_water_oz: null })))
  return withEtag(event, rows)
})
