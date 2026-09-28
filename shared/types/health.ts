import type { HealthCheck } from '../utils/health.ts'

/**
 * GET /api/health. Everyone gets `ok` (with 200 or 503, for an uptime monitor); only the owner
 * gets the per-check detail, which the footer's health popover lists.
 */
export interface HealthReport {
  ok: boolean
  checkedAt?: string
  checks?: HealthCheck[]
}
