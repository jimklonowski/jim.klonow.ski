// The session cookie scheme (server/utils/auth.ts) in plain node — audit #43 item 53: the
// HMAC token's tamper, expiry and role checks, the "sign out everywhere" cutoff, the upload-PIN
// token, the cross-site guard and the constant-time credential compare. The module reaches h3
// through Nitro's auto-imports, stubbed here as globals over a plain event object.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LABS_SECRET = 'test-signing-secret'
globalThis.getCookie = (event, name) => event.cookies?.[name]
globalThis.setCookie = (event, name, value, options) => {
  event.cookies ??= {}
  event.cookies[name] = value
  event.setCookies ??= {}
  event.setCookies[name] = options
}
globalThis.deleteCookie = (event, name) => {
  if (event.cookies) delete event.cookies[name]
}
globalThis.getHeader = (event, name) => event.headers?.[name]
globalThis.getRequestURL = event => new URL(event.url ?? 'https://jim.klonow.ski/api/x')
globalThis.createError = ({ statusCode, message }) => Object.assign(new Error(message), { statusCode })
globalThis.logError = () => {}

const auth = await import('../server/utils/auth.ts')
const { hasUploadPin, isCrossSite, ownerSessionCutoff, readAuthCookie, requireLabsAuth, requireOwner, requireSameOrigin, safeEqual, setAuthCookie, setUploadCookie, signOutEverywhereElse } = auth

/** A KV stub: `get` answers `value` (or throws when `fail` is set), `put` records into `puts`. */
const kvOf = ({ value = null, fail = false, puts = [] } = {}) => ({
  get: async () => {
    if (fail) throw new Error('kv down')
    return value
  },
  put: async (k, v) => {
    puts.push([k, v])
  }
})
/** An event with a KV behind the cutoff read. */
const event = (over = {}, kv = kvOf()) =>
  ({ context: { cloudflare: { env: { RATE_LIMIT: kv } } }, cookies: {}, headers: {}, ...over })

/** Runs `fn` with Date.now() pinned to `ms`. */
async function at(ms, fn) {
  const real = Date.now
  Date.now = () => ms
  try {
    return await fn()
  }
  finally {
    Date.now = real
  }
}

test('safeEqual: equal strings only; never an unset secret, a non-string, or a prefix', () => {
  assert.equal(safeEqual('hunter2', 'hunter2'), true)
  assert.equal(safeEqual('hunter2', 'hunter3'), false)
  assert.equal(safeEqual('hunter', 'hunter2'), false, 'a prefix is not a match')
  assert.equal(safeEqual('', ''), false, 'an unset secret matches nothing, not even the empty guess')
  assert.equal(safeEqual('x', undefined), false)
  assert.equal(safeEqual('x', null), false)
  assert.equal(safeEqual(['x'], 'x'), false)
  assert.equal(safeEqual(undefined, 'x'), false)
})

