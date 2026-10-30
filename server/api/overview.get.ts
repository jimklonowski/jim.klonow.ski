import { isFullAccessRole } from '#shared/utils/access'
import { LOGGED_DAY_SQL, loggedStreakFromDates } from '#shared/utils/journalLog'
import { localToday } from '#shared/utils/time'
import { waterTotals } from '#shared/utils/water'
import type { OverviewSummary } from '#shared/types/overview'
import { currentReadings } from '#shared/utils/labsTimeline'
import { computeMarkers, isEchoOnly } from '../../app/data/biomarkers'

// One small response for the site shell. The status line, footer and ⌘K palette used to reach
// these figures through useOverview(), which loads every journal, labs, health-metrics, DEXA and
// workout row — so the calculator page shipped the whole database in its payload for a streak
// count, a soda tally and a PDF total. Everything here is a scalar or a short list; the home
// dashboard keeps loading the full lists it actually charts.
//
// Every figure is computed in the database (audit #42 item 34). This handler used to SELECT the
// whole journal table and parse every row's JSON in the Worker to count logged days, find the
// last dose of each compound and take the newest fourteen; the same logged-day predicate now
// runs as SQL (shared/utils/journalLog.ts LOGGED_DAY_SQL), the compounds come from json_each
// grouped by name, and each remaining scalar is one narrow statement. Still one round trip.

const RECENT_DAYS = 14

export default defineEventHandler(async (event): Promise<OverviewSummary> => {
  const auth = requireLabsAuth(event)
  const db = getDb(event)
  const today = localToday()

  const [loggedRes, latestRes, rhrRes, todayRes, recentRes, compoundsRes, drawRes, sourcesRes, metricsRes, dexaRes] = await db.batch<Record<string, unknown>>([
    // The dates with something hand-entered — the streak walk and the logged-day count.
    db.prepare(`SELECT date FROM journal_entries WHERE ${LOGGED_DAY_SQL} ORDER BY date ASC`),
    db.prepare('SELECT MAX(date) AS date FROM journal_entries'),
    db.prepare('SELECT rhr FROM journal_entries WHERE rhr IS NOT NULL ORDER BY date DESC LIMIT 1'),
    db.prepare('SELECT sodas, water FROM journal_entries WHERE date = ?1').bind(today),
    db.prepare('SELECT date, weight_lbs FROM journal_entries ORDER BY date DESC LIMIT ?1').bind(RECENT_DAYS),
    // Compound → the last day it was dosed, most recent first (the palette's COMPOUNDS group).
    db.prepare(`
      SELECT json_extract(dose.value, '$.compound') AS compound, MAX(j.date) AS lastDate
      FROM journal_entries AS j, json_each(COALESCE(j.peptides, '[]')) AS dose
      WHERE compound IS NOT NULL AND compound <> ''
      GROUP BY compound
      ORDER BY lastDate DESC, compound ASC
    `),
    // The recent rows, not one: the newest can be an echo (a scan, not the latest draw), and the
    // current readings reach back CURRENT_WINDOW_DAYS before the latest draw.
    db.prepare('SELECT date, fasting, markers, qualitative FROM labs_entries ORDER BY date DESC LIMIT 20'),
    db.prepare('SELECT sources FROM labs_entries'),
    db.prepare('SELECT MAX(date) AS date FROM health_metrics'),
    db.prepare('SELECT date, total FROM dexa_entries ORDER BY date DESC LIMIT 1')
  ])

  const loggedDates = (loggedRes?.results ?? []).map(r => r.date as string)
  const todayRow = todayRes?.results?.[0]

  const draws = (drawRes?.results ?? [])
    .map(r => ({
      date: r.date as string,
      fasting: !!r.fasting,
      markers: JSON.parse((r.markers as string) || '{}') as Record<string, number | null>,
      qualitative: JSON.parse((r.qualitative as string) || '[]') as Array<{ name: string, category?: string }>
    }))
    .filter(d => !isEchoOnly(d))
  const drawRow = draws[0]
  const latestDraw = drawRow ? { date: drawRow.date, fasting: drawRow.fasting, markers: drawRow.markers } : null
  // Each marker's newest reading in the window (shared/utils/labsTimeline.ts) — a one-marker
  // add-on draw no longer stands for the whole picture in the status line's flags (audit #43
  // item 28). Derived markers per draw first, so an input never pairs across two draws.
  const current = Object.fromEntries(currentReadings(draws.map(d => ({ date: d.date, markers: computeMarkers(d.markers, d.fasting, d.date) }))))

  const pdfKeys = new Set<string>()
  for (const r of sourcesRes?.results ?? []) {
    for (const key of JSON.parse((r.sources as string) || '[]') as string[]) pdfKeys.add(key)
  }

  const dexaRow = dexaRes?.results?.[0]
  const dexaTotal = dexaRow ? JSON.parse((dexaRow.total as string) || '{}') as { body_fat_pct?: number | null } : null

  // The doctor view is vitals + protocol: the soda log stays owner/friend-only, and the daily
  // entry pages are off-limits, so neither the tally nor the day list is sent (same policy as
  // /api/journal/list and shared/utils/access.ts).
  const fullAccess = isFullAccessRole(auth.role)

  return withEtag<OverviewSummary>(event, {
    today,
    loggedDays: loggedDates.length,
    streak: loggedStreakFromDates(loggedDates, today),
    latestEntryDate: (latestRes?.results?.[0]?.date as string | null | undefined) ?? null,
    latestRhr: (rhrRes?.results?.[0]?.rhr as number | null | undefined) ?? null,
    sodasToday: auth.role === 'doctor' ? null : (JSON.parse((todayRow?.sodas as string) || '[]') as unknown[]).length,
    waterOzToday: auth.role === 'doctor' ? null : waterTotals(JSON.parse((todayRow?.water as string) || '[]') as Array<{ oz?: number }>).oz,
    latestDraw,
    current,
    pdfCount: pdfKeys.size,
    latestMetricsDate: (metricsRes?.results?.[0]?.date as string | null | undefined) ?? null,
    latestDexa: dexaRow
      ? { date: dexaRow.date as string, bodyFatPct: dexaTotal?.body_fat_pct ?? null }
      : null,
    compounds: (compoundsRes?.results ?? []).map(r => ({ compound: r.compound as string, lastDate: r.lastDate as string })),
    recentDays: fullAccess
      ? (recentRes?.results ?? []).map(r => ({ date: r.date as string, weight_lbs: (r.weight_lbs as number | null) ?? null }))
      : []
  })
})
