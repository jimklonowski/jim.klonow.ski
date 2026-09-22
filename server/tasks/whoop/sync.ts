/// <reference path="../../../worker-configuration.d.ts" />
import { HOME_TZ } from '#shared/utils/time'
import type { HealthMetricField, WorkoutUpsert } from '../../utils/db'

interface WhoopWorkoutRecord {
  id?: string
  start?: string
  end?: string
  sport_name?: string
  score_state?: string
  score?: {
    average_heart_rate?: number
    max_heart_rate?: number
    kilojoule?: number
    distance_meter?: number
  }
}

interface WhoopRecoveryRecord {
  created_at?: string
  score_state?: string
  score?: { recovery_score?: number }
}

interface WhoopSleepRecord {
  end?: string
  /** True for a nap. Naps carry their own (low) performance score and must not overwrite the night. */
  nap?: boolean
  score_state?: string
  score?: { sleep_performance_percentage?: number }
}

interface WhoopCycleRecord {
  start?: string
  /** Absent while the cycle is still running. */
  end?: string | null
  score_state?: string
  score?: { strain?: number }
}

// Only SCORED records carry real measurements; PENDING_SCORE and UNSCORABLE come back with an
// empty or partial `score` that would otherwise be stored as though it were a reading.
const SCORED = 'SCORED'

// Whoop timestamps are UTC; bucketing by their date string put any evening workout (7pm+ local)
// on the next day, where it could no longer line up with the Apple Health copy of the same
// session. Convert to home timezone before taking the date. HOME_TZ comes from
// shared/utils/time.ts, which is also where "today" is derived for the same reason.
const localDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOME_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
})

function dateFromTimestamp(ts?: string | null): string | null {
  if (!ts) return null
  const parsed = new Date(ts)
  return Number.isNaN(parsed.getTime()) ? null : localDateFmt.format(parsed)
}

const KJ_PER_KCAL = 4.184
const METERS_PER_MILE = 1609.34

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

/**
 * Newest-last, so a plain loop that assigns into a per-date map leaves the newest record for each
 * date in place. The API returns collections newest-first, and nothing in it guarantees that —
 * relying on the arrival order made "which sleep won a given date" an accident of the response.
 */
function oldestFirst<T>(records: T[], timestamp: (r: T) => string | null | undefined): T[] {
  return [...records].sort((a, b) => String(timestamp(a) ?? '').localeCompare(String(timestamp(b) ?? '')))
}

function mapWhoopWorkout(w: WhoopWorkoutRecord): WorkoutUpsert | null {
  const date = dateFromTimestamp(w.start)
  if (!w.id || !date) return null

  let durationMin: number | null = null
  if (w.start && w.end) {
    const ms = new Date(w.end).getTime() - new Date(w.start).getTime()
    if (ms > 0) durationMin = Math.round(ms / 60000 * 10) / 10
  }

  // score is only populated once Whoop has scored the activity; guard every field.
  const s = w.score_state === SCORED ? w.score : undefined

  return {
    external_id: `whoop:${w.id}`,
    date,
    workout_type: w.sport_name || 'Workout',
    start_time: w.start ?? null,
    duration_min: durationMin,
    calories: s?.kilojoule != null ? Math.round(s.kilojoule / KJ_PER_KCAL) : null,
    avg_hr: s?.average_heart_rate ?? null,
    max_hr: s?.max_heart_rate ?? null,
    distance_mi: s?.distance_meter != null ? Math.round(s.distance_meter / METERS_PER_MILE * 100) / 100 : null
  }
}

export default defineTask({
  meta: {
    name: 'whoop:sync',
    description: 'Refresh Whoop OAuth token and sync Recovery/Strain/Sleep Performance into health_metrics'
  },
  async run(event) {
    const db = ((event.context as unknown as { cloudflare: { env: Env } }).cloudflare.env).DB

    const status = await getWhoopStatus(db)
    if (!status.connected) {
      const message = status.lastError ?? 'Whoop is not connected'
      console.error('Whoop sync skipped:', message)
      return { result: { touched: 0, workouts: 0, dates: [], errors: [message] } }
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

    const byDate: Record<string, Partial<Record<HealthMetricField, number>>> = {}

    // Recovery records have no start/end of their own (tied to a sleep/cycle id) - created_at is
    // the closest approximation to "the day this recovery is for", needs confirming live.
    for (const r of oldestFirst(recovery, r => r.created_at)) {
      if (r.score_state !== SCORED) continue
      const date = dateFromTimestamp(r.created_at)
      const score = r.score?.recovery_score
      if (date && typeof score === 'number') byDate[date] = { ...byDate[date], recovery_score: score }
    }

    for (const s of oldestFirst(sleep, s => s.end)) {
      // A nap is a second sleep record for the same day, scored against a nap's own (much
      // shorter) need — letting one land would overwrite the night's performance with ~10%.
      if (s.nap || s.score_state !== SCORED) continue
      const date = dateFromTimestamp(s.end)
      const score = s.score?.sleep_performance_percentage
      if (date && typeof score === 'number') byDate[date] = { ...byDate[date], sleep_performance_pct: score }
    }

    for (const c of oldestFirst(cycles, c => c.start)) {
      // Bucket strain on the day the cycle STARTED. Whoop cycles run wake-to-wake, so a cycle
      // beginning Monday morning ends Tuesday morning — keying off `end` filed Monday's strain
      // under Tuesday, one day later than the sleep and recovery beside it, and every digest
      // then narrated the previous day's number as today's.
      if (c.score_state !== SCORED) continue
      const date = dateFromTimestamp(c.start)
      const score = c.score?.strain
      if (date && typeof score === 'number') byDate[date] = { ...byDate[date], strain: score }
    }

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
        const row = mapWhoopWorkout(record)
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
    if (errors.length) await markWhoopError(db, errors.join(' · '))
    else await markWhoopSynced(db)

    return { result: { touched, workouts, dates: Object.keys(byDate).sort(), ...(errors.length ? { errors } : {}) } }
  }
})
