// Whoop v2 records → this app's rows, shared by the nightly whoop:sync task (collections) and the
// webhook (one record per event), so a pushed record lands on exactly the date and in exactly the
// shape the reconciling cron would give it. Framework-free: tested under node, and the signature
// check uses only WebCrypto, which Workers and node both have.
import { localDayOf } from './time.ts'

/**
 * What a failed token refresh means for the stored connection (server/utils/whoop.ts acts on it).
 * Whoop refresh tokens are single-use, and webhooks arrive in bursts across isolates, so a
 * rejected refresh usually means "someone else already rotated this token", not "the grant is
 * dead" — and revoking on sight (the pre-2026-09-29 behavior) killed the connection the winner
 * had just refreshed, until a manual reconnect.
 *
 *   - 'adopt-rotated': the stored refresh token is no longer the one we tried — a concurrent
 *     refresh won; use the stored pair.
 *   - 'revoke-if-current': the grant itself was rejected (400 invalid_grant / 401 invalid_client)
 *     and the row still holds the rejected token. Revoke conditionally on that token, so a
 *     photo-finish winner's save is never clobbered.
 *   - 'transient': a 429 or 5xx (or any status that isn't a grant rejection) — leave the
 *     connection alone and let the next run retry. A truly dead grant that only ever answers an
 *     odd status keeps surfacing through last_error and /api/health instead of a false revoke.
 */
export type WhoopRefreshFailurePlan = 'adopt-rotated' | 'revoke-if-current' | 'transient'

export function planWhoopRefreshFailure(status: number, storedRefreshToken: string | null, usedRefreshToken: string): WhoopRefreshFailurePlan {
  if (status !== 400 && status !== 401) return 'transient'
  if (storedRefreshToken && storedRefreshToken !== usedRefreshToken) return 'adopt-rotated'
  return 'revoke-if-current'
}

/**
 * One Whoop data request with a single retry on 401. An access token can be rejected before its
 * stored expiry — the grant revoked on Whoop's side, or the pair rotated by another isolate — and
 * every fetch then failed as an opaque 502 while the menu still read "connected", until the expiry
 * finally forced a refresh (audit #43 item 25). The forced refresh is where the outcome is
 * decided (planWhoopRefreshFailure): a rotated pair is adopted, a dead grant is revoked and the
 * menu asks for a reconnect. A second 401 after a successful refresh is handed back as-is.
 */
export async function withTokenRetry(
  tokens: { access_token: string, refresh_token: string },
  send: (accessToken: string) => Promise<Response>,
  refresh: (refreshToken: string) => Promise<{ access_token: string }>
): Promise<Response> {
  const res = await send(tokens.access_token)
  if (res.status !== 401) return res
  const fresh = await refresh(tokens.refresh_token)
  return send(fresh.access_token)
}

export interface WhoopWorkoutRecord {
  id?: string
  start?: string
  end?: string
  sport_name?: string
  score_state?: string
  score?: {
    strain?: number
    average_heart_rate?: number
    max_heart_rate?: number
    kilojoule?: number
    distance_meter?: number
    /** Milliseconds in each heart-rate zone, zone 0 (below 50 % of max) through zone 5. */
    zone_durations?: {
      zone_zero_milli?: number
      zone_one_milli?: number
      zone_two_milli?: number
      zone_three_milli?: number
      zone_four_milli?: number
      zone_five_milli?: number
    }
  }
}

export interface WhoopRecoveryRecord {
  cycle_id?: number
  sleep_id?: string
  created_at?: string
  score_state?: string
  score?: {
    recovery_score?: number
    spo2_percentage?: number
    skin_temp_celsius?: number
  }
}

export interface WhoopSleepRecord {
  id?: string
  cycle_id?: number
  end?: string
  /** True for a nap. Naps carry their own (low) performance score and must not overwrite the night. */
  nap?: boolean
  score_state?: string
  score?: {
    sleep_performance_percentage?: number
    sleep_consistency_percentage?: number
    sleep_efficiency_percentage?: number
    respiratory_rate?: number
  }
}

export interface WhoopCycleRecord {
  start?: string
  /** Absent while the cycle is still running. */
  end?: string | null
  score_state?: string
  score?: { strain?: number }
}

/** The health_metrics columns Whoop feeds (the last five since migration 0016, audit #43 item 57). */
export type WhoopMetricField
  = 'recovery_score' | 'sleep_performance_pct' | 'strain'
    | 'skin_temp_c' | 'whoop_spo2_pct' | 'whoop_resp_rate' | 'sleep_consistency_pct' | 'sleep_efficiency_pct'

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
  /** The session's strain, once scored. */
  strain: number | null
  /** Minutes in zones 0–5, once scored and when Whoop reports them. */
  hr_zones: number[] | null
}

