import type { H3Event } from 'h3'
import { normalizeAbsDifferential } from '#shared/utils/labsUnits'
import { zLabsSave } from '#shared/utils/schemas'
import { shiftDays } from '#shared/utils/dates'
import { MATCH_WINDOW_DAYS, canFulfil } from '#shared/utils/plannedDraws'

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
    // Same whitelist-and-coerce pass as the markers: only the figures the pages know, only finite
    // numbers. The pages render every figure as optional (a report can omit any of them), but a
    // string or an invented key where a number is expected would still be a crash at read time.
    const scan = sanitizeDexa(body)
    if (scan.dropped.length) console.warn(`[labs] DEXA ${date}: ignored unrecognized figures — ${scan.dropped.join(', ')}`)
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
      JSON.stringify(scan.total),
      JSON.stringify(scan.regions),
      scan.vat ? JSON.stringify(scan.vat) : null,
      scan.ag_ratio,
      scan.bone_density ? JSON.stringify(scan.bone_density) : null,
      scan.symmetry ? JSON.stringify(scan.symmetry) : null
    ).run()
    await recordAudit(event, { table: 'dexa_entries', key: date, before, summary: `DEXA ${date}` })

    return { ok: true, table: 'dexa_entries', date, ...(scan.dropped.length ? { ignored: scan.dropped } : {}) }
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

  // Close the loop with a planned draw: the nearest plan still waiting on results that this draw
  // could be (canFulfil — inside the window, and not booked after the draw) gets this row as its
  // fulfilment, so the home strip and the /labs section flip from "next draw" to done and the AI
  // summary for this date leads with the plan's questions. An echo is a scan, not a draw. The
  // link is audited like any other planned_draws write: the stored labs_date outranks the window
  // for good, so undoing the upload has to be able to undo the link too.
  const planned = reportType === 'echo' ? null : await linkPlannedDraw(event, db, date)

  return { ok: true, table: 'labs_entries', date, planned, ...(dropped.length ? { ignored: dropped } : {}) }
})

async function linkPlannedDraw(event: H3Event, db: D1Database, date: string): Promise<{ id: number, date: string } | null> {
  try {
    const { results } = await db.prepare(`
      SELECT id, date, labs_date, created_at FROM planned_draws
      WHERE (labs_date IS NULL OR labs_date = ?3) AND date >= ?1 AND date <= ?2
      ORDER BY abs(julianday(date) - julianday(?3)) ASC, date ASC
    `).bind(shiftDays(date, -MATCH_WINDOW_DAYS), shiftDays(date, MATCH_WINDOW_DAYS), date)
      .all<{ id: number, date: string, labs_date: string | null, created_at: string | null }>()
    const plans = results ?? []
    // A second PDF for the same draw (an add-on panel): the plan is already this draw's.
    const linked = plans.find(p => p.labs_date === date)
    if (linked) return { id: linked.id, date: linked.date }
    const row = plans.find(p => p.labs_date == null && canFulfil({ date: p.date, created_at: p.created_at ?? undefined }, date))
    if (!row) return null
    const before = await auditBefore(event, 'planned_draws', row.id)
    await db.prepare('UPDATE planned_draws SET labs_date = ?2 WHERE id = ?1').bind(row.id, date).run()
    await recordAudit(event, { table: 'planned_draws', key: row.id, before, summary: `${row.date} plan ← the ${date} draw` })
    return { id: row.id, date: row.date }
  }
  catch (err) {
    // A sandbox without migration 0007 has nothing to link; anything else is a real failure.
    if (isMissingTable(err)) return null
    throw err
  }
}
