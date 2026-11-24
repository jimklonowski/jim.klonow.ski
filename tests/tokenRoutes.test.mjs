// The routes a machine calls with a token (audit #44 item 53), run as the real handlers over
// stubbed Nitro globals: a refused token spends the per-IP allowance and a good one never does;
// the barcode lookup is braked before it goes out; and the health check takes its token in a
// header, so a monitor need not put it in a URL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

const limited = []
let limiterRefuses = false
globalThis.defineEventHandler = fn => fn
globalThis.createError = ({ statusCode, message }) => Object.assign(new Error(message), { statusCode })
globalThis.getHeader = (event, name) => event.headers?.[name]
globalThis.getQuery = event => event.query ?? {}
globalThis.setHeader = () => {}
globalThis.setResponseStatus = (event, status) => {
  event.status = status
}
globalThis.errorMessage = err => (err instanceof Error ? err.message : String(err))
globalThis.isMissingTable = () => false
globalThis.safeEqual = (await import('../server/utils/auth.ts')).safeEqual
globalThis.enforceRateLimit = async (_event, limiter, scope) => {
  limited.push(`${limiter}:${scope}`)
  if (limiterRefuses) throw globalThis.createError({ statusCode: 429, message: 'Too many requests — try again in a minute' })
}
const reset = () => {
  limited.length = 0
  limiterRefuses = false
}

test('the Apple Health webhook: a wrong token is counted, then refused; the right one is never counted', async () => {
  globalThis.readValidatedJson = async () => {
    throw new Error('reached the body')
  }
  const handler = (await import('../server/api/journal/health-webhook.post.ts')).default
  process.env.WEBHOOK_TOKEN = 'the-webhook-token'

  reset()
  await assert.rejects(() => handler({ headers: { authorization: 'Bearer a-guess' } }), { statusCode: 401 })
  await assert.rejects(() => handler({ headers: {} }), { statusCode: 401 })
  assert.deepEqual(limited, ['credentials:health-webhook', 'credentials:health-webhook'])

  // Past the allowance the caller is told to slow down, not whether the guess was close.
  limiterRefuses = true
  await assert.rejects(() => handler({ headers: { authorization: 'Bearer a-guess' } }), { statusCode: 429 })

  reset()
  await assert.rejects(() => handler({ headers: { authorization: 'Bearer the-webhook-token' } }), /reached the body/)
  assert.deepEqual(limited, [], 'a delivery with the token spends nothing')

  delete process.env.WEBHOOK_TOKEN
  await assert.rejects(() => handler({ headers: { authorization: 'Bearer undefined' } }), { statusCode: 500 })
})

test('the Whoop webhook: a delivery that fails its signature is counted, then refused', async () => {
  const handler = (await import('../server/api/whoop/webhook.post.ts')).default
  process.env.WHOOP_CLIENT_SECRET = 'whoop-secret'
  const body = JSON.stringify({ user_id: 1, id: 'x', type: 'sleep.updated', trace_id: 't' })
  globalThis.readRawBody = async () => body

  reset()
  await assert.rejects(() => handler({ headers: { 'x-whoop-signature-timestamp': String(Date.now()), 'x-whoop-signature': 'bm90IGEgc2lnbmF0dXJl' } }), { statusCode: 401 })
  await assert.rejects(() => handler({ headers: {} }), { statusCode: 401 })
  assert.deepEqual(limited, ['credentials:whoop-webhook', 'credentials:whoop-webhook'])

  // A properly signed one goes on to the connection check, uncounted.
  reset()
  const timestamp = String(Date.now())
  const signature = createHmac('sha256', 'whoop-secret').update(timestamp + body).digest('base64')
  globalThis.getRealDb = () => ({})
  globalThis.getWhoopStatus = async () => ({ connected: false })
  const res = await handler({ headers: { 'x-whoop-signature-timestamp': timestamp, 'x-whoop-signature': signature } })
  assert.deepEqual(res, { ok: true, ignored: 'Whoop is not connected' })
  assert.deepEqual(limited, [])
  delete process.env.WHOOP_CLIENT_SECRET
})

test('the barcode lookup is braked before anything is sent to Open Food Facts', async () => {
  const handler = (await import('../server/api/journal/meals/barcode.get.ts')).default
  const sent = []
  globalThis.requireOwner = () => {}
  globalThis.$fetch = async (url) => {
    sent.push(url)
    return { status: 0 }
  }

  reset()
  assert.deepEqual(await handler({ query: { code: '012345678905' } }), { found: false, code: '012345678905', figures: null })
  assert.deepEqual(limited, ['public:barcode'])
  assert.equal(sent.length, 1)

  // A malformed code is refused without spending the allowance or going out.
  await assert.rejects(() => handler({ query: { code: 'abc' } }), { statusCode: 400 })
  assert.deepEqual(limited, ['public:barcode'])

  limiterRefuses = true
  await assert.rejects(() => handler({ query: { code: '012345678905' } }), { statusCode: 429 })
  assert.equal(sent.length, 1, 'nothing more went out')
})

test('the health check: the token in a header opens the full report, as the query string still does', async () => {
  const handler = (await import('../server/api/health.get.ts')).default
  globalThis.getRealDb = () => ({
    batch: async () => [{ results: [] }, { results: [] }, { results: [{ since: null }] }],
    prepare: () => ({ first: async () => null })
  })
  const ask = over => handler({ headers: {}, query: {}, context: {}, ...over })
  process.env.HEALTH_TOKEN = 'the-health-token'

  reset()
  const anonymous = await ask({})
  assert.deepEqual(Object.keys(anonymous), ['ok'], 'a stranger gets ok and nothing else')
  const byHeader = await ask({ headers: { authorization: 'Bearer the-health-token' } })
  assert.ok(Array.isArray(byHeader.checks) && byHeader.checks.some(c => c.name.startsWith('feed:')), 'the header opens the feeds')
  const byQuery = await ask({ query: { token: 'the-health-token' } })
  assert.ok(Array.isArray(byQuery.checks), 'the query string still works')
  for (const wrong of [{ headers: { authorization: 'Bearer nope' } }, { headers: { authorization: 'the-health-token' } }, { query: { token: 'nope' } }]) {
    assert.deepEqual(Object.keys(await ask(wrong)), ['ok'], JSON.stringify(wrong))
  }
  assert.ok(Array.isArray((await ask({ context: { auth: { role: 'owner' } } })).checks), 'the signed-in owner needs no token')
  assert.equal(limited.every(l => l === 'public:health'), true)

  // No token configured: nothing presented can match it.
  delete process.env.HEALTH_TOKEN
  for (const guess of [{ headers: { authorization: 'Bearer undefined' } }, { headers: { authorization: 'Bearer ' } }, { query: { token: 'undefined' } }, { query: { token: '' } }]) {
    assert.deepEqual(Object.keys(await ask(guess)), ['ok'], JSON.stringify(guess))
  }
})