// Only SCORED records carry real measurements; PENDING_SCORE and UNSCORABLE come back with an
// empty or partial `score` that would otherwise be stored as though it were a reading.
const SCORED = 'SCORED'

// Whoop timestamps are UTC; bucketing by their date string put any evening workout (7pm+ local)
// on the next day, where it could no longer line up with the Apple Health copy of the same
// session. Convert to home timezone before taking the date. HOME_TZ comes from
// shared/utils/time.ts, which is also where "today" is derived for the same reason.
// The formatter itself is time.ts's (`localDayOf`), the one Chicago-day formatter — this file
// had a second copy until audit #42 item 40. The guard stays: localDayOf throws on an invalid
// timestamp, and a webhook can hand us one.
export function whoopLocalDate(ts?: string | null): string | null {
  if (!ts) return null
  const parsed = new Date(ts)
  return Number.isNaN(parsed.getTime()) ? null : localDayOf(ts)
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
    distance_mi: s?.distance_meter != null ? Math.round(s.distance_meter / METERS_PER_MILE * 100) / 100 : null,
    strain: typeof s?.strain === 'number' ? Math.round(s.strain * 10) / 10 : null,
    hr_zones: zoneMinutes(s?.zone_durations)
  }
}

const ZONE_KEYS = ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'] as const

/** Whoop's zone durations (ms) as minutes to a tenth, zones 0–5; null unless every zone is given. */
function zoneMinutes(z: NonNullable<WhoopWorkoutRecord['score']>['zone_durations']): number[] | null {
  if (!z) return null
  const out = ZONE_KEYS.map(k => z[k])
  if (!out.every((v): v is number => typeof v === 'number')) return null
  return out.map(ms => Math.round(ms / 6000) / 10)
}

/** The `workouts.external_id` a Whoop workout id is stored under. */
export const whoopWorkoutKey = (id: string) => `whoop:${id}`

/** Every numeric score field present, each as a metric on `date`. */
function scoreMetrics(date: string | null, pairs: Array<[WhoopMetricField, unknown, number?]>): WhoopMetric[] {
  if (!date) return []
  return pairs.flatMap(([field, value, decimals]) =>
    typeof value === 'number' && Number.isFinite(value)
      ? [{ date, field, value: decimals == null ? value : Math.round(value * 10 ** decimals) / 10 ** decimals }]
      : []
  )
}

// Recovery records have no start/end of their own (tied to a sleep/cycle id) - created_at is
// the closest approximation to "the day this recovery is for". The score, plus the SpO2 and skin
// temperature Whoop measures overnight (audit #43 item 57).
export function recoveryMetrics(r: WhoopRecoveryRecord): WhoopMetric[] {
  if (r.score_state !== SCORED) return []
  return scoreMetrics(whoopLocalDate(r.created_at), [
    ['recovery_score', r.score?.recovery_score],
    ['whoop_spo2_pct', r.score?.spo2_percentage, 1],
    ['skin_temp_c', r.score?.skin_temp_celsius, 2]
  ])
}

/** The recovery score alone — the shape the older callers and tests read. */
export function recoveryMetric(r: WhoopRecoveryRecord): WhoopMetric | null {
  return recoveryMetrics(r).find(m => m.field === 'recovery_score') ?? null
}

// The night's performance, plus its consistency, efficiency and respiratory rate (item 57).
export function sleepMetrics(s: WhoopSleepRecord): WhoopMetric[] {
  // A nap is a second sleep record for the same day, scored against a nap's own (much
  // shorter) need — letting one land would overwrite the night's performance with ~10%.
  if (s.nap || s.score_state !== SCORED) return []
  return scoreMetrics(whoopLocalDate(s.end), [
    ['sleep_performance_pct', s.score?.sleep_performance_percentage],
    ['sleep_consistency_pct', s.score?.sleep_consistency_percentage],
    ['sleep_efficiency_pct', s.score?.sleep_efficiency_percentage, 1],
    ['whoop_resp_rate', s.score?.respiratory_rate, 1]
  ])
}

export function sleepMetric(s: WhoopSleepRecord): WhoopMetric | null {
  return sleepMetrics(s).find(m => m.field === 'sleep_performance_pct') ?? null
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
  toMetric: (r: T) => WhoopMetric | WhoopMetric[] | null,
  into: Record<string, Partial<Record<WhoopMetricField, number>>> = {}
): Record<string, Partial<Record<WhoopMetricField, number>>> {
  const sorted = [...records].sort((a, b) => String(stamp(a) ?? '').localeCompare(String(stamp(b) ?? '')))
  for (const record of sorted) {
    const out = toMetric(record)
    for (const m of Array.isArray(out) ? out : out ? [out] : []) into[m.date] = { ...into[m.date], [m.field]: m.value }
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
