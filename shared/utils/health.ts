// The rules behind /api/health: is every scheduled task running on time, and is every data feed
// still arriving? Pure, so tests/health.test.mjs can pin the edge cases; the endpoint only
// gathers the timestamps.
//
// Relative imports carry an explicit .ts: tests load this under Node's native type stripping.
import { diffDays } from './dates.ts'

export type CheckStatus = 'ok' | 'pending' | 'stale' | 'failing'

export interface HealthCheck {
  name: string
  status: CheckStatus
  detail: string
}

/** Only these two keep the site healthy; 'pending' is "no evidence yet", not a problem. */
export function isHealthy(checks: HealthCheck[]): boolean {
  return checks.every(c => c.status === 'ok' || c.status === 'pending')
}

export interface TaskHistory {
  lastOkAt: string | null
  lastRunAt: string | null
  lastRunOk: boolean | null
  lastError: string | null
}

const HOUR = 3_600_000

function hoursAgo(iso: string, now: number): number {
  return Math.round((now - Date.parse(iso)) / HOUR)
}

/**
 * A task is failing if its latest run threw, stale if its last clean run is older than its
 * window, and pending if it has never run cleanly but the run log itself is younger than the
 * window — a fresh deploy (or a freshly created task_runs) mustn't alarm before the first run
 * was even due. `logSince` is the oldest row in task_runs, null when it's empty.
 */
export function taskCheck(task: string, staleAfterHours: number, h: TaskHistory, logSince: string | null, now: number): HealthCheck {
  const name = `task:${task}`
  if (h.lastRunAt && h.lastRunOk === false) {
    return { name, status: 'failing', detail: `last run ${hoursAgo(h.lastRunAt, now)}h ago failed: ${h.lastError ?? 'unknown error'}` }
  }
  if (h.lastOkAt) {
    const age = hoursAgo(h.lastOkAt, now)
    return age <= staleAfterHours
      ? { name, status: 'ok', detail: `last ran ${age}h ago` }
      : { name, status: 'stale', detail: `last clean run ${age}h ago (expected within ${staleAfterHours}h)` }
  }
  const logAge = logSince ? hoursAgo(logSince, now) : 0
  return logAge <= staleAfterHours
    ? { name, status: 'pending', detail: 'no run logged yet' }
    : { name, status: 'stale', detail: `never ran cleanly in ${logAge}h of run log (expected within ${staleAfterHours}h)` }
}

export interface Feed {
  name: string
  /** Latest date (YYYY-MM-DD) the feed delivered, null if it never has. */
  latest: string | null
  /** Days behind today before the feed counts as stale. */
  staleAfterDays: number
}

/** Data feeds, days behind today (home timezone). Every one of them lands daily. */
export const FEED_STALE_AFTER_DAYS = {
  // Apple Health via Health Auto Export → /api/journal/health-webhook.
  'apple:sleep': 2,
  'apple:weight': 3,
  // Whoop, via the nightly whoop:sync.
  'whoop:recovery': 2
} as const

export function feedCheck(feed: Feed, today: string): HealthCheck {
  const name = `feed:${feed.name}`
  if (!feed.latest) return { name, status: 'stale', detail: 'no data ever received' }
  const behind = diffDays(feed.latest, today)
  return behind <= feed.staleAfterDays
    ? { name, status: 'ok', detail: `latest ${feed.latest}` }
    : { name, status: 'stale', detail: `latest ${feed.latest}, ${behind} days ago (expected within ${feed.staleAfterDays})` }
}
