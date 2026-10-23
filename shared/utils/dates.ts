// Calendar-day arithmetic on YYYY-MM-DD strings — the one copy. Before this there were a dozen
// private shiftDays/addDays helpers, two opposite-signed day diffs (trends' `dayDiff(a, b)` was
// a − b, cycles' `diffDays(a, b)` is b − a), and three copies of the Sunday week key.
//
// Everything anchors at UTC noon. A date string names a calendar day, not an instant, so the
// arithmetic must not depend on the zone it runs in: UTC has no DST, which makes a day exactly
// 24h and the results identical in a browser, a Worker, or the node test runner. (The older
// local-noon copies were also correct — noon keeps a DST shift from crossing midnight — but only
// because of that margin, and they formatted via toLocaleDateString, which varies by runtime.)
//
// Shared (app + server). No imports, so anything in shared/ can use it without a cycle.

const MS_PER_DAY = 86_400_000

function noonUtc(date: string): number {
  return Date.parse(date + 'T12:00:00Z')
}

/** `date` moved by `n` calendar days (negative goes back). */
export function shiftDays(date: string, n: number): string {
  const d = new Date(noonUtc(date))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` — positive when `b` is later. */
export function diffDays(a: string, b: string): number {
  return Math.round((noonUtc(b) - noonUtc(a)) / MS_PER_DAY)
}

/** Day of week for a date, 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(noonUtc(date)).getUTCDay()
}

/** The Sunday that starts the week containing `date` — the calendar grid's week key. */
export function weekStartOf(date: string): string {
  return shiftDays(date, -weekdayOf(date))
}

/** Every date from `from` to `to` inclusive, stepping `step` days; empty when `from > to`. */
export function eachDay(from: string, to: string, step = 1): string[] {
  // A zero or negative step never reaches `to` — loud, not an infinite loop (audit #42 item 44).
  if (!Number.isInteger(step) || step < 1) throw new RangeError(`eachDay: step must be a positive whole number of days, got ${step}`)
  const out: string[] = []
  for (let d = from; d <= to; d = shiftDays(d, step)) out.push(d)
  return out
}

/** `n` rounded to `dp` decimal places — one by default, the prompt builders' display precision. */
export function roundTo(n: number, dp = 1): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/**
 * "Sep 18" for a YYYY-MM-DD, formatted at UTC noon so the day never shifts with the runtime's
 * zone — the one copy of what protocolProse, trends and the digest prompts each spelled out
 * (audit #42 item 40).
 */
export function monthDay(date: string): string {
  return new Date(noonUtc(date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * "today" / "yesterday" / "3d ago" / "Oct 3" for a calendar day relative to `today` — the one
 * copy of what the digest panel and the home digest card each spelled out (audit #42 item 41).
 * Calendar days, not elapsed hours: 11:50 pm last night is "yesterday" at 8 am.
 */
export function relativeDay(date: string, today: string): string {
  const days = diffDays(date, today)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return monthDay(date)
}

/** The `n` calendar days ending on `today`, oldest first — the x-axis of every trailing-window strip. */
export function trailingDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDays(today, i - (n - 1)))
}
