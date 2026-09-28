// Which digests are missing: past days that have data but no daily digest, and Sunday–Saturday
// weeks with data but no weekly one (the weekly cron runs Sunday for the week that ended
// Saturday). Feeds the digest panel's "fill gaps" backfill. Pure, so the edge cases are tested.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { shiftDays, weekdayOf } from './dates.ts'

export interface DigestGaps {
  /** Dates, oldest first. */
  daily: string[]
  /** Week-ending Saturdays, oldest first. */
  weekly: string[]
}

/**
 * `dataDates` are the days anything was recorded (journal, health metrics, workouts); `have` are
 * the digests on file. Only complete periods count: today is still under way, and so is the week
 * that contains it.
 */
export function digestGaps(
  dataDates: Iterable<string>,
  have: Array<{ type: string, period_end: string }>,
  today: string,
  windowDays: number
): DigestGaps {
  const since = shiftDays(today, -windowDays)
  const data = new Set([...dataDates].filter(d => d >= since && d < today))
  const daily = new Set(have.filter(d => d.type === 'daily').map(d => d.period_end))
  const weekly = new Set(have.filter(d => d.type === 'weekly').map(d => d.period_end))

  const missingDaily = [...data].filter(d => !daily.has(d)).sort()

  const missingWeekly: string[] = []
  // The last Saturday strictly before today, then back a week at a time through the window.
  let sat = shiftDays(today, -(((weekdayOf(today) + 1) % 7) || 7))
  while (sat >= since) {
    let hasData = false
    for (let i = 0; i < 7 && !hasData; i++) hasData = data.has(shiftDays(sat, -i))
    if (hasData && !weekly.has(sat)) missingWeekly.unshift(sat)
    sat = shiftDays(sat, -7)
  }
  return { daily: missingDaily, weekly: missingWeekly }
}
