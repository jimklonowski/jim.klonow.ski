// The quick-log outbox's pure parts (app/composables/useQuickLogOutbox.ts) — audit #43 item 43.
// The composable itself needs a Nuxt instance; what is testable in plain node is the error
// classifier and the id shape, which the server's zTapId must accept.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Stub the Nuxt globals the module touches at import time.
globalThis.ref = v => ({ value: v })
globalThis.useToast = () => ({ add() {} })
globalThis.useEventListener = () => {}
globalThis.extractErrorMessage = () => ''
globalThis.$fetch = async () => {
  throw new Error('not in a test')
}
globalThis.crypto ??= (await import('node:crypto')).webcrypto

const { isNoResponse, newTapId } = await import('../app/composables/useQuickLogOutbox.ts')
const { zSodaAdd, zWaterAdd } = await import('../shared/utils/schemas.ts')

test('only a request with NO answer is queued — a server status is a refusal, not an outage', () => {
  // ofetch's dead-network error: FetchError, no response, no status (measured: "<no response> fetch failed").
  assert.equal(isNoResponse({ name: 'FetchError', message: '<no response> fetch failed', cause: new TypeError('fetch failed') }), true)
  assert.equal(isNoResponse({ statusCode: 401, data: { message: 'Unauthorized' } }), false)
  assert.equal(isNoResponse({ status: 500, response: {} }), false)
  assert.equal(isNoResponse({ statusCode: 400 }), false)
  assert.equal(isNoResponse(null), false)
  assert.equal(isNoResponse('nope'), false)
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
