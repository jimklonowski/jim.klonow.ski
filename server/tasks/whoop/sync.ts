/// <reference path="../../../worker-configuration.d.ts" />
import { cycleMetric, metricsByDate, recoveryMetric, sleepMetric, whoopWorkoutRow } from '#shared/utils/whoopRecords'
import type { WhoopCycleRecord, WhoopRecoveryRecord, WhoopSleepRecord, WhoopWorkoutRecord } from '#shared/utils/whoopRecords'

// The nightly reconciliation. Since 2026-09-28 Whoop also pushes each scored sleep, recovery and
// workout to /api/whoop/webhook within minutes; this run still re-reads the window, because a
// webhook can be missed, and it's the only source of strain (Whoop has no cycle webhooks).
// Record → row mapping lives in shared/utils/whoopRecords.ts so both paths bucket identically.

// How far back to ask for records. Normally this is "since the last good sync, minus a little
// overlap" — Whoop scores a cycle some time after it ends, so the most recent day is often still
// PENDING_SCORE when the cron runs and has to be picked up again the next night.
const OVERLAP_DAYS = 2
const DEFAULT_LOOKBACK_DAYS = 14
const MAX_LOOKBACK_DAYS = 60
const DAY_MS = 86400000

function syncStart(lastSyncedAt: string | null): string {
  const now = Date.now()
  const floor = now - MAX_LOOKBACK_DAYS * DAY_MS
  const parsed = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN
  const from = Number.isNaN(parsed)
    ? now - DEFAULT_LOOKBACK_DAYS * DAY_MS
    : parsed - OVERLAP_DAYS * DAY_MS
  return new Date(Math.max(from, floor)).toISOString()
}

export default defineTask({
  meta: {
    name: 'whoop:sync',
    description: 'Refresh Whoop OAuth token and sync Recovery/Strain/Sleep Performance into health_metrics'
  },
  // Logged to task_runs. A disconnected account or any collection that failed is a failed run:
  // there is no retry until tomorrow's cron, so it has to show up somewhere other than a
  // console.error nobody reads.
  run: event => runLoggedTask(event, 'whoop:sync', env => syncWhoop(env.DB))
})

async function syncWhoop(db: D1Database) {
  const status = await getWhoopStatus(db)
  if (!status.connected) {
    throw new TaskFailure(status.lastError ?? 'Whoop is not connected')
  }
  const start = syncStart(status.lastSyncedAt)

  // Each collection is fetched independently: a Whoop 5xx on one endpoint shouldn't cost the
  // day's data from the others (there's no retry until tomorrow's cron).
  const [recoveryRes, sleepRes, cyclesRes] = await Promise.allSettled([
    whoopFetchAll<WhoopRecoveryRecord>(db, '/v2/recovery', { start }),
    whoopFetchAll<WhoopSleepRecord>(db, '/v2/activity/sleep', { start }),
    whoopFetchAll<WhoopCycleRecord>(db, '/v2/cycle', { start })
  ])

  const errors: string[] = []
  function settled<T>(res: PromiseSettledResult<T[]>, label: string): T[] {
    if (res.status === 'fulfilled') return res.value
    const message = res.reason instanceof Error ? res.reason.message : String(res.reason)
    errors.push(`${label}: ${message}`)
    console.error(`Whoop ${label} sync skipped:`, message)
    return []
  }

  const recovery = settled(recoveryRes, 'recovery')
  const sleep = settled(sleepRes, 'sleep')
  const cycles = settled(cyclesRes, 'cycle')

  const byDate = metricsByDate(recovery, r => r.created_at, recoveryMetric)
  metricsByDate(sleep, s => s.end, sleepMetric, byDate)
  metricsByDate(cycles, c => c.start, cycleMetric, byDate)

  let touched = 0
  for (const [date, fields] of Object.entries(byDate)) {
    if (await upsertHealthMetrics(db, date, fields)) touched++
  }

  // Workouts are fetched separately and tolerantly: a token granted before read:workout was
  // added will 403 here, and that must not abort the recovery/sleep/strain sync above. The
  // connection keeps working; workouts start flowing once the user reconnects to grant the scope.
  let workouts = 0
  try {
    for (const record of await whoopFetchAll<WhoopWorkoutRecord>(db, '/v2/activity/workout', { start })) {
      const row = whoopWorkoutRow(record)
      if (row) {
        await upsertWorkout(db, row)
        workouts++
      }
    }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`workout: ${message}`)
    console.error('Whoop workout sync skipped:', message)
  }

  // Only a clean run advances the watermark — a partial failure has to be re-fetched tomorrow,
  // and the recorded error is what the journal header shows instead of a bare green check.
  const result = { touched, workouts, dates: Object.keys(byDate).sort() }
  if (errors.length) {
    await markWhoopError(db, errors.join(' · '))
    throw new TaskFailure(errors.join(' · '), result)
  }
  await markWhoopSynced(db)
  return result
}
