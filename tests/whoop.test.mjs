// server/utils/whoop.ts — the Whoop token store and fetcher, untested until audit #44 item 56.
// This is the code whose mistakes cost the connection: Whoop's refresh tokens are single-use, so
// a wrong move on a failed refresh leaves the sync dead until a manual reconnect.
//
// Nothing here reaches Whoop. `fetch` is replaced before the module loads with a scripted stand-in
// that refuses any other address, and the token row lives in an in-memory copy of the real schema.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { d1Of, freshDb, rowsOf } from './_fixtures/d1.mjs'
import { installAutoImports } from './_fixtures/nitro.mjs'

const WHOOP = 'https://api.prod.whoop.com'
const calls = []
let answer = () => {
  throw new Error('no answer scripted')
}
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url))
  if (u.origin !== WHOOP) throw new Error(`the test tried to reach ${u.origin}`)
  const call = {
    path: u.pathname,
    query: Object.fromEntries(u.searchParams),
    method: init.method ?? 'GET',
    auth: init.headers?.Authorization ?? null,
    form: init.body ? Object.fromEntries(init.body) : null
  }
  calls.push(call)
  return answer(call)
}
process.env.WHOOP_CLIENT_ID = 'test-client'
process.env.WHOOP_CLIENT_SECRET = 'test-secret'
await installAutoImports()
const {
  getWhoopStatus, getWhoopTokens, markWhoopError, markWhoopSynced, refreshWhoopStrain, saveWhoopTokens, whoopFetchAll, whoopFetchOne
} = await import('../server/utils/whoop.ts')

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const TOKEN_PATH = '/oauth/oauth2/token'
const HOUR = 3_600_000

/** A database holding one token pair, `expiresIn` ms from now, and a clean call log. */
function connected({ access = 'a1', refresh = 'r1', expiresIn = HOUR } = {}) {
  const db = freshDb()
  db.prepare('INSERT INTO whoop_tokens (id, access_token, refresh_token, expires_at) VALUES (1, ?, ?, ?)').run(access, refresh, Date.now() + expiresIn)
  calls.length = 0
  return { db, d1: d1Of(db), row: () => rowsOf(db, 'SELECT * FROM whoop_tokens')[0] }
}
/** Answers the token endpoint with `grant`, and every data request with `data(call)`. */
const whoop = (data, grant = () => json({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600 })) => {
  answer = call => (call.path === TOKEN_PATH ? grant(call) : data(call))
}
const tokenCalls = () => calls.filter(c => c.path === TOKEN_PATH)
const dataCalls = () => calls.filter(c => c.path !== TOKEN_PATH)

test('the connection reads as what the row says: none, live, or revoked with the reason kept', async () => {
  const empty = d1Of(freshDb())
  assert.equal(await getWhoopTokens(empty), null)
  assert.deepEqual(await getWhoopStatus(empty), { connected: false, lastSyncedAt: null, lastError: null, lastErrorAt: null, needsReconnect: false })

  const { db, d1, row } = connected()
  assert.deepEqual(await getWhoopTokens(d1), { access_token: 'a1', refresh_token: 'r1', expires_at: row().expires_at })
  assert.equal((await getWhoopStatus(d1)).connected, true)

  await markWhoopError(d1, 'x'.repeat(900))
  assert.equal(row().last_error.length, 500, 'a long upstream message is cut, not stored whole')
  assert.ok(row().last_error_at)
  assert.equal((await getWhoopStatus(d1)).connected, true, 'an error is not a disconnection')

  await markWhoopSynced(d1)
  assert.equal(row().last_error, null, 'a clean sync clears the last error')
  assert.ok(row().last_synced_at)

  db.exec(`UPDATE whoop_tokens SET revoked = 1, last_error = 'rejected'`)
  assert.equal(await getWhoopTokens(d1), null, 'a revoked pair is never handed out')
  assert.deepEqual({ ...(await getWhoopStatus(d1)), lastSyncedAt: null, lastErrorAt: null }, { connected: false, lastSyncedAt: null, lastError: 'rejected', lastErrorAt: null, needsReconnect: true })

  // A reconnect: the new pair replaces the row and clears the revoke and the error.
  await saveWhoopTokens(d1, { access_token: 'a9', refresh_token: 'r9', expires_at: 123 })
  assert.deepEqual({ ...row(), last_synced_at: null }, { id: 1, access_token: 'a9', refresh_token: 'r9', expires_at: 123, revoked: 0, last_synced_at: null, last_error: null, last_error_at: null })
  assert.equal(rowsOf(db, 'SELECT COUNT(*) AS n FROM whoop_tokens')[0].n, 1)
})

