// Whoop v2 records → this app's rows, shared by the nightly whoop:sync task (collections) and the
// webhook (one record per event), so a pushed record lands on exactly the date and in exactly the
// shape the reconciling cron would give it. Framework-free: tested under node, and the signature
// check uses only WebCrypto, which Workers and node both have.
import { HOME_TZ } from './time.ts'

export interface WhoopWorkoutRecord {
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

export interface WhoopRecoveryRecord {
  cycle_id?: number
  sleep_id?: string
  created_at?: string
  score_state?: string
  score?: { recovery_score?: number }
}

export interface WhoopSleepRecord {
  id?: string
  cycle_id?: number
  end?: string
  /** True for a nap. Naps carry their own (low) performance score and must not overwrite the night. */
  nap?: boolean
  score_state?: string
  score?: { sleep_performance_percentage?: number }
}

export interface WhoopCycleRecord {
  start?: string
  /** Absent while the cycle is still running. */
  end?: string | null
  score_state?: string
  score?: { strain?: number }
}

/** The health_metrics columns Whoop feeds. */
export type WhoopMetricField = 'recovery_score' | 'sleep_performance_pct' | 'strain'

export interface WhoopMetric {
  date: string
  field: WhoopMetricField
  value: number
}

/** A workouts row (server/utils/db.ts WorkoutUpsert), keyed `whoop:<id>`. */
export interface WhoopWorkoutRow {
  external_id: string
  date: string
  workout_type: string
  start_time: string | null
  duration_min: number | null
  calories: number | null
  avg_hr: number | null
  max_hr: number | null
  distance_mi: number | null
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

export function whoopLocalDate(ts?: string | null): string | null {
  if (!ts) return null
  const parsed = new Date(ts)
  return Number.isNaN(parsed.getTime()) ? null : localDateFmt.format(parsed)
}

const KJ_PER_KCAL = 4.184
const METERS_PER_MILE = 1609.34

export function whoopWorkoutRow(w: WhoopWorkoutRecord): WhoopWorkoutRow | null {
  const date = whoopLocalDate(w.start)
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

/** The `workouts.external_id` a Whoop workout id is stored under. */
export const whoopWorkoutKey = (id: string) => `whoop:${id}`

// Recovery records have no start/end of their own (tied to a sleep/cycle id) - created_at is
// the closest approximation to "the day this recovery is for".
export function recoveryMetric(r: WhoopRecoveryRecord): WhoopMetric | null {
  if (r.score_state !== SCORED) return null
  const date = whoopLocalDate(r.created_at)
  const value = r.score?.recovery_score
  return date && typeof value === 'number' ? { date, field: 'recovery_score', value } : null
}

export function sleepMetric(s: WhoopSleepRecord): WhoopMetric | null {
  // A nap is a second sleep record for the same day, scored against a nap's own (much
  // shorter) need — letting one land would overwrite the night's performance with ~10%.
  if (s.nap || s.score_state !== SCORED) return null
  const date = whoopLocalDate(s.end)
  const value = s.score?.sleep_performance_percentage
  return date && typeof value === 'number' ? { date, field: 'sleep_performance_pct', value } : null
}

export function cycleMetric(c: WhoopCycleRecord): WhoopMetric | null {
  // Bucket strain on the day the cycle STARTED. Whoop cycles run wake-to-wake, so a cycle
  // beginning Monday morning ends Tuesday morning — keying off `end` filed Monday's strain
  // under Tuesday, one day later than the sleep and recovery beside it, and every digest
  // then narrated the previous day's number as today's.
  if (c.score_state !== SCORED) return null
  const date = whoopLocalDate(c.start)
  const value = c.score?.strain
  return date && typeof value === 'number' ? { date, field: 'strain', value } : null
}

/**
 * Metrics grouped per date, newest record winning. Records are sorted oldest-first by `stamp`
 * before merging: the API returns collections newest-first, and nothing in it guarantees that —
 * relying on the arrival order made "which sleep won a given date" an accident of the response.
 */
export function metricsByDate<T>(
  records: T[],
  stamp: (r: T) => string | null | undefined,
  toMetric: (r: T) => WhoopMetric | null,
  into: Record<string, Partial<Record<WhoopMetricField, number>>> = {}
): Record<string, Partial<Record<WhoopMetricField, number>>> {
  const sorted = [...records].sort((a, b) => String(stamp(a) ?? '').localeCompare(String(stamp(b) ?? '')))
  for (const record of sorted) {
    const m = toMetric(record)
    if (m) into[m.date] = { ...into[m.date], [m.field]: m.value }
  }
  return into
}

// --- Webhooks --------------------------------------------------------------

export const WHOOP_WEBHOOK_TYPES = [
  'workout.updated', 'workout.deleted', 'sleep.updated', 'sleep.deleted', 'recovery.updated', 'recovery.deleted'
] as const
export type WhoopWebhookType = typeof WHOOP_WEBHOOK_TYPES[number]

/**
 * How far a delivery's signed timestamp may sit from now. Whoop retries a failed delivery five
 * times over about an hour, and doesn't say whether a retry is re-signed, so the window has to
 * cover the whole retry run. A replay inside it is harmless anyway: the handler only re-reads
 * the named record from Whoop and upserts it.
 */
export const WHOOP_WEBHOOK_MAX_AGE_MS = 2 * 60 * 60 * 1000

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  catch {
    return null
  }
}

/**
 * Whoop's webhook signature check: `X-WHOOP-Signature` must equal
 * base64(HMAC-SHA256(timestamp + rawBody, client secret)), with the timestamp taken from
 * `X-WHOOP-Signature-Timestamp` (ms since epoch). crypto.subtle.verify compares in constant time.
 */
export async function verifyWhoopSignature(opts: {
  rawBody: string
  timestamp: string | null | undefined
  signature: string | null | undefined
  secret: string
  now?: number
}): Promise<boolean> {
  const { rawBody, timestamp, signature, secret } = opts
  if (!timestamp || !signature || !secret || !/^\d{10,16}$/.test(timestamp)) return false
  if (Math.abs((opts.now ?? Date.now()) - Number(timestamp)) > WHOOP_WEBHOOK_MAX_AGE_MS) return false
  const given = base64ToBytes(signature)
  if (!given) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, given, enc.encode(timestamp + rawBody))
}
