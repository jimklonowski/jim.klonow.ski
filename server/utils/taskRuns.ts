/// <reference path="../../worker-configuration.d.ts" />
import type { TaskEvent } from 'nitropack/types'

// Every scheduled task runs through runLoggedTask: it records the run in task_runs (what
// /api/health reads) and then lets a failure propagate. The tasks used to catch their own
// errors and return `{ error }`, which Cloudflare's cron log recorded as a successful
// invocation — a digest that failed every night for a week looked identical to one that worked.

/** A failed run that still has something worth logging (how far a partial sync got). */
export class TaskFailure extends Error {
  constructor(message: string, readonly result?: unknown) {
    super(message)
    this.name = 'TaskFailure'
  }
}

const RETENTION_DAYS = 90
// The run log is for "did it work, and roughly what happened" — a digest's full summary text
// has its own table, so an oversized result is cut rather than stored twice.
const MAX_RESULT_CHARS = 2000

/** The Worker env a scheduled task runs with. */
export function taskEnv(event: TaskEvent): Env {
  return (event.context as unknown as { cloudflare: { env: Env } }).cloudflare.env
}

function summarize(value: unknown): string | null {
  if (value === undefined) return null
  const json = JSON.stringify(value)
  return json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS - 1)}…` : json
}

async function record(db: D1Database, row: { task: string, started: number, ok: boolean, result?: unknown, error?: string }) {
  const finished = Date.now()
  try {
    await db.batch([
      db.prepare(`
        INSERT INTO task_runs (task, started_at, finished_at, duration_ms, ok, result, error)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `).bind(
        row.task, new Date(row.started).toISOString(), new Date(finished).toISOString(),
        finished - row.started, row.ok ? 1 : 0, summarize(row.result), row.error ?? null
      ),
      db.prepare('DELETE FROM task_runs WHERE started_at < ?1')
        .bind(new Date(finished - RETENTION_DAYS * 86_400_000).toISOString())
    ])
  }
  catch (err) {
    // Logging must never change a task's outcome: a missing table (migration not applied yet)
    // or a D1 hiccup is reported, and the task's own result or error still stands.
    console.error(`task_runs: could not record ${row.task}:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Runs `fn`, records the run in the main DB's task_runs, and returns Nitro's `{ result }`.
 * On failure the error is recorded and rethrown, so the cron invocation fails in Cloudflare's
 * log too. Throw a TaskFailure to also keep a partial result.
 */
export async function runLoggedTask<T>(event: TaskEvent, task: string, fn: (env: Env) => Promise<T>): Promise<{ result: T }> {
  const env = taskEnv(event)
  const started = Date.now()
  try {
    const result = await fn(env)
    await record(env.DB, { task, started, ok: true, result })
    return { result }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${task} failed:`, message)
    await record(env.DB, { task, started, ok: false, error: message, result: err instanceof TaskFailure ? err.result : undefined })
    throw err
  }
}
