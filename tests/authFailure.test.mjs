// What a failed sign-in or PIN unlock says (shared/utils/authFailure.ts) — audit #43 item 50:
// only a refusal of the credential reads as the credential's fault.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { responseStatus, signInFailure } from '../shared/utils/authFailure.ts'

const WRONG = 'Incorrect password. Try again.'

test('the status is read off whatever shape the fetch error takes', () => {
  assert.equal(responseStatus({ statusCode: 401 }), 401)
  assert.equal(responseStatus({ status: 429 }), 429)
  assert.equal(responseStatus({ response: { status: 503 } }), 503)
  // ofetch's dead-network error: a FetchError with no response (measured: "<no response> fetch failed").
  assert.equal(responseStatus({ name: 'FetchError', message: '<no response> fetch failed' }), null)
  assert.equal(responseStatus({ statusCode: '401' }), null, 'a string is not a status')
  assert.equal(responseStatus(null), null)
  assert.equal(responseStatus(undefined), null)
})

test('a refusal is the credential; everything else names itself', () => {
  assert.equal(signInFailure({ statusCode: 401, data: { message: 'Invalid password' } }, WRONG), WRONG)
  assert.equal(signInFailure({ statusCode: 400 }, WRONG), WRONG, 'a body the schema refused reads as wrong input too')
  assert.match(signInFailure({ statusCode: 429 }, WRONG), /Too many attempts/)
  assert.match(signInFailure({ statusCode: 403 }, WRONG), /session has ended/)
  assert.match(signInFailure({ statusCode: 500 }, WRONG), /could not check that \(500\)/)
  assert.match(signInFailure({ statusCode: 502 }, WRONG), /\(502\)/)
  assert.match(signInFailure({ name: 'FetchError', message: '<no response> fetch failed' }, WRONG), /No answer from the server/)
  assert.match(signInFailure(new Error('boom'), WRONG), /No answer from the server/, 'an error with no status is treated as no answer')
  assert.equal(signInFailure({ statusCode: 401 }, 'Incorrect PIN. Try again.'), 'Incorrect PIN. Try again.')
})