test('a collection is read page by page until Whoop stops handing out a next token', async () => {
  const { d1 } = connected()
  const pages = { '': { records: [1, 2], next_token: 'p2' }, 'p2': { records: [3], next_token: 'p3' }, 'p3': { records: [4] } }
  whoop(call => json(pages[call.query.nextToken ?? '']))
  assert.deepEqual(await whoopFetchAll(d1, '/v2/activity/workout', { start: '2026-11-01T00:00:00.000Z' }), [1, 2, 3, 4])
  assert.deepEqual(dataCalls().map(c => [c.path, c.query.limit, c.query.start, c.query.nextToken, c.auth]), [
    ['/developer/v2/activity/workout', '25', '2026-11-01T00:00:00.000Z', undefined, 'Bearer a1'],
    ['/developer/v2/activity/workout', '25', '2026-11-01T00:00:00.000Z', 'p2', 'Bearer a1'],
    ['/developer/v2/activity/workout', '25', '2026-11-01T00:00:00.000Z', 'p3', 'Bearer a1']
  ], 'the maximum page size, not the default 10')
  assert.equal(tokenCalls().length, 0, 'a token with an hour left is not refreshed')
})

test('the walk cannot loop: a repeated token, an empty page and the page cap each end it', async () => {
  const { d1 } = connected()
  whoop(() => json({ records: [1], next_token: 'same' }))
  assert.deepEqual(await whoopFetchAll(d1, '/v2/cycle'), [1, 1], 'the token it was just given, given again')
  calls.length = 0
  whoop(() => json({ records: [], next_token: 'more' }))
  assert.deepEqual(await whoopFetchAll(d1, '/v2/cycle'), [])
  assert.equal(dataCalls().length, 1)
  calls.length = 0
  let n = 0
  whoop(() => json({ records: [n], next_token: `t${n++}` }))
  assert.equal((await whoopFetchAll(d1, '/v2/cycle')).length, 20, 'twenty pages at most')
  calls.length = 0
  assert.equal((await whoopFetchAll(d1, '/v2/cycle', { maxPages: 1 })).length, 1)
  assert.equal(dataCalls().length, 1)
})

test('a token about to expire is refreshed first, and the new pair is the one stored and sent', async () => {
  const { d1, row } = connected({ expiresIn: 60_000 }) // inside the five-minute margin
  whoop(() => json({ id: 7 }))
  const before = Date.now()
  assert.deepEqual(await whoopFetchOne(d1, '/v2/cycle/7/recovery'), { id: 7 })
  assert.deepEqual(tokenCalls().map(c => [c.method, c.form]), [['POST', { grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'test-client', client_secret: 'test-secret', scope: 'offline' }]])
  assert.equal(dataCalls()[0].auth, 'Bearer a2')
  assert.equal(row().access_token, 'a2')
  assert.equal(row().refresh_token, 'r2', 'Whoop has already retired r1: losing r2 would lose the connection')
  assert.ok(row().expires_at >= before + HOUR && row().expires_at <= Date.now() + HOUR)
})

test('requests made together share one refresh — the refresh token works exactly once', async () => {
  const { d1 } = connected({ expiresIn: -1000 })
  let grants = 0
  whoop(call => json({ path: call.path }), () => {
    grants++
    return grants === 1 ? json({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600 }) : json({ error: 'invalid_grant' }, 400)
  })
  const out = await Promise.all([whoopFetchOne(d1, '/v2/a'), whoopFetchOne(d1, '/v2/b'), whoopFetchOne(d1, '/v2/c')])
  assert.equal(out.length, 3)
  assert.equal(grants, 1, 'three callers, one use of r1')
  assert.deepEqual(dataCalls().map(c => c.auth), ['Bearer a2', 'Bearer a2', 'Bearer a2'])
})

test('a rejected refresh revokes the connection only while the row still holds the rejected token', async () => {
  const { d1, row } = connected({ expiresIn: -1000 })
  whoop(() => json({}), () => new Response('{"error":"invalid_grant"}', { status: 400 }))
  await assert.rejects(() => whoopFetchOne(d1, '/v2/x'), err => err.statusCode === 401 && /reconnect/.test(err.message))
  assert.equal(row().revoked, 1)
  assert.match(row().last_error, /Whoop rejected the saved credentials \(400 \{"error":"invalid_grant"\}\)/, 'the menu can say why')
  assert.equal(dataCalls().length, 0, 'no data request goes out on a dead grant')
  assert.deepEqual(await getWhoopStatus(d1).then(s => [s.connected, s.needsReconnect]), [false, true])
  // And from then on nothing is attempted at all.
  calls.length = 0
  await assert.rejects(() => whoopFetchOne(d1, '/v2/x'), err => err.statusCode === 401 && /not connected/.test(err.message))
  assert.equal(calls.length, 0)
})

test('a refresh that lost a race adopts the winner\'s pair instead of revoking it', async () => {
  // Another isolate used r1 a moment earlier and stored a2/r2. Ours is rejected — r1 is spent —
  // but the row has moved on, so the connection is fine: use what is there.
  const { db, d1, row } = connected({ expiresIn: -1000 })
  whoop(() => json({ ok: true }), () => {
    db.prepare('UPDATE whoop_tokens SET access_token = ?, refresh_token = ?, expires_at = ?').run('a2', 'r2', Date.now() + HOUR)
    return json({ error: 'invalid_grant' }, 400)
  })
  assert.deepEqual(await whoopFetchOne(d1, '/v2/x'), { ok: true })
  assert.equal(dataCalls()[0].auth, 'Bearer a2')
  assert.equal(row().revoked, 0)
  assert.equal(row().refresh_token, 'r2')
  assert.equal(row().last_error, null)
})

