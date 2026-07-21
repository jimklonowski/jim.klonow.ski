/// <reference path="../../../worker-configuration.d.ts" />
import type { HealthMetricField, WorkoutUpsert } from '../../utils/db'

interface WhoopCollectionResponse<T> {
  records?: T[]
}

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
  score?: { recovery_score?: number }
}

interface WhoopSleepRecord {
  end?: string
  score?: { sleep_performance_percentage?: number }
}

interface WhoopCycleRecord {
  start?: string
  end?: string | null
  score?: { strain?: number }
}

// Whoop timestamps are UTC; bucketing by their date string put any evening workout (7pm+ local)
// on the next day, where it could no longer line up with the Apple Health copy of the same
// session. Convert to home timezone before taking the date. The en-CA locale is used purely
// because it formats dates as ISO YYYY-MM-DD (en-US would give 07/20/2026); the timeZone
// option does the actual conversion.
const HOME_TZ = 'America/Chicago'
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

function mapWhoopWorkout(w: WhoopWorkoutRecord): WorkoutUpsert | null {
  const date = dateFromTimestamp(w.start)
  if (!w.id || !date) return null

  let durationMin: number | null = null
  if (w.start && w.end) {
    const ms = new Date(w.end).getTime() - new Date(w.start).getTime()
    if (ms > 0) durationMin = Math.round(ms / 60000 * 10) / 10
  }

  // score is only populated once Whoop has scored the activity; guard every field.
  const s = w.score_state === 'SCORED' ? w.score : undefined

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

    // Whoop's collections are sorted descending by start time, so the default first page is
    // already "most recent" - no pagination needed for a daily incremental sync. Each collection
    // is fetched independently: a Whoop 5xx on one endpoint shouldn't cost the day's data from
    // the others (there's no retry until tomorrow's cron).
    const [recoveryRes, sleepRes, cyclesRes] = await Promise.allSettled([
      whoopFetch<WhoopCollectionResponse<WhoopRecoveryRecord>>(db, '/v2/recovery'),
      whoopFetch<WhoopCollectionResponse<WhoopSleepRecord>>(db, '/v2/activity/sleep'),
      whoopFetch<WhoopCollectionResponse<WhoopCycleRecord>>(db, '/v2/cycle')
    ])

    const errors: string[] = []
    function settled<T>(res: PromiseSettledResult<T>, label: string): T | null {
      if (res.status === 'fulfilled') return res.value
      const message = res.reason instanceof Error ? res.reason.message : String(res.reason)
      errors.push(`${label}: ${message}`)
      console.error(`Whoop ${label} sync skipped:`, message)
      return null
    }

    const recovery = settled(recoveryRes, 'recovery') ?? { records: [] }
    const sleep = settled(sleepRes, 'sleep') ?? { records: [] }
    const cycles = settled(cyclesRes, 'cycle') ?? { records: [] }

    const byDate: Record<string, Partial<Record<HealthMetricField, number>>> = {}

    // Recovery records have no start/end of their own (tied to a sleep/cycle id) - created_at is
    // the closest approximation to "the day this recovery is for", needs confirming live.
    for (const r of recovery.records ?? []) {
      const date = dateFromTimestamp(r.created_at)
      const score = r.score?.recovery_score
      if (date && typeof score === 'number') byDate[date] = { ...byDate[date], recovery_score: score }
    }

    for (const s of sleep.records ?? []) {
      const date = dateFromTimestamp(s.end)
      const score = s.score?.sleep_performance_percentage
      if (date && typeof score === 'number') byDate[date] = { ...byDate[date], sleep_performance_pct: score }
    }

    for (const c of cycles.records ?? []) {
      const date = dateFromTimestamp(c.end ?? c.start)
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
      const res = await whoopFetch<WhoopCollectionResponse<WhoopWorkoutRecord>>(db, '/v2/activity/workout')
      for (const record of res.records ?? []) {
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

    return { result: { touched, workouts, dates: Object.keys(byDate).sort(), ...(errors.length ? { errors } : {}) } }
  }
})
