import { SCHEDULED_TASKS, TASK_STALE_AFTER_HOURS } from '../schedule'
import { FEED_STALE_AFTER_DAYS, feedCheck, isHealthy, taskCheck, type HealthCheck, type TaskHistory } from '#shared/utils/health'
import { localToday } from '#shared/utils/time'

// Is the site still doing its unattended work? Every scheduled task against its cadence (from
// task_runs) and every data feed against its expected daily arrival.
//
// Built for an uptime monitor: anyone gets `{ ok }` with 200 or 503, and nothing else. The data
// dates alone would say when the owner last weighed in or slept, so the per-check detail is
// owner-only. Always the real DB — a demo session's health is not the site's.

interface RunRow {
  task: string
  last_ok_at: string | null
  last_run_at: string
}

interface LatestRow {
  task: string
  ok: number
  error: string | null
}

async function taskChecks(db: D1Database, now: number): Promise<HealthCheck[]> {
  let runs: RunRow[]
  let latest: LatestRow[]
  let logSince: string | null
  try {
    const [a, b, c] = await db.batch([
      db.prepare(`
        SELECT task, MAX(CASE WHEN ok = 1 THEN started_at END) AS last_ok_at, MAX(started_at) AS last_run_at
        FROM task_runs GROUP BY task
      `),
      db.prepare(`
        SELECT t.task, t.ok, t.error FROM task_runs t
        JOIN (SELECT task, MAX(started_at) AS m FROM task_runs GROUP BY task) x
          ON x.task = t.task AND x.m = t.started_at
      `),
      db.prepare('SELECT MIN(started_at) AS since FROM task_runs')
    ])
    runs = (a!.results ?? []) as RunRow[]
    latest = (b!.results ?? []) as LatestRow[]
    logSince = ((c!.results ?? [])[0] as { since: string | null } | undefined)?.since ?? null
  }
  catch {
    return [{ name: 'task_runs', status: 'failing', detail: 'task_runs table missing — run pnpm db:migrate:remote' }]
  }

  const tasks = [...new Set(Object.values(SCHEDULED_TASKS).flat())]
  return tasks.map((task) => {
    const run = runs.find(r => r.task === task)
    const last = latest.find(r => r.task === task)
    const history: TaskHistory = {
      lastOkAt: run?.last_ok_at ?? null,
      lastRunAt: run?.last_run_at ?? null,
      lastRunOk: last ? last.ok === 1 : null,
      lastError: last?.error ?? null
    }
    return taskCheck(task, TASK_STALE_AFTER_HOURS[task] ?? 26, history, logSince, now)
  })
}

async function feedChecks(db: D1Database, today: string): Promise<HealthCheck[]> {
  const row = await db.prepare(`
    SELECT
      (SELECT MAX(date) FROM health_metrics WHERE sleep_total_min IS NOT NULL) AS sleep,
      (SELECT MAX(date) FROM journal_entries WHERE weight_lbs IS NOT NULL) AS weight,
      (SELECT MAX(date) FROM health_metrics WHERE recovery_score IS NOT NULL) AS recovery
  `).first<{ sleep: string | null, weight: string | null, recovery: string | null }>()
  return [
    feedCheck({ name: 'apple:sleep', latest: row?.sleep ?? null, staleAfterDays: FEED_STALE_AFTER_DAYS['apple:sleep'] }, today),
    feedCheck({ name: 'apple:weight', latest: row?.weight ?? null, staleAfterDays: FEED_STALE_AFTER_DAYS['apple:weight'] }, today),
    feedCheck({ name: 'whoop:recovery', latest: row?.recovery ?? null, staleAfterDays: FEED_STALE_AFTER_DAYS['whoop:recovery'] }, today)
  ]
}

export default defineEventHandler(async (event) => {
  const db = getRealDb(event)
  const now = Date.now()
  const checks = [...await taskChecks(db, now), ...await feedChecks(db, localToday())]
  const ok = isHealthy(checks)

  setResponseStatus(event, ok ? 200 : 503)
  setHeader(event, 'Cache-Control', 'no-store')
  return event.context.auth?.role === 'owner'
    ? { ok, checkedAt: new Date(now).toISOString(), checks }
    : { ok }
})
