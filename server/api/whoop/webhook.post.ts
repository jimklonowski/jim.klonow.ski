import { zWhoopWebhook } from '#shared/utils/schemas'
import { cycleMetric, metricsByDate, recoveryMetric, sleepMetric, verifyWhoopSignature, whoopWorkoutKey, whoopWorkoutRow } from '#shared/utils/whoopRecords'
import type { WhoopCycleRecord, WhoopRecoveryRecord, WhoopSleepRecord, WhoopWorkoutRecord } from '#shared/utils/whoopRecords'

// Whoop's push channel (developer.whoop.com/docs/developing/webhooks, v2 model). Whoop POSTs
// { user_id, id, type, trace_id } when a sleep, recovery or workout is scored, changed or
// deleted; the body names the record, so each delivery re-reads that one record and upserts it
// exactly as the nightly whoop:sync would (shared/utils/whoopRecords.ts). The cron stays as the
// reconciliation pass — a delivery can be missed, and strain has no webhook at all.
//
// Machine auth only: the signature (HMAC-SHA256 over timestamp + raw body, keyed with the app's
// client secret) is the credential, so there is no cookie and no requireOwner. Anything that
// fails it is a 401 before the body is even parsed.
//
// Status codes are chosen for Whoop's retry rule (five retries over ~1 hour on anything but a
// 2xx): events we can't or needn't act on are acknowledged with 200, and only a failure that a
// retry could fix (Whoop's API or D1 having a moment) returns 502.

// v2 ids are UUIDs. A v1 (integer) delivery can't be looked up against the v2 API this app reads.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A recovery event means a sleep just ended, and with it the previous cycle — whose strain is
// now final. Strain has no webhook of its own, so re-read the last few cycles here.
const STRAIN_LOOKBACK_MS = 3 * 86_400_000

type Hook = { id: string, type: string }

async function handle(db: D1Database, hook: Hook) {
  switch (hook.type) {
    case 'sleep.updated': {
      const sleep = await whoopFetchOne<WhoopSleepRecord>(db, `/v2/activity/sleep/${hook.id}`)
      if (!sleep) return { skipped: 'sleep no longer exists' }
      const m = sleepMetric(sleep)
      if (!m) return { skipped: sleep.nap ? 'nap' : 'not scored yet' }
      await upsertHealthMetrics(db, m.date, { [m.field]: m.value })
      return { dates: [m.date], fields: [m.field] }
    }
    case 'recovery.updated': {
      // The id is the recovery's sleep; the recovery itself is read through that sleep's cycle.
      const sleep = await whoopFetchOne<WhoopSleepRecord>(db, `/v2/activity/sleep/${hook.id}`)
      if (!sleep?.cycle_id) return { skipped: 'sleep no longer exists' }
      const [recovery, cycles] = await Promise.all([
        whoopFetchOne<WhoopRecoveryRecord>(db, `/v2/cycle/${sleep.cycle_id}/recovery`),
        whoopFetchAll<WhoopCycleRecord>(db, '/v2/cycle', {
          start: new Date(Date.now() - STRAIN_LOOKBACK_MS).toISOString(),
          maxPages: 1
        })
      ])
      const byDate = metricsByDate(recovery ? [recovery] : [], r => r.created_at, recoveryMetric)
      metricsByDate([sleep], s => s.end, sleepMetric, byDate)
      metricsByDate(cycles, c => c.start, cycleMetric, byDate)
      for (const [date, fields] of Object.entries(byDate)) await upsertHealthMetrics(db, date, fields)
      return {
        dates: Object.keys(byDate).sort(),
        fields: [...new Set(Object.values(byDate).flatMap(f => Object.keys(f)))].sort()
      }
    }
    case 'workout.updated': {
      const workout = await whoopFetchOne<WhoopWorkoutRecord>(db, `/v2/activity/workout/${hook.id}`)
      const row = workout && whoopWorkoutRow(workout)
      if (!row) return { skipped: 'workout no longer exists' }
      await upsertWorkout(db, row)
      return { dates: [row.date], workout: row.workout_type }
    }
    case 'workout.deleted': {
      // Automated writes aren't audited (server/utils/audit.ts covers owner edits).
      const res = await db.prepare('DELETE FROM workouts WHERE external_id = ?1').bind(whoopWorkoutKey(hook.id)).run()
      return { deleted: res.meta.changes ?? 0 }
    }
    default:
      // sleep.deleted / recovery.deleted: health_metrics keeps one value per day, not Whoop's
      // record ids, so there's no row to find; the next scored night overwrites the day anyway.
      // Anything else is an event type this app doesn't read.
      return { skipped: 'event not used' }
  }
}

export default defineEventHandler(async (event) => {
  const secret = process.env.WHOOP_CLIENT_SECRET
  if (!secret) throw createError({ statusCode: 500, message: 'WHOOP_CLIENT_SECRET is not configured' })

  const rawBody = (await readRawBody(event, 'utf8')) ?? ''
  const valid = await verifyWhoopSignature({
    rawBody,
    timestamp: getHeader(event, 'x-whoop-signature-timestamp'),
    signature: getHeader(event, 'x-whoop-signature'),
    secret
  })
  if (!valid) throw createError({ statusCode: 401, message: 'Invalid signature' })

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  }
  catch {
    throw createError({ statusCode: 400, message: 'Body is not JSON' })
  }
  const parsed = zWhoopWebhook.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Unexpected webhook body' })
  const hook = parsed.data

  // Only the real DB holds the Whoop connection (the demo sandbox has none).
  const db = getRealDb(event)
  if (!(await getWhoopStatus(db)).connected) return { ok: true, ignored: 'Whoop is not connected' }
  if (!UUID.test(hook.id)) return { ok: true, ignored: 'not a v2 id — set the webhook model version to v2' }

  try {
    const result = await runLogged(db, 'whoop:webhook', async () => ({ type: hook.type, ...await handle(db, hook) }))
    console.info(`[whoop:webhook] ${hook.type} ${hook.id} →`, JSON.stringify(result))
    return { ok: true, ...result }
  }
  catch (err) {
    // Surface it where the cron's failures show (the journal header's Whoop ⚠) until the next
    // clean sync clears it, and let Whoop retry.
    const message = err instanceof Error ? err.message : String(err)
    await markWhoopError(db, `webhook ${hook.type}: ${message}`).catch(() => {})
    throw createError({ statusCode: 502, message: 'Webhook processing failed; Whoop will retry' })
  }
})
