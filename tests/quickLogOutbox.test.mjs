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

const { discardTap, enqueueTap, flushOutbox, flushPending, isNoResponse, isPendingId, newTapId, replayVerdict, setOutboxSession } = await import('../app/composables/useQuickLogOutbox.ts')
const { patchJournalDay } = await import('../app/utils/journalPatch.ts')
const { zSodaAdd, zWaterAdd } = await import('../shared/utils/schemas.ts')

const queued = () => JSON.parse(store.get('quicklog:outbox') ?? '[]').map(t => t.id)
const NO_ANSWER = { name: 'FetchError', message: '<no response> fetch failed' }
const DAY = '2026-11-03'
/** Lets a flush started without awaiting (flushPending) run to its end. */
const settled = () => new Promise(resolve => setTimeout(resolve, 0))
/**
 * Queues water taps a, b, c … in a session of `role` and answers each replay from `answers`
 * (id → an error to throw; anything else lands). Returns the ids the server was asked about, the
 * ids that landed and the ids that left the queue without landing.
 */
function scene(ids, answers = {}, role = null) {
  store.clear()
  toasts.length = 0
  const asked = []
  const landed = []
  const dropped = []
  setOutboxSession(role, { onLanded: tap => landed.push(tap.id), onDropped: tap => dropped.push(tap.id) })
  for (const id of ids) enqueueTap({ id, kind: 'water', date: DAY, time: '09:00', oz: 12 })
  globalThis.$fetch = async (_url, { body }) => {
    asked.push(body.id)
    const err = typeof answers === 'function' ? answers(body.id) : answers[body.id]
    if (err) throw err
    return { water: [] }
  }
  return { asked, landed, dropped, flush: () => flushOutbox() }
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
  assert.deepEqual(s.dropped, ['tap-a'], 'the page is told, so the row comes off the day')
})

// --- item 6: a queued tap stays on screen, is sent when a tap gets through, can be discarded,
// and goes only to the kind of session it was made in ---

/** The journal store and the page's two handlers, as AppHeader wires them. */
function page(role = 'owner') {
  store.clear()
  toasts.length = 0
  const journal = { value: [{ date: DAY, water: [] }] }
  const server = [] // the day's pours as the server holds them
  globalThis.$fetch = async (_url, { body }) => {
    if (!server.some(w => w.id === body.id)) server.push({ time: body.time, oz: body.oz, id: body.id })
    return { water: [...server] }
  }
  setOutboxSession(role, {
    onLanded: (tap, lists) => patchJournalDay(journal, tap.date, { water: lists.water }),
    onDropped: tap => patchJournalDay(journal, tap.date, { water: journal.value.find(e => e.date === tap.date).water.filter(w => w.id !== tap.id) })
  })
  const shown = () => journal.value.find(e => e.date === DAY).water.map(w => w.id)
  /** A tap that got no answer: kept, and mirrored the way the widgets do. */
  const offlineTap = (id) => {
    enqueueTap({ id, kind: 'water', date: DAY, time: '09:00', oz: 12 })
    patchJournalDay(journal, DAY, { water: journal.value.find(e => e.date === DAY).water })
  }
  /** A tap that got through: the server's list replaces the day, then the queue is flushed. */
  const liveTap = async (id) => {
    const { water } = await globalThis.$fetch('/api/journal/water', { body: { time: '10:00', oz: 12, id } })
    patchJournalDay(journal, DAY, { water })
    flushPending()
  }
  return { journal, server, shown, offlineTap, liveTap }
}

test('a queued tap stays on the day when the next tap gets through, and that tap sends it', async () => {
  const p = page()
  p.offlineTap('tap-a')
  assert.deepEqual(p.shown(), ['tap-a'])
  assert.equal(isPendingId('tap-a'), true)
  // The next tap lands: its answer holds only itself. The queued one is still on screen —
  // it used to vanish here, the count dropped, and it was tapped again.
  const { water } = await globalThis.$fetch('/api/journal/water', { body: { time: '10:00', oz: 12, id: 'tap-b' } })
  patchJournalDay(p.journal, DAY, { water })
  assert.deepEqual(p.shown(), ['tap-b', 'tap-a'], 'the server\'s rows first (their indexes are what ✕ removes by), then the queued one')
  // …and a tap that gets through flushes the queue.
  flushPending()
  await settled()
  assert.deepEqual(queued(), [])
  assert.deepEqual(p.server.map(w => w.id), ['tap-b', 'tap-a'])
  assert.deepEqual(p.shown(), ['tap-b', 'tap-a'], 'once each')
  assert.equal(isPendingId('tap-a'), false)
})

