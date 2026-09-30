import { digestGaps } from '#shared/utils/digestGaps'
import { zDigestGaps } from '#shared/utils/schemas'
import { localToday } from '#shared/utils/time'
import { shiftDays, weekdayOf } from '#shared/utils/dates'
import { SCHEDULED_TASKS } from '../../../schedule'

// Days and weeks in the last `days` that have digest-worthy data but no digest — what the digest
// panel's "fill gaps" offers to backfill. Owner-only, like generating.
//
// "Digest-worthy" mirrors dailyDigestFacts' hasData signals (server/utils/digestFacts.ts) in SQL
// — keep the two in step. Counting ANY row here used to offer days the digest then skipped: the
// Apple Health webhook could leave a blank journal row, and a food-only day has no digest lines,
// so the "gap" reappeared on every reload no matter how often it was "filled".

/** True while today's firing of `task`'s cron is still ahead of us (UTC hour from the schedule). */
function beforeCronHour(task: string, now: Date): boolean {
  const cron = Object.entries(SCHEDULED_TASKS).find(([, tasks]) => tasks.includes(task))?.[0]
  const hour = cron?.split(' ')[1]
  return !!hour && /^\d+$/.test(hour) && now.getUTCHours() < Number(hour)
}

export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { days } = validatedQuery(event, zDigestGaps)
  const today = localToday()
  const since = shiftDays(today, -days)

  const db = getDb(event)
  const [dataRes, digestRes] = await db.batch([
    db.prepare(`
      SELECT date FROM journal_entries WHERE date >= ?1 AND (
        weight_lbs IS NOT NULL OR rhr IS NOT NULL OR hrv IS NOT NULL
        OR (bp_systolic IS NOT NULL AND bp_diastolic IS NOT NULL)
        OR (peptides IS NOT NULL AND peptides != '[]')
        OR (sodas IS NOT NULL AND sodas != '[]')
        OR (notes IS NOT NULL AND notes != '')
      )
      UNION SELECT date FROM health_metrics WHERE date >= ?1 AND (
        recovery_score IS NOT NULL OR strain IS NOT NULL OR sleep_total_min IS NOT NULL
      )
      UNION SELECT date FROM workouts WHERE date >= ?1
      UNION SELECT date FROM labs_entries WHERE date >= ?1
    `).bind(since),
    db.prepare('SELECT type, period_end FROM digests WHERE period_end >= ?1').bind(since)
  ])
  const dates = ((dataRes?.results ?? []) as Array<{ date: string }>).map(r => r.date)
  const have = (digestRes?.results ?? []) as Array<{ type: string, period_end: string }>

  // A period isn't a gap while its own cron is still due today: the daily writes yesterday at
  // 14:00 UTC, the weekly writes the just-ended week on Sunday at 15:00 UTC.
  const now = new Date()
  const pending = {
    daily: beforeCronHour('digest:daily', now) ? shiftDays(today, -1) : null,
    weekly: weekdayOf(today) === 0 && beforeCronHour('digest:weekly', now)
      ? shiftDays(today, -1) // Sunday's yesterday is the Saturday that just ended the week
      : null
  }
  return { days, ...digestGaps(dates, have, today, days, pending) }
})
