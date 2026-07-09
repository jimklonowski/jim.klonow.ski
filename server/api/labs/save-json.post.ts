interface SavePayload {
  date: string
  _type?: string
  [key: string]: unknown
}

export default defineEventHandler(async (event) => {
  requireLabsAuth(event)
  requireUploadPin(event)

  const body = await readBody<SavePayload>(event)
  if (!body?.date) {
    throw createError({ statusCode: 400, message: 'Missing date field' })
  }

  const db = getDb(event)
  const { _type, ...data } = body

  if (_type === 'dexa') {
    await db.prepare(`
      INSERT INTO dexa_entries (date, weight_lbs, sources, total, regions, vat, ag_ratio, bone_density, symmetry)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(date) DO UPDATE SET
        weight_lbs = excluded.weight_lbs,
        sources = excluded.sources,
        total = excluded.total,
        regions = excluded.regions,
        vat = excluded.vat,
        ag_ratio = excluded.ag_ratio,
        bone_density = excluded.bone_density,
        symmetry = excluded.symmetry
    `).bind(
      data.date,
      data.weight_lbs ?? null,
      JSON.stringify(data.sources ?? []),
      JSON.stringify(data.total ?? {}),
      JSON.stringify(data.regions ?? {}),
      data.vat ? JSON.stringify(data.vat) : null,
      data.ag_ratio ?? null,
      data.bone_density ? JSON.stringify(data.bone_density) : null,
      data.symmetry ? JSON.stringify(data.symmetry) : null
    ).run()

    return { ok: true, table: 'dexa_entries', date: data.date }
  }

  // Merge with any existing row for this date rather than replacing it outright —
  // lets multiple one-off single-result uploads for the same date add up instead of clobbering each other.
  const existing = await db.prepare('SELECT sources, markers, qualitative FROM labs_entries WHERE date = ?1')
    .bind(data.date).first<{ sources: string, markers: string, qualitative: string }>()

  const existingSources = existing ? JSON.parse(existing.sources || '[]') as string[] : []
  const existingMarkers = existing ? JSON.parse(existing.markers || '{}') as Record<string, number> : {}
  const existingQualitative = existing ? JSON.parse(existing.qualitative || '[]') as { name: string, result: string }[] : []

  const newSources = (data.sources ?? []) as string[]
  const mergedSources = [...new Set([...existingSources, ...newSources])]
  const mergedMarkers = { ...existingMarkers, ...(data.markers as Record<string, number> ?? {}) }
  const newQualitative = (data.qualitative ?? []) as { name: string, result: string }[]
  const mergedQualitative = [
    ...existingQualitative.filter(q => !newQualitative.some(n => n.name === q.name)),
    ...newQualitative
  ]

  await db.prepare(`
    INSERT INTO labs_entries (date, fasting, sources, markers, qualitative)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(date) DO UPDATE SET
      fasting = excluded.fasting,
      sources = excluded.sources,
      markers = excluded.markers,
      qualitative = excluded.qualitative
  `).bind(
    data.date,
    data.fasting ? 1 : 0,
    JSON.stringify(mergedSources),
    JSON.stringify(mergedMarkers),
    JSON.stringify(mergedQualitative)
  ).run()

  return { ok: true, table: 'labs_entries', date: data.date }
})