test('a refresh of the whole list keeps the queued tap; one that landed without its answer is not shown twice', async () => {
  const p = page()
  p.offlineTap('tap-a')
  // The list's own fetch runs every answer through the same overlay (useJournalEntries' transform).
  const { withPendingTaps } = await import('../app/utils/journalPatch.ts')
  assert.deepEqual(withPendingTaps([{ date: DAY, water: [{ time: '08:00', oz: 8, id: 'srv-1' }] }])[0].water.map(w => w.id), ['srv-1', 'tap-a'])
  assert.deepEqual(withPendingTaps([{ date: '2026-11-01' }]).map(e => e.date), ['2026-11-01', DAY], 'a day with no row yet gets one')
  // The tap had reached the server after all: the list already holds its id.
  const held = [{ date: DAY, water: [{ time: '09:00', oz: 12, id: 'tap-a' }] }]
  assert.equal(withPendingTaps(held), held, 'nothing to add: the same array')
  // With nothing queued the overlay is the identity.
  discardTap('tap-a')
  const plain = [{ date: DAY, water: [] }]
  assert.equal(withPendingTaps(plain), plain)
})

test('a pending tap can be discarded: out of the queue, off the day, never sent', async () => {
  const p = page()
  p.offlineTap('tap-a')
  p.offlineTap('tap-b')
  discardTap('tap-a')
  assert.deepEqual(queued(), ['tap-b'])
  assert.deepEqual(p.shown(), ['tap-b'])
  discardTap('tap-zzz') // not queued: nothing happens
  discardTap(undefined)
  await p.liveTap('tap-c')
  await settled()
  assert.deepEqual(p.server.map(w => w.id), ['tap-c', 'tap-b'], 'the discarded tap never reached the server')
})

test('a tap is replayed only into the kind of session it was made in', async () => {
  // Kept as the owner (offline, or through a sign-out)…
  const owner = scene(['tap-a', 'tap-b'], {}, 'owner')
  assert.deepEqual(JSON.parse(store.get('quicklog:outbox')).map(t => t.role), ['owner', 'owner'])
  // …then the same browser opens the demo: nothing is sent into the sandbox, nothing is marked
  // pending there, and the taps are still queued.
  const asked = []
  globalThis.$fetch = async (_url, { body }) => {
    asked.push(body.id)
    return { water: [] }
  }
  setOutboxSession('demo', {})
  assert.equal(isPendingId('tap-a'), false)
  flushPending()
  await flushOutbox()
  assert.deepEqual(asked, [])
  assert.deepEqual(queued(), ['tap-a', 'tap-b'])
  // A tap made in the demo goes out from the demo, past the owner's.
  enqueueTap({ id: 'tap-demo', kind: 'water', date: DAY, time: '11:00', oz: 12 })
  await flushOutbox()
  assert.deepEqual(asked, ['tap-demo'])
  assert.deepEqual(queued(), ['tap-a', 'tap-b'])
  // Signed back in as the owner: now they go.
  setOutboxSession('owner', { onLanded: tap => owner.landed.push(tap.id) })
  assert.equal(isPendingId('tap-a'), true)
  await flushOutbox()
  assert.deepEqual(owner.landed, ['tap-a', 'tap-b'])
  assert.deepEqual(queued(), [])
  // A tap queued before taps carried a role goes wherever it would have gone then.
  store.set('quicklog:outbox', JSON.stringify([{ id: 'tap-old', kind: 'water', date: DAY, time: '08:00', oz: 12 }]))
  setOutboxSession('demo', {})
  await flushOutbox()
  assert.deepEqual(queued(), [])
})

test('with nothing queued, a tap that gets through sends nothing more', async () => {
  const s = scene([])
  flushPending()
  await settled()
  assert.deepEqual(s.asked, [])
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
