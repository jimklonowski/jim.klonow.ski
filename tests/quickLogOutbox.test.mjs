// The quick-log outbox (app/composables/useQuickLogOutbox.ts) — audit #43 item 43, #44 item 4.
// The composable's arming needs a Nuxt instance; what runs in plain node, over a stubbed
// localStorage and $fetch, is the error classifiers, the replay loop and the id shape (which the
// server's zTapId must accept).
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Stub the Nuxt globals the module touches at import time.
globalThis.ref = v => ({ value: v })
const toasts = []
globalThis.useToast = () => ({ add: t => toasts.push(t) })
globalThis.useEventListener = () => {}
globalThis.extractErrorMessage = () => ''
globalThis.$fetch = async () => {
  throw new Error('not in a test')
}
globalThis.crypto ??= (await import('node:crypto')).webcrypto
// The queue's home. A Map behind the three calls the module makes.
const store = new Map()
globalThis.localStorage = {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
}

const { enqueueTap, flushOutbox, isNoResponse, newTapId, replayVerdict } = await import('../app/composables/useQuickLogOutbox.ts')
const { zSodaAdd, zWaterAdd } = await import('../shared/utils/schemas.ts')

const queued = () => JSON.parse(store.get('quicklog:outbox') ?? '[]').map(t => t.id)
const NO_ANSWER = { name: 'FetchError', message: '<no response> fetch failed' }
/**
 * Queues water taps a, b, c … and answers each replay from `answers` (id → an error to throw;
 * anything else lands). Returns the ids the server was asked about and the ids that landed.
 */
function scene(ids, answers = {}) {
  store.clear()
  toasts.length = 0
  for (const id of ids) enqueueTap({ id, kind: 'water', date: '2026-11-03', time: '09:00', oz: 12 })
  const asked = []
  const landed = []
  globalThis.$fetch = async (_url, { body }) => {
    asked.push(body.id)
    const err = typeof answers === 'function' ? answers(body.id) : answers[body.id]
    if (err) throw err
    return { water: [] }
  }
  return { asked, landed, flush: () => flushOutbox(tap => landed.push(tap.id)) }
}

test('only a request with NO answer is queued — a server status is a refusal, not an outage', () => {
  // ofetch's dead-network error: FetchError, no response, no status (measured: "<no response> fetch failed").
  assert.equal(isNoResponse({ name: 'FetchError', message: '<no response> fetch failed', cause: new TypeError('fetch failed') }), true)
  assert.equal(isNoResponse({ statusCode: 401, data: { message: 'Unauthorized' } }), false)
  assert.equal(isNoResponse({ status: 500, response: {} }), false)
  assert.equal(isNoResponse({ statusCode: 400 }), false)
  assert.equal(isNoResponse(null), false)
  assert.equal(isNoResponse('nope'), false)
})

// --- the replay (audit #44 item 4): a queued tap is dropped only when the tap itself is wrong ---

test('replayVerdict: only a 4xx about the request itself is a refusal', () => {
  assert.equal(replayVerdict(NO_ANSWER), 'offline')
  assert.equal(replayVerdict({ statusCode: 401 }), 'signed-out')
  assert.equal(replayVerdict({ statusCode: 403 }), 'blocked', 'a Cloudflare challenge or another role\'s session, not the tap')
  assert.equal(replayVerdict({ statusCode: 429 }), 'blocked')
  for (const status of [500, 502, 503, 504, 408, 425]) assert.equal(replayVerdict({ statusCode: status }), 'retry', String(status))
  for (const status of [400, 404, 409, 413, 422]) assert.equal(replayVerdict({ statusCode: status }), 'refused', String(status))
  // ofetch carries the status in more than one place.
  assert.equal(replayVerdict({ status: 401, response: {} }), 'signed-out')
  assert.equal(replayVerdict({ response: { status: 400 } }), 'refused')
  assert.equal(replayVerdict({ response: {} }), 'retry', 'an answer with no status to read is not a reason to drop')
})

test('an expired session keeps every queued tap, stops, and says so once; signing in sends them in order', async () => {
  const s = scene(['tap-a', 'tap-b'], { 'tap-a': { statusCode: 401 }, 'tap-b': { statusCode: 401 } })
  await s.flush()
  assert.deepEqual(s.asked, ['tap-a'], 'the rest would be turned away the same way')
  assert.deepEqual(queued(), ['tap-a', 'tap-b'])
  assert.equal(toasts.length, 1)
  assert.match(toasts[0].title, /Signed out — 2 taps kept/)
  // The tab is looked at again, still signed out: one more try, no second toast.
  await s.flush()
  assert.deepEqual(queued(), ['tap-a', 'tap-b'])
  assert.equal(toasts.length, 1)
  // Signed in.
  const back = scene(['tap-a', 'tap-b'])
  await back.flush()
  assert.deepEqual(back.landed, ['tap-a', 'tap-b'])
  assert.deepEqual(queued(), [])
  assert.equal(toasts.length, 0)
})

test('a server error keeps the tap and goes on to the next, so one bad tap cannot hold the rest', async () => {
  const s = scene(['tap-a', 'tap-b', 'tap-c'], { 'tap-a': { statusCode: 500 } })
  await s.flush()
  assert.deepEqual(s.asked, ['tap-a', 'tap-b', 'tap-c'], 'each tried once')
  assert.deepEqual(s.landed, ['tap-b', 'tap-c'])
  assert.deepEqual(queued(), ['tap-a'], 'kept for the next pass')
  assert.equal(toasts.length, 0)
  // A whole outage: every tap tried once, all kept.
  const down = scene(['tap-a', 'tap-b'], () => ({ statusCode: 503 }))
  await down.flush()
  assert.deepEqual(down.asked, ['tap-a', 'tap-b'])
  assert.deepEqual(queued(), ['tap-a', 'tap-b'])
})

test('a tap the server calls wrong is the only one dropped, with a toast', async () => {
  const s = scene(['tap-a', 'tap-b'], { 'tap-a': { statusCode: 400 } })
  await s.flush()
  assert.deepEqual(s.landed, ['tap-b'])
  assert.deepEqual(queued(), [])
  assert.equal(toasts.length, 1)
  assert.match(toasts[0].title, /water tap was refused/)
})

test('no answer, a 403 and a 429 each stop the pass with everything kept and nothing said', async () => {
  for (const err of [NO_ANSWER, { statusCode: 403 }, { statusCode: 429 }]) {
    const s = scene(['tap-a', 'tap-b'], { 'tap-a': err })
    await s.flush()
    assert.deepEqual(s.asked, ['tap-a'])
    assert.deepEqual(queued(), ['tap-a', 'tap-b'])
    assert.equal(toasts.length, 0)
  }
})

test('a tap id is what the endpoints accept', () => {
  const id = newTapId()
  assert.match(id, /^tap-[0-9a-f]{24}$/)
  assert.notEqual(id, newTapId(), 'random')
  assert.equal(zSodaAdd.parse({ date: '2026-11-03', time: '09:00', id }).id, id)
  assert.equal(zWaterAdd.parse({ date: '2026-11-03', time: '09:00', oz: 12, id }).id, id)
  assert.throws(() => zSodaAdd.parse({ id: 'short' }), 'too short to be a tap id')
  assert.throws(() => zSodaAdd.parse({ id: 'UPPER-case-not-allowed-x' }))
})
