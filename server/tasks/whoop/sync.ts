/// <reference path="../../../worker-configuration.d.ts" />
import type { HealthMetricField } from '../../utils/db'

interface WhoopCollectionResponse<T> {
  records?: T[]
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

function dateFromTimestamp(ts?: string | null): string | null {
  if (!ts) return null
  const date = ts.substring(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

export default defineTask({
  meta: {
    name: 'whoop:sync',
    description: 'Refresh Whoop OAuth token and sync Recovery/Strain/Sleep Performance into health_metrics'
  },
  async run(event) {
    const db = ((event.context as unknown as { cloudflare: { env: Env } }).cloudflare.env).DB

    // Whoop's collections are sorted descending by start time, so the default first page is
    // already "most recent" - no pagination needed for a daily incremental sync.
    const [recovery, sleep, cycles] = await Promise.all([
      whoopFetch<WhoopCollectionResponse<WhoopRecoveryRecord>>(db, '/v2/recovery'),
      whoopFetch<WhoopCollectionResponse<WhoopSleepRecord>>(db, '/v2/activity/sleep'),
      whoopFetch<WhoopCollectionResponse<WhoopCycleRecord>>(db, '/v2/cycle')
    ])

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

    return { result: { touched, dates: Object.keys(byDate).sort() } }
  }
})
