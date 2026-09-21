import { isFullAccessRole } from '#shared/utils/access'
import { isLoggedDay, loggedStreak } from '#shared/utils/journalLog'
import { localToday } from '#shared/utils/time'
import type { OverviewSummary } from '#shared/types/overview'

// One small response for the site shell. The status line, footer and ⌘K palette used to reach
// these figures through useOverview(), which loads every journal, labs, health-metrics, DEXA and
// workout row — so the calculator page shipped the whole database in its payload for a streak
// count, a soda tally and a PDF total. Everything here is a scalar or a short list; the home
// dashboard keeps loading the full lists it actually charts.

const RECENT_DAYS = 14

export default defineEventHandler(async (event): Promise<OverviewSummary> => {
  const auth = requireLabsAuth(event)
  const db = getDb(event)
  const today = localToday()

  // One round trip. The journal table is read in full because the logged-day predicate and the
  // streak walk need every row's hand-entered fields — but it stays on the Worker.
  const [journalRes, drawRes, sourcesRes, metricsRes, dexaRes] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT date, weight_lbs, peptides, reconstitutions, food, sodas, notes FROM journal_entries ORDER BY date ASC'),
    db.prepare('SELECT date, markers FROM labs_entries ORDER BY date DESC LIMIT 1'),
    db.prepare('SELECT sources FROM labs_entries'),
    db.prepare('SELECT MAX(date) AS date FROM health_metrics'),
    db.prepare('SELECT date, total FROM dexa_entries ORDER BY date DESC LIMIT 1')
  ])

  const entries = (journalRes?.results ?? []).map(parseJournalRow)
  const latestEntry = entries.at(-1) ?? null
  const todayEntry = entries.find(e => e.date === today) ?? null

  // Compound → last dosed date, most recent first (the palette's COMPOUNDS group).
  const lastDosed = new Map<string, string>()
  for (let i = entries.length - 1; i >= 0; i--) {
    for (const p of entries[i]!.peptides as Array<{ compound?: string }>) {
      if (p.compound && !lastDosed.has(p.compound)) lastDosed.set(p.compound, entries[i]!.date)
    }
  }

  const drawRow = drawRes?.results?.[0]
  const latestDraw = drawRow
    ? { date: drawRow.date as string, markers: JSON.parse((drawRow.markers as string) || '{}') as Record<string, number | null> }
    : null

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

  return {
    today,
    loggedDays: entries.filter(isLoggedDay).length,
    streak: loggedStreak(entries, today),
    latestEntryDate: latestEntry?.date ?? null,
    sodasToday: auth.role === 'doctor' ? null : (todayEntry?.sodas as unknown[] | undefined)?.length ?? 0,
    latestDraw,
    pdfCount: pdfKeys.size,
    latestMetricsDate: (metricsRes?.results?.[0]?.date as string | null | undefined) ?? null,
    latestDexa: dexaRow
      ? { date: dexaRow.date as string, bodyFatPct: dexaTotal?.body_fat_pct ?? null }
      : null,
    compounds: [...lastDosed.entries()].map(([compound, lastDate]) => ({ compound, lastDate })),
    recentDays: fullAccess
      ? entries.slice(-RECENT_DAYS).reverse().map(e => ({ date: e.date, weight_lbs: e.weight_lbs }))
      : []
  }
})
