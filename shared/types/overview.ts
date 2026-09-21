/**
 * What the site shell (status line, footer, ⌘K palette) needs from the data, as served by
 * GET /api/overview. Scalars and two short lists — never full tables. The home dashboard has
 * its own aggregator (app/composables/useOverview.ts) over the complete lists it charts.
 */
export interface OverviewSummary {
  /** Today in the home timezone, YYYY-MM-DD — the day the streak and soda tally were measured against. */
  today: string
  /** Days with something hand-entered (see shared/utils/journalLog.ts), not rows. */
  loggedDays: number
  /** Consecutive logged days ending today or yesterday. */
  streak: number
  /** Newest journal row of any kind, or null before the first entry. */
  latestEntryDate: string | null
  /** Sodas logged today; null for roles that don't see the soda log (doctor). */
  sodasToday: number | null
  /** The newest draw with its raw markers (derived markers are computed client-side). */
  latestDraw: { date: string, markers: Record<string, number | null> } | null
  /** Distinct source PDFs across every lab draw. */
  pdfCount: number
  /** Newest health_metrics row (Whoop / Apple Health), or null. */
  latestMetricsDate: string | null
  latestDexa: { date: string, bodyFatPct: number | null } | null
  /** Every compound in the dose log with the date it was last dosed, most recent first. */
  compounds: Array<{ compound: string, lastDate: string }>
  /** Newest-first recent journal days for the palette's DAYS group; empty for roles without day access. */
  recentDays: Array<{ date: string, weight_lbs: number | null }>
}
