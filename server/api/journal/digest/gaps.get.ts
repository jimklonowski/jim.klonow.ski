import { digestGaps } from '#shared/utils/digestGaps'
import { zDigestGaps } from '#shared/utils/schemas'
import { localToday } from '#shared/utils/time'
import { shiftDays } from '#shared/utils/dates'

// Days and weeks in the last `days` that have data but no digest — what the digest panel's
// "fill gaps" offers to backfill. Owner-only, like generating.
export default defineEventHandler(async (event) => {
  requireOwner(event)
  const { days } = validatedQuery(event, zDigestGaps)
  const today = localToday()
  const since = shiftDays(today, -days)

  const db = getDb(event)
  const [dataRes, digestRes] = await db.batch([
    db.prepare(`
      SELECT date FROM journal_entries WHERE date >= ?1
      UNION SELECT date FROM health_metrics WHERE date >= ?1
      UNION SELECT date FROM workouts WHERE date >= ?1
    `).bind(since),
    db.prepare('SELECT type, period_end FROM digests WHERE period_end >= ?1').bind(since)
  ])
  const dates = ((dataRes?.results ?? []) as Array<{ date: string }>).map(r => r.date)
  const have = (digestRes?.results ?? []) as Array<{ type: string, period_end: string }>
  return { days, ...digestGaps(dates, have, today, days) }
})
