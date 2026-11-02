// A share link's state as the sharing page reads it (shared/utils/invites.ts) — audit #43 item 33.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inviteState } from '../shared/utils/invites.ts'

const NOW = '2026-11-02T15:00:00.000Z'
const link = over => ({ revoked: false, expires_at: null, max_uses: null, uses: 0, ...over })

test('a link is active until it expires, runs out of uses, or is revoked', () => {
  assert.equal(inviteState(link({}), NOW), 'active')
  assert.equal(inviteState(link({ expires_at: '2026-12-01T00:00:00.000Z', max_uses: 5, uses: 4 }), NOW), 'active')
  assert.equal(inviteState(link({ expires_at: '2026-11-01T00:00:00.000Z' }), NOW), 'expired')
  assert.equal(inviteState(link({ max_uses: 1, uses: 1 }), NOW), 'exhausted')
  assert.equal(inviteState(link({ max_uses: 5, uses: 7 }), NOW), 'exhausted', 'over the cap counts too')
})

test('revoked outranks the rest — those sessions are signed out, the others are not', () => {
  assert.equal(inviteState(link({ revoked: true, expires_at: '2026-11-01T00:00:00.000Z', max_uses: 1, uses: 1 }), NOW), 'revoked')
  // Expired AND exhausted: expiry is named first, either way it no longer redeems.
  assert.equal(inviteState(link({ expires_at: '2026-11-01T00:00:00.000Z', max_uses: 1, uses: 1 }), NOW), 'expired')
})
