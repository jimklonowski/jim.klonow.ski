import { zHealthWebhook } from '#shared/utils/schemas'
import { VITALS_SELECT, VITALS_UPSERT_SQL, vitalsBindings, vitalsOutcome } from '#shared/utils/vitalsUpsert'
import type { VitalsRow } from '#shared/utils/vitalsUpsert'
import { parseHealthExport } from '#shared/utils/healthExport'
import { workoutStartMs } from '#shared/utils/time'

/** Only a session from the last few days warrants a Whoop strain re-read; a backfill of old workouts doesn't. */
const STRAIN_REFRESH_WINDOW_MS = 3 * 86_400_000

/**
 * The most D1 statements one delivery may run. A Worker invocation has a query limit, and every
 * date costs at least one upsert (two with metrics) and every workout one or two — a multi-year
 * Health Auto Export backfill ran past it partway through, failed, and failed the same way on
 * every retry (audit #43 item 23). Under D1's 1,000 per invocation on Workers Paid, leaving room for
 * the Whoop status check and a strain refresh. History that large belongs to the XML import.
 */
const MAX_DELIVERY_STATEMENTS = 900

/** Statements per batch: a batch is one transaction, so a failure rolls back a slice, not the delivery. */
const BATCH_SIZE = 50

interface Workout {
  external_id: string | null
  date: string
  workout_type: string | null
  start_time: string | null
  duration_min: number | null
  calories: number | null
  avg_hr: number | null
  max_hr: number | null
  distance_mi: number | null
}

// Handles both `{ activeEnergyBurned: 450 }` and `{ activeEnergyBurned: { qty: 450 } }` shapes
// that different Health Auto Export versions have used for workout sub-fields.
function numOrQty(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).qty === 'number') {
    return (v as Record<string, unknown>).qty as number
  }
  return null
}

