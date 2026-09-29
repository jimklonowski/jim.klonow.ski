// Whoop records → rows (shared/utils/whoopRecords.ts), shared by the nightly sync and the webhook,
// plus the webhook signature check.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  cycleMetric, metricsByDate, planWhoopRefreshFailure, recoveryMetric, sleepMetric,
  verifyWhoopSignature, WHOOP_WEBHOOK_MAX_AGE_MS, whoopLocalDate, whoopWorkoutRow
} from '../shared/utils/whoopRecords.ts'
import { zWhoopWebhook } from '../shared/utils/schemas.ts'

test('timestamps bucket on the home-timezone date, not the UTC one', () => {
  // 01:30 UTC on Sep 28 is the evening of Sep 27 in Chicago.
  assert.equal(whoopLocalDate('2026-09-28T01:30:00.000Z'), '2026-09-27')
  assert.equal(whoopLocalDate('2026-09-28T15:00:00.000Z'), '2026-09-28')
  assert.equal(whoopLocalDate('not a date'), null)
  assert.equal(whoopLocalDate(null), null)
})

test('only scored records become metrics, and naps never do', () => {
  const night = { end: '2026-09-28T12:00:00Z', nap: false, score_state: 'SCORED', score: { sleep_performance_percentage: 81 } }
  assert.deepEqual(sleepMetric(night), { date: '2026-09-28', field: 'sleep_performance_pct', value: 81 })
  assert.equal(sleepMetric({ ...night, nap: true }), null)
  assert.equal(sleepMetric({ ...night, score_state: 'PENDING_SCORE' }), null)

  const rec = { created_at: '2026-09-28T12:05:00Z', score_state: 'SCORED', score: { recovery_score: 70 } }
  assert.deepEqual(recoveryMetric(rec), { date: '2026-09-28', field: 'recovery_score', value: 70 })
  assert.equal(recoveryMetric({ ...rec, score_state: 'UNSCORABLE' }), null)
})

test('strain lands on the day its cycle started', () => {
  // A Monday-morning cycle ends Tuesday morning; its strain is Monday's.
  const cycle = { start: '2026-09-28T12:00:00Z', end: '2026-09-29T11:30:00Z', score_state: 'SCORED', score: { strain: 9.4 } }
  assert.deepEqual(cycleMetric(cycle), { date: '2026-09-28', field: 'strain', value: 9.4 })
})

test('merging per date keeps the newest record, whatever order the API returned them in', () => {
  const older = { end: '2026-09-28T11:00:00Z', score_state: 'SCORED', score: { sleep_performance_percentage: 60 } }
  const newer = { end: '2026-09-28T13:00:00Z', score_state: 'SCORED', score: { sleep_performance_percentage: 85 } }
  for (const order of [[older, newer], [newer, older]]) {
    assert.deepEqual(metricsByDate(order, s => s.end, sleepMetric), { '2026-09-28': { sleep_performance_pct: 85 } })
  }
  const into = { '2026-09-28': { recovery_score: 70 } }
  metricsByDate([newer], s => s.end, sleepMetric, into)
  assert.deepEqual(into, { '2026-09-28': { recovery_score: 70, sleep_performance_pct: 85 } })
})

test('a workout maps to its whoop:<id> row, with scores only once scored', () => {
  const w = {
    id: 'a1b2', start: '2026-09-28T22:00:00Z', end: '2026-09-28T22:45:30Z', sport_name: 'Cycling', score_state: 'SCORED',
    score: { average_heart_rate: 140, max_heart_rate: 171, kilojoule: 1600, distance_meter: 16093.4 }
  }
  assert.deepEqual(whoopWorkoutRow(w), {
    external_id: 'whoop:a1b2', date: '2026-09-28', workout_type: 'Cycling', start_time: w.start,
    duration_min: 45.5, calories: 382, avg_hr: 140, max_hr: 171, distance_mi: 10
  })
  const pending = whoopWorkoutRow({ ...w, score_state: 'PENDING_SCORE' })
  assert.equal(pending.calories, null)
  assert.equal(pending.avg_hr, null)
  assert.equal(whoopWorkoutRow({ ...w, id: undefined }), null)
})

