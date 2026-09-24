import { normalizeAbsDifferential } from '#shared/utils/labsUnits'
import { zLabsSave } from '#shared/utils/schemas'

// Writes an extraction (or a hand-edited copy of one) into labs_entries / dexa_entries.
//
// Everything here originates in a PDF that Claude read, so it is treated as untrusted: marker
// keys are whitelisted against the catalogue the UI can display, values must be finite numbers,
// and `sources` must be plain PDF object keys — the proxy at /api/labs/pdf/[key] serves whatever
// key a row names, so an attacker-chosen entry would point a lab row at another bucket object.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  await requireUploadPin(event)

  const body = await readValidatedJson(event, zLabsSave)
  const { date } = body

  const db = getDb(event)
  const reportType = body._type
  const sources = sanitizeSources(body.sources)

  if (reportType === 'dexa') {
    // A DEXA row's weight column is NOT NULL, so a scan that extracted without one used to fail
    // deep in the bind as a 500 rather than saying which field was missing.
    const weight = body.weight_lbs
    if (weight == null) {
      throw createError({ statusCode: 400, message: 'DEXA scans need a numeric weight_lbs' })
    }
    const before = await auditBefore(event, 'dexa_entries', date)
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
      date,
      weight,
      JSON.stringify(sources),
      JSON.stringify(body.total ?? {}),
      JSON.stringify(body.regions ?? {}),
      body.vat ? JSON.stringify(body.vat) : null,
      body.ag_ratio ?? null,
      body.bone_density ? JSON.stringify(body.bone_density) : null,
      body.symmetry ? JSON.stringify(body.symmetry) : null
    ).run()
    await recordAudit(event, { table: 'dexa_entries', key: date, before, summary: `DEXA ${date}` })

    return { ok: true, table: 'dexa_entries', date }
  }

  // Merge with any existing row for this date rather than replacing it outright —
  // lets multiple one-off single-result uploads for the same date add up instead of clobbering each other.
  const before = await auditBefore(event, 'labs_entries', date)
  const existing = await db.prepare('SELECT fasting, sources, markers, qualitative FROM labs_entries WHERE date = ?1')
    .bind(date).first<{ fasting: number, sources: string, markers: string, qualitative: string }>()

  const existingSources = existing ? JSON.parse(existing.sources || '[]') as string[] : []
  const existingMarkers = existing ? JSON.parse(existing.markers || '{}') as Record<string, number> : {}
  const existingQualitative = existing ? JSON.parse(existing.qualitative || '[]') as { name: string, result: string }[] : []

  const mergedSources = [...new Set([...existingSources, ...sources])]
  // Same K/uL → cells/uL guard as process-pdf, so a hand-edited JSON save can't reintroduce the mix.
  const { markers: cleanMarkers, dropped } = sanitizeMarkers(body.markers)
  const newMarkers = normalizeAbsDifferential(cleanMarkers) as Record<string, number>
  const mergedMarkers = { ...existingMarkers, ...newMarkers }
  // Tag each qualitative result with its report type so the dashboard can split echo
  // findings from genetic/other qualitative results without guessing from the name.
  const newQualitative = sanitizeQualitative(body.qualitative)
    .map(q => ({ ...q, category: reportType === 'echo' ? 'echo' : 'genetic' }))
  const mergedQualitative = [
    ...existingQualitative.filter(q => !newQualitative.some(n => n.name === q.name)),
    ...newQualitative
  ]

  // Fasting is a property of the draw, and a draw that was fasting stays fasting: a later
  // one-off add-on panel (an IGF-1 re-test, say) is non-fasting by nature, and letting it
  // replace the flag silently relabeled the glucose and lipids already stored for that date.
  const fasting = (!!existing?.fasting || body.fasting === true) ? 1 : 0

  await db.prepare(`
    INSERT INTO labs_entries (date, fasting, sources, markers, qualitative)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(date) DO UPDATE SET
      fasting = excluded.fasting,
      sources = excluded.sources,
      markers = excluded.markers,
      qualitative = excluded.qualitative
  `).bind(
    date,
    fasting,
    JSON.stringify(mergedSources),
    JSON.stringify(mergedMarkers),
    JSON.stringify(mergedQualitative)
  ).run()
  await recordAudit(event, { table: 'labs_entries', key: date, before, summary: `${reportType ?? 'bloodwork'} ${date}` })

  if (dropped.length) console.warn(`[labs] ${date}: ignored unrecognized marker keys — ${dropped.join(', ')}`)

  return { ok: true, table: 'labs_entries', date, ...(dropped.length ? { ignored: dropped } : {}) }
})
