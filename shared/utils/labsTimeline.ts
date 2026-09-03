// Pure helpers behind the /labs time-travel scrubber: which draws are visible as of the viewed
// date, how a `?asof=` query value normalizes, and how many of a draw's readings were out of
// range. Framework-free so tests/labsTimeline.test.mjs can run them under node --test.

export interface DatedEntry { date: string }

/** Entries sorted ascending and cut off at `asof` (inclusive). `null` means everything. */
export function entriesAsOf<T extends DatedEntry>(entries: T[], asof: string | null): T[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  return asof ? sorted.filter(e => e.date <= asof) : sorted
}

/**
 * Normalize a `?asof=` query value against the sorted draw dates. Only a real draw date counts,
 * and the latest draw collapses to null so "viewing the latest" and "not time-travelling" are
 * the same state — no stale param left in the URL once you've scrubbed back to now.
 */
export function resolveAsOf(dates: string[], asof: unknown): string | null {
  if (typeof asof !== 'string' || !dates.includes(asof)) return null
  return asof === dates[dates.length - 1] ? null : asof
}

export interface RangeMeta { refMin?: number, refMax?: number }

/** How many of a draw's readings sit outside their lab reference range, and how many it has. */
export function drawFlags(markers: Record<string, number | null>, ranges: Record<string, RangeMeta>): { high: number, low: number, count: number } {
  let high = 0
  let low = 0
  let count = 0
  for (const [key, value] of Object.entries(markers)) {
    if (value == null) continue
    count++
    const meta = ranges[key]
    if (!meta) continue
    if (meta.refMin !== undefined && value < meta.refMin) low++
    else if (meta.refMax !== undefined && value > meta.refMax) high++
  }
  return { high, low, count }
}