const SECRET = 'test-client-secret'
const sign = (timestamp, body, secret = SECRET) => createHmac('sha256', secret).update(timestamp + body).digest('base64')

test('the webhook signature is base64 HMAC-SHA256 over timestamp + raw body', async () => {
  const now = 1790620000000
  const timestamp = String(now)
  const rawBody = '{"user_id":10129,"id":"550e8400-e29b-41d4-a716-446655440000","type":"sleep.updated","trace_id":"t"}'
  const ok = opts => verifyWhoopSignature({ rawBody, timestamp, signature: sign(timestamp, rawBody), secret: SECRET, now, ...opts })

  assert.equal(await ok({}), true)
  assert.equal(await ok({ rawBody: rawBody.replace('sleep', 'workout') }), false, 'tampered body')
  assert.equal(await ok({ secret: 'someone-else' }), false, 'wrong key')
  assert.equal(await ok({ signature: sign(String(now + 1), rawBody) }), false, 'signed with a different timestamp')
  assert.equal(await ok({ signature: 'not base64!!' }), false)
  assert.equal(await ok({ signature: null }), false)
  assert.equal(await ok({ timestamp: 'abc', signature: sign('abc', rawBody) }), false, 'timestamp must be ms digits')
})

test('the signed timestamp may be up to two hours old, covering Whoop\'s hour of retries', async () => {
  const rawBody = '{}'
  const at = 1790620000000
  const check = now => verifyWhoopSignature({ rawBody, timestamp: String(at), signature: sign(String(at), rawBody), secret: SECRET, now })
  assert.equal(await check(at + 65 * 60_000), true)
  assert.equal(await check(at + WHOOP_WEBHOOK_MAX_AGE_MS + 1), false)
  assert.equal(await check(at - WHOOP_WEBHOOK_MAX_AGE_MS - 1), false)
})

test('webhook bodies: v2 UUIDs pass as strings, unknown event types are still accepted', () => {
  const body = zWhoopWebhook.parse({ user_id: 456, id: '550e8400-e29b-41d4-a716-446655440000', type: 'sleep.updated', trace_id: 'x' })
  assert.equal(body.id, '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(zWhoopWebhook.parse({ id: 1234, type: 'sleep.updated' }).id, '1234')
  assert.equal(zWhoopWebhook.parse({ id: 'u', type: 'cycle.updated' }).type, 'cycle.updated')
  assert.equal(zWhoopWebhook.safeParse({ type: 'sleep.updated' }).success, false)
})

test('a failed token refresh: adopt a concurrent rotation, revoke only a current dead grant, never on 429/5xx', () => {
  // The refresh token is single-use. A 400/401 with the row already holding a DIFFERENT token
  // means another isolate won the race — adopt, don't revoke the pair it just saved.
  assert.equal(planWhoopRefreshFailure(400, 'winner-token', 'my-stale-token'), 'adopt-rotated')
  assert.equal(planWhoopRefreshFailure(401, 'winner-token', 'my-stale-token'), 'adopt-rotated')
  // The row still holds the rejected token: the grant is genuinely dead (revoked in the Whoop
  // app, expired) — revoke, conditionally on that same token.
  assert.equal(planWhoopRefreshFailure(400, 'same-token', 'same-token'), 'revoke-if-current')
  assert.equal(planWhoopRefreshFailure(401, null, 'same-token'), 'revoke-if-current')
  // Rate limits and outages must never kill the connection (they used to: any 4xx revoked).
  assert.equal(planWhoopRefreshFailure(429, 'same-token', 'same-token'), 'transient')
  assert.equal(planWhoopRefreshFailure(403, 'same-token', 'same-token'), 'transient')
  assert.equal(planWhoopRefreshFailure(500, 'same-token', 'same-token'), 'transient')
  assert.equal(planWhoopRefreshFailure(503, null, 'same-token'), 'transient')
})
