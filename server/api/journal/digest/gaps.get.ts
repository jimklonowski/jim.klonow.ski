import { digestGaps, pendingDigests } from '#shared/utils/digestGaps'
import { zDigestGaps } from '#shared/utils/schemas'
import { localToday } from '#shared/utils/time'
import { shiftDays } from '#shared/utils/dates'
import { SCHEDULED_TASKS } from '../../../schedule'

// Days and weeks in the last `days` that have digest-worthy data but no digest — what the digest
// panel's "fill gaps" offers to backfill. Owner-only, like generating.
//
// "Digest-worthy" mirrors dailyDigestFacts' hasData signals (server/utils/digestFacts.ts) in SQL
// — keep the two in step. Counting ANY row here used to offer days the digest then skipped: the
// Apple Health webhook could leave a blank journal row, so the "gap" reappeared on every reload
// no matter how often it was "filled". (A food-only day counts since Oct 2026: the facts carry a
// Meals line with the day's estimated calories.)

/** The cron expression `task` runs on (server/schedule.ts). */
function cronOf(task: string): string | undefined {
  return Object.entries(SCHEDULED_TASKS).find(([, tasks]) => tasks.includes(task))?.[0]
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
        OR (water IS NOT NULL AND water != '[]')
        OR (food IS NOT NULL AND food != '{}')
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

  // A period isn't a gap while its own cron run is still ahead (shared/utils/digestGaps.ts).
  const pending = pendingDigests(Date.now(), today, cronOf('digest:daily'), cronOf('digest:weekly'))
  return { days, ...digestGaps(dates, have, today, days, pending) }
})