test('a session cookie round-trips its role, invite and issue time; the token is versioned and signed', () => {
  const e = event()
  setAuthCookie(e, 'friend', 'inv-123')
  const token = e.cookies['labs-auth']
  assert.match(token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.deepEqual(e.setCookies['labs-auth'], { httpOnly: true, secure: true, maxAge: 30 * 86400, path: '/', sameSite: 'lax' })
  const ctx = readAuthCookie(e)
  assert.equal(ctx.role, 'friend')
  assert.equal(ctx.inviteId, 'inv-123')
  assert.ok(Math.abs(ctx.issuedAt - Date.now() / 1000) < 5)
  setAuthCookie(e, 'owner')
  assert.deepEqual({ ...readAuthCookie(e), issuedAt: 0 }, { role: 'owner', inviteId: null, issuedAt: 0 })
})

test('a tampered, re-signed, expired, unversioned or missing token is no session', () => {
  const e = event()
  setAuthCookie(e, 'owner')
  const [version, body, sig] = e.cookies['labs-auth'].split('.')
  const flip = s => s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A')
  assert.equal(readAuthCookie({ cookies: { 'labs-auth': `${version}.${body}.${flip(sig)}` } }), null, 'signature changed')
  // The body re-encoded with the role swapped, the old signature kept.
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  const forged = Buffer.from(JSON.stringify({ ...payload, r: 'owner', i: 'inv-x' })).toString('base64url')
  assert.equal(readAuthCookie({ cookies: { 'labs-auth': `${version}.${forged}.${sig}` } }), null, 'body changed')
  assert.equal(readAuthCookie({ cookies: { 'labs-auth': `v2.${body}.${sig}` } }), null, 'unknown version')
  assert.equal(readAuthCookie({ cookies: { 'labs-auth': `${version}.${body}` } }), null, 'no signature')
  assert.equal(readAuthCookie({ cookies: {} }), null)
  assert.equal(readAuthCookie({}), null)
  // Minted with a negative lifetime: already expired.
  const dead = event()
  setAuthCookie(dead, 'owner', undefined, -1)
  assert.equal(readAuthCookie(dead), null, 'expired')
  // Signed under another secret: the signature does not verify here.
  const other = event()
  const secret = process.env.LABS_SECRET
  process.env.LABS_SECRET = 'someone-elses-secret'
  setAuthCookie(other, 'owner')
  process.env.LABS_SECRET = secret
  assert.equal(readAuthCookie(other), null, 'foreign secret')
})

test('only the four roles pass; a role outside the whitelist is no session even when the token is genuine', () => {
  for (const role of ['owner', 'friend', 'doctor', 'demo']) {
    const e = event()
    setAuthCookie(e, role)
    assert.equal(readAuthCookie(e)?.role, role)
  }
  const e = event()
  setAuthCookie(e, 'root')
  assert.equal(readAuthCookie(e), null)
})

test('an unset LABS_SECRET refuses to mint rather than signing with nothing', () => {
  const secret = process.env.LABS_SECRET
  delete process.env.LABS_SECRET
  try {
    assert.throws(() => setAuthCookie(event(), 'owner'), { statusCode: 500 })
  }
  finally {
    process.env.LABS_SECRET = secret
  }
})

test('the endpoint guards: 401 without a session, 403 for a non-owner where the owner is required', () => {
  assert.throws(() => requireLabsAuth({ context: {} }), { statusCode: 401 })
  assert.throws(() => requireLabsAuth({ context: { auth: null } }), { statusCode: 401 })
  assert.equal(requireLabsAuth({ context: { auth: { role: 'doctor', inviteId: 'i', issuedAt: 1 } } }).role, 'doctor')
  assert.throws(() => requireOwner({ context: { auth: { role: 'friend', inviteId: 'i', issuedAt: 1 } } }), { statusCode: 403 })
  assert.throws(() => requireOwner({ context: { auth: { role: 'demo', inviteId: null, issuedAt: 1 } } }), { statusCode: 403 })
  assert.equal(requireOwner({ context: { auth: { role: 'owner', inviteId: null, issuedAt: 1 } } }).role, 'owner')
})

test('cross-site: fetch metadata first, then Origin, then Referer; a typed URL or a non-browser passes', () => {
  const own = 'https://jim.klonow.ski'
  assert.equal(isCrossSite(event({ headers: { 'sec-fetch-site': 'cross-site' } })), true)
  assert.equal(isCrossSite(event({ headers: { 'sec-fetch-site': 'same-site' } })), true, 'a sibling subdomain is another site')
  assert.equal(isCrossSite(event({ headers: { 'sec-fetch-site': 'same-origin' } })), false)
  assert.equal(isCrossSite(event({ headers: { 'sec-fetch-site': 'none' } })), false, 'typed or bookmarked')
  assert.equal(isCrossSite(event({ headers: { 'sec-fetch-site': 'cross-site', 'origin': own } })), true, 'metadata outranks a matching Origin')
  assert.equal(isCrossSite(event({ headers: { origin: 'https://evil.example' } })), true)
  assert.equal(isCrossSite(event({ headers: { origin: own } })), false)
  assert.equal(isCrossSite(event({ headers: { referer: 'https://evil.example/page' } })), true)
  assert.equal(isCrossSite(event({ headers: { referer: `${own}/labs` } })), false)
  assert.equal(isCrossSite(event({ headers: { referer: 'not a url' } })), true, 'an unreadable Referer is refused')
  assert.equal(isCrossSite(event({ headers: {} })), false, 'curl, a Shortcut: no browser headers at all')
  assert.throws(() => requireSameOrigin(event({ headers: { origin: 'https://evil.example' } })), { statusCode: 403 })
  assert.doesNotThrow(() => requireSameOrigin(event({ headers: { origin: own } })))
})

test('the upload PIN token: minted for 12 hours, read back, dead after "sign out everywhere"', async () => {
  // Minted an hour ago.
  const e = event()
  await at(Date.now() - 3_600_000, () => setUploadCookie(e))
  assert.equal(e.setCookies['labs-upload-auth'].httpOnly, true)
  assert.equal(await hasUploadPin(e), true)
  assert.equal(await hasUploadPin(event()), false, 'no cookie')
  assert.equal(await hasUploadPin(event({ cookies: { 'labs-upload-auth': e.cookies['labs-auth'] } })), false, 'a session token is not a PIN token')

  // Sign out everywhere else, now: the hour-old PIN is before the cutoff; this device gets a
  // fresh owner cookie and its PIN cookie dropped.
  const puts = []
  const me = event({ cookies: { ...e.cookies } }, kvOf({ puts }))
  await signOutEverywhereElse(me)
  assert.equal(puts.length, 1)
  assert.equal(puts[0][0], 'auth:owner-session-cutoff')
  assert.equal(readAuthCookie(me)?.role, 'owner', 'signed back in at once')
  assert.equal(me.cookies['labs-upload-auth'], undefined, 'the PIN cookie is cleared on this device')
  assert.equal(await hasUploadPin(e), false, 'the hour-old PIN on another device is dead')
  // An owner token minted an hour ago reads as issued before the cutoff — the middleware's test.
  const old = event()
  await at(Date.now() - 3_600_000, () => setAuthCookie(old, 'owner'))
  assert.ok(readAuthCookie(old).issuedAt < await ownerSessionCutoff(old), 'an older session is behind the cutoff')
})

test('the cutoff is memoised and an unreadable KV keeps the last known value rather than re-admitting everyone', async () => {
  // The memo from the sign-out above is still fresh (15 s), so a fresh KV value is not read yet…
  const stale = event({}, kvOf({ value: '1' }))
  const cutoff = await ownerSessionCutoff(stale)
  assert.ok(cutoff > 1, 'the memo answers, not KV')
  // …and a KV that throws answers the same last-known cutoff.
  const broken = event({}, kvOf({ fail: true }))
  assert.equal(await ownerSessionCutoff(broken), cutoff)
})
