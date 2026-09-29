import type { HealthCheck } from '../utils/health.ts'

/**
 * GET /api/health. Everyone gets `ok` (with 200 or 503, for an uptime monitor), but an anonymous
 * caller's answer covers only the task checks — the feed checks are personal. The owner and a
 * `?token=<HEALTH_TOKEN>` monitor get the feeds counted in plus the per-check detail, which the
 * footer's health popover lists.
 */
export interface HealthReport {
  ok: boolean
  checkedAt?: string
  checks?: HealthCheck[]
}