export default defineEventHandler(async (event) => {
  // Machine auth: WEBHOOK_TOKEN is the only accepted credential, and the route fails closed
  // without it. It used to fall back to LABS_SECRET — the cookie-signing key — which meant that
  // whenever the token wasn't set, a third-party iOS app was holding the secret that mints owner
  // sessions. The compare is constant-time (server/utils/auth.ts).
  const token = process.env.WEBHOOK_TOKEN
  if (!token) throw createError({ statusCode: 500, message: 'WEBHOOK_TOKEN is not configured' })
  if (!safeEqual(getHeader(event, 'authorization'), `Bearer ${token}`)) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // zHealthWebhook keeps every well-formed metric and workout and drops the rest, so one odd item
  // in a batch can't fail the sync (a metric without a data array used to throw mid-loop).
  const { data: { metrics, workouts: workoutsIn } } = await readValidatedJson(event, zHealthWebhook)

  // The per-date vitals and health metrics, every unit converted (shared/utils/healthExport.ts,
  // tested) — including the steps, energies, respiratory rate, SpO2, waist, water and the sleep
  // start/end stamps the webhook used to drop (audit #43 item 56).
  const { byDate, healthByDate } = parseHealthExport(metrics)

  const workouts: Workout[] = []
  for (const w of workoutsIn) {
    const start = typeof w.start === 'string' ? w.start : null
    const dateStr = start?.substring(0, 10) ?? null
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

    const durationSec = typeof w.duration === 'number' ? w.duration : null
    const calories = numOrQty(w.activeEnergyBurned)
    const distance = numOrQty(w.distance)
    const avgHr = numOrQty(w.avgHeartRate) ?? numOrQty(w.heartRateData)
    const maxHr = numOrQty(w.maxHeartRate)

    workouts.push({
      external_id: typeof w.id === 'string' ? w.id : null,
      date: dateStr,
      workout_type: typeof w.name === 'string' ? w.name : null,
      start_time: start,
      duration_min: durationSec != null ? Math.round(durationSec / 6) / 10 : null,
      calories: calories != null ? Math.round(calories) : null,
      avg_hr: avgHr != null ? Math.round(avgHr) : null,
      max_hr: maxHr != null ? Math.round(maxHr) : null,
      distance_mi: distance != null ? Math.round(distance * 10) / 10 : null
    })
  }

  // getRealDb: this is the owner's own Apple Health data, authenticated by the bearer token, not
  // by a session. getDb would route by whatever cookie happened to ride along (a demo one, say).
  const db = getRealDb(event)
  const created: string[] = []
  const updated: string[] = []

  // A date bucket is created for every well-formed point, recognized metric or not — an
  // unrecognized-only day used to INSERT a completely blank journal row, which then read as
  // "data" everywhere (it was the main source of unfillable digest gaps).
  const vitalDates = Object.entries(byDate).filter(([, vitals]) => Object.keys(vitals).length > 0)
  // Health metrics and workouts in batches, not a round trip per row (server/utils/db.ts).
  const metricStatements = Object.entries(healthByDate)
    .filter(([, metricsForDate]) => Object.keys(metricsForDate).length > 0) // same blank-bucket rule as vitals
    .map(([date, metricsForDate]) => healthMetricsStatement(db, date, metricsForDate))
    .filter((s): s is D1PreparedStatement => s != null)

  // Refused whole, before anything is written, rather than failing partway through every retry.
  const statementCount = vitalDates.length + Math.ceil(vitalDates.length / 90) + metricStatements.length + workouts.length * 2
  if (statementCount > MAX_DELIVERY_STATEMENTS) {
    throw createError({
      statusCode: 413,
      message: `This delivery covers ${vitalDates.length} days of vitals, ${metricStatements.length} of health metrics and ${workouts.length} workouts — more than one request can write. Send a shorter date range, or load the history once through Tools → Import.`
    })
  }

  if (vitalDates.length) {
    // The write is one INSERT … ON CONFLICT DO UPDATE per date, batched, filling only blanks
    // (shared/utils/vitalsUpsert.ts). It used to SELECT then INSERT, and a quick-add creating the
    // row in between was a primary-key failure that dropped the whole delivery. The snapshot
    // below only serves the created/updated report; the write does not depend on it.
    const before = new Map<string, VitalsRow>()
    const dates = vitalDates.map(([date]) => date)
    for (let i = 0; i < dates.length; i += 90) {
      const chunk = dates.slice(i, i + 90)
      const { results } = await db.prepare(`SELECT ${VITALS_SELECT} FROM journal_entries WHERE date IN (${chunk.map((_, j) => `?${j + 1}`).join(', ')})`)
        .bind(...chunk).all<VitalsRow>()
      for (const row of results ?? []) before.set(row.date, row)
    }
    for (let i = 0; i < vitalDates.length; i += BATCH_SIZE) {
      const chunk = vitalDates.slice(i, i + BATCH_SIZE)
      const written = await db.batch<VitalsRow>(chunk.map(([date, vitals]) => db.prepare(VITALS_UPSERT_SQL).bind(...vitalsBindings(date, vitals))))
      chunk.forEach(([date], j) => {
        const outcome = vitalsOutcome(before.get(date), written[j]?.results?.[0])
        if (outcome === 'created') created.push(date)
        else if (outcome === 'updated') updated.push(date)
      })
    }
  }

  const healthMetricsTouched = await runBatched(db, metricStatements, BATCH_SIZE)

  await upsertWorkouts(db, workouts)

  // A workout moves the day's Whoop strain, and Whoop has no webhook for strain: when this
  // delivery carries a recent session and the Whoop account is connected, re-read the open cycle
  // so the home page's strain follows the workout (Jim, 2026-10-21: disc golf on the page, strain
  // still the morning's 4.1 until a manual re-sync). Best effort — this is Apple's delivery, and
  // a Whoop hiccup must not fail it; the nightly sync reconciles.
  let strain: string[] | null = null
  const recentWorkout = workouts.some((w) => {
    const ms = workoutStartMs(w.start_time)
    return ms != null && Date.now() - ms < STRAIN_REFRESH_WINDOW_MS
  })
  if (recentWorkout && (await getWhoopStatus(db)).connected) {
    strain = await refreshWhoopStrain(db).catch(async (err: unknown) => {
      const message = errorMessage(err)
      logError('health-webhook', 'whoop strain refresh after workout failed', message)
      await markWhoopError(db, `strain after workout: ${message}`).catch(() => {})
      return null
    })
  }

  return {
    ok: true,
    created: created.length,
    updated: updated.length,
    healthMetrics: healthMetricsTouched,
    workouts: workouts.length,
    strain,
    dates: [...created, ...updated].sort()
  }
})
