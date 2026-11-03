// The per-IP brake over the Workers Rate Limiting bindings (server/utils/rateLimit.ts) —
// audit #43 item 47: keyed by route and address, 429 with Retry-After when the binding says
// no, and open (never a lockout) when the binding is missing or broken.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// The Nitro/h3 globals the module touches.
const warnings = []
const errors = []
globalThis.getHeader = (event, name) => event.headers?.[name]
globalThis.getRequestIP = event => event.ip
globalThis.setHeader = (event, name, value) => {
  event.responseHeaders = { ...event.responseHeaders, [name]: value }
}
globalThis.createError = ({ statusCode, message }) => Object.assign(new Error(message), { statusCode })
globalThis.logWarn = (tag, what) => warnings.push(`${tag}: ${what}`)
globalThis.logError = (tag, what) => errors.push(`${tag}: ${what}`)

const { clientIp, enforceRateLimit } = await import('../server/utils/rateLimit.ts')

/** A binding that allows `allow` calls per key, remembering the keys it was asked about. */
function fakeLimiter(allow) {
  const seen = new Map()
  return {
    seen,
    async limit({ key }) {
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      return { success: n <= allow }
    }
  }
}
const event = (env, over = {}) => ({ context: { cloudflare: { env } }, headers: { 'cf-connecting-ip': '203.0.113.9' }, ...over })

test('the address is what Cloudflare saw, never a forwarded header', () => {
  assert.equal(clientIp(event({})), '203.0.113.9')
  assert.equal(clientIp({ headers: {}, ip: '10.0.0.2' }), '10.0.0.2', 'local dev has no edge header')
  assert.equal(clientIp({ headers: {} }), 'unknown')
})

test('the sixth guess in a minute is refused with Retry-After; another route or address has its own counter', async () => {
  const limiter = fakeLimiter(5)
  const env = { LIMIT_CREDENTIALS: limiter }
  for (let i = 0; i < 5; i++) await enforceRateLimit(event(env), 'credentials', 'login')
  const e = event(env)
  const err = await enforceRateLimit(e, 'credentials', 'login').catch(x => x)
  assert.equal(err.statusCode, 429)
  assert.match(err.message, /try again in a minute/)
  assert.equal(e.responseHeaders['Retry-After'], 60)
  assert.deepEqual([...limiter.seen.keys()], ['login:203.0.113.9'])

  await enforceRateLimit(event(env), 'credentials', 'pin')
  await enforceRateLimit(event(env, { headers: { 'cf-connecting-ip': '198.51.100.4' } }), 'credentials', 'login')
  assert.equal(limiter.seen.get('pin:203.0.113.9'), 1)
  assert.equal(limiter.seen.get('login:198.51.100.4'), 1)
})

test('each limiter is its own binding', async () => {
  const credentials = fakeLimiter(0)
  const pub = fakeLimiter(30)
  const env = { LIMIT_CREDENTIALS: credentials, LIMIT_PUBLIC: pub }
  await enforceRateLimit(event(env), 'public', 'health')
  assert.equal(pub.seen.get('health:203.0.113.9'), 1)
  assert.equal(credentials.seen.size, 0)
  await assert.rejects(enforceRateLimit(event(env), 'credentials', 'login'), { statusCode: 429 })
})

test('no binding: allowed, warned once per limiter; a binding that throws: allowed, logged', async () => {
  warnings.length = 0
  await enforceRateLimit(event({}), 'credentials', 'login')
  await enforceRateLimit(event({}), 'credentials', 'login')
  await enforceRateLimit({ context: {}, headers: {} }, 'credentials', 'login')
  assert.deepEqual(warnings, ['rate-limit: LIMIT_CREDENTIALS binding missing — credentials limit not enforced'])

  const broken = {
    async limit() {
      throw new Error('binding unavailable')
    }
  }
  await enforceRateLimit(event({ LIMIT_PUBLIC: broken }), 'public', 'health')
  assert.deepEqual(errors, ['rate-limit: health: limit() failed'])
})