test('Whoop having a bad moment (429, 5xx, a malformed answer) never costs the connection', async () => {
  for (const [grant, message] of [
    [() => new Response('slow down', { status: 429 }), /token refresh failed: 429 slow down/],
    [() => new Response('upstream', { status: 503 }), /token refresh failed: 503 upstream/],
    [() => json({ access_token: 'a2' }), /unexpected payload/] // 200, but no refresh token in it
  ]) {
    const { d1, row } = connected({ expiresIn: -1000 })
    whoop(() => json({}), grant)
    await assert.rejects(() => whoopFetchOne(d1, '/v2/x'), err => err.statusCode === 502 && message.test(err.message))
    assert.deepEqual([row().revoked, row().access_token, row().refresh_token], [0, 'a1', 'r1'], 'left exactly as it was, for the next run to retry')
    assert.equal(dataCalls().length, 0)
  }
})

test('a token Whoop rejects before its expiry is refreshed once and the request sent again', async () => {
  const { d1, row } = connected()
  whoop(call => (call.auth === 'Bearer a1' ? new Response('', { status: 401 }) : json({ fresh: true })))
  assert.deepEqual(await whoopFetchOne(d1, '/v2/x'), { fresh: true })
  assert.deepEqual(dataCalls().map(c => c.auth), ['Bearer a1', 'Bearer a2'])
  assert.equal(tokenCalls().length, 1)
  assert.equal(row().refresh_token, 'r2')

  // Rejected even with the pair Whoop has just issued: say what will fix it, and stop.
  const again = connected()
  whoop(() => new Response('', { status: 401 }))
  await assert.rejects(() => whoopFetchOne(again.d1, '/v2/x'), err => err.statusCode === 401 && /Whoop rejected the connection — reconnect/.test(err.message))
  assert.equal(dataCalls().length, 2, 'one retry, not a loop')
})

test('one record: a 404 is "it is gone", anything else that is not OK is an upstream failure', async () => {
  const { d1 } = connected()
  whoop(() => new Response('', { status: 404 }))
  assert.equal(await whoopFetchOne(d1, '/v2/activity/sleep/abc'), null, 'a webhook can name a record deleted before we read it')
  whoop(() => new Response('boom '.repeat(100), { status: 500 }))
  await assert.rejects(() => whoopFetchOne(d1, '/v2/activity/sleep/abc'), err => err.statusCode === 502 && /^Whoop API request failed: 500 boom/.test(err.message) && err.message.length < 240)
  await assert.rejects(() => whoopFetchAll(d1, '/v2/cycle'), err => err.statusCode === 502)
})

test('the client credentials missing is a configuration error, and the pair is not touched', async () => {
  const { d1, row } = connected({ expiresIn: -1000 })
  const saved = process.env.WHOOP_CLIENT_SECRET
  delete process.env.WHOOP_CLIENT_SECRET
  try {
    await assert.rejects(() => whoopFetchOne(d1, '/v2/x'), err => err.statusCode === 500 && /credentials not configured/.test(err.message))
  }
  finally {
    process.env.WHOOP_CLIENT_SECRET = saved
  }
  assert.equal(calls.length, 0)
  assert.equal(row().revoked, 0)
})

test('a strain re-read takes one page of recent cycles and files each scored one under the day it began', async () => {
  const { db, d1 } = connected()
  db.exec(`INSERT INTO health_metrics (date, recovery_score, strain) VALUES ('2026-11-20', 61, 4.1)`)
  whoop(() => json({
    records: [
      // Newest first, as Whoop sends them. The open cycle reads as SCORED with its running total.
      { id: 3, start: '2026-11-21T12:10:00.000Z', score_state: 'SCORED', score: { strain: 6.25 } },
      { id: 2, start: '2026-11-20T12:05:00.000Z', end: '2026-11-21T12:10:00.000Z', score_state: 'SCORED', score: { strain: 14.7 } },
      { id: 1, start: '2026-11-19T12:00:00.000Z', score_state: 'PENDING_SCORE' }
    ],
    next_token: 'older'
  }))
  const since = Date.now() - 3 * 86_400_000
  assert.deepEqual(await refreshWhoopStrain(d1), ['2026-11-20', '2026-11-21'])
  assert.deepEqual(rowsOf(db, 'SELECT date, recovery_score, strain FROM health_metrics ORDER BY date'), [
    { date: '2026-11-20', recovery_score: 61, strain: 14.7 }, // the morning's 4.1 replaced; recovery untouched
    { date: '2026-11-21', recovery_score: null, strain: 6.25 }
  ])
  assert.equal(dataCalls().length, 1, 'one page: the next token is not followed')
  assert.equal(dataCalls()[0].path, '/developer/v2/cycle')
  const asked = Date.parse(dataCalls()[0].query.start)
  assert.ok(Math.abs(asked - since) < 5000, 'three days back')
})
