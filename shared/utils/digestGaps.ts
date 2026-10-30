// Which digests are missing: past days that have data but no daily digest, and Sunday–Saturday
// weeks with data but no weekly one (the weekly cron runs Sunday for the week that ended
// Saturday). Feeds the digest panel's "fill gaps" backfill. Pure, so the edge cases are tested.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { shiftDays, weekdayOf } from './dates.ts'

/**
 * The instant a daily-or-weekly cron ("M H * * …", UTC) fires on `date`, in ms — or null for a
 * cron this can't read. The digest crons fire at 14:00 and 15:00 UTC, which is mid-morning in
 * Chicago, so the UTC date of a firing is the home date it runs on.
 */
export function cronFiringAt(cron: string, date: string): number | null {
  const [minute, hour] = cron.split(' ')
  if (!/^\d+$/.test(minute ?? '') || !/^\d+$/.test(hour ?? '')) return null
  return Date.parse(`${date}T${hour!.padStart(2, '0')}:${minute!.padStart(2, '0')}:00Z`)
}

/**
 * The periods whose own cron run is still ahead at `now`. The daily run on `today` writes
 * yesterday; the weekly run on a Sunday writes the week that ended the Saturday before it. This
 * used to compare the UTC hour of `now` with the cron's hour while "yesterday" was the home date —
 * from 19:00 Chicago on, the UTC clock is past midnight, so yesterday read as "still due" though
 * its run had fired that morning, and a failed digest hid from the evening until midnight (audit
 * #43 item 24). Comparing instants has no clock to mix up.
 */
export function pendingDigests(now: number, today: string, dailyCron: string | undefined, weeklyCron: string | undefined): { daily: string | null, weekly: string | null } {
  const before = (cron: string | undefined, date: string) => {
    const at = cron ? cronFiringAt(cron, date) : null
    return at != null && now < at
  }
  const lastSaturday = shiftDays(today, -(((weekdayOf(today) + 1) % 7) || 7))
  return {
    daily: before(dailyCron, today) ? shiftDays(today, -1) : null,
    weekly: before(weeklyCron, shiftDays(lastSaturday, 1)) ? lastSaturday : null
  }
}

export interface DigestGaps {
  /** Dates, oldest first. */
  daily: string[]
  /** Week-ending Saturdays, oldest first. */
  weekly: string[]
}

/**
 * `dataDates` are the days anything digest-worthy was recorded (the endpoint mirrors the daily
 * digest's own signals in SQL); `have` are the digests on file. Only complete periods count:
 * today is still under way, and so is the week that contains it. `pending` names periods whose
 * scheduled cron hasn't fired yet — yesterday isn't a "gap" at 7am when the daily job writes it
 * at 14:00 UTC anyway; filling it early would spend a model call on partial data just for the
 * cron to overwrite it.
 */
export function digestGaps(
  dataDates: Iterable<string>,
  have: Array<{ type: string, period_end: string }>,
  today: string,
  windowDays: number,
  pending: { daily?: string | null, weekly?: string | null } = {}
): DigestGaps {
  const since = shiftDays(today, -windowDays)
  const data = new Set([...dataDates].filter(d => d >= since && d < today))
  const daily = new Set(have.filter(d => d.type === 'daily').map(d => d.period_end))
  const weekly = new Set(have.filter(d => d.type === 'weekly').map(d => d.period_end))

  const missingDaily = [...data].filter(d => !daily.has(d) && d !== pending.daily).sort()

  const missingWeekly: string[] = []
  // The last Saturday strictly before today, then back a week at a time through the window.
  let sat = shiftDays(today, -(((weekdayOf(today) + 1) % 7) || 7))
  while (sat >= since) {
    let hasData = false
    for (let i = 0; i < 7 && !hasData; i++) hasData = data.has(shiftDays(sat, -i))
    if (hasData && !weekly.has(sat) && sat !== pending.weekly) missingWeekly.unshift(sat)
    sat = shiftDays(sat, -7)
  }
  return { daily: missingDaily, weekly: missingWeekly }
}
