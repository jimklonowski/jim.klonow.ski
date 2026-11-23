// What each role may see of the /ticker visitors' footprints (shared/utils/tickerVisits.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stateForGuest, visitsForGuest, visitsForOwner } from '../shared/utils/tickerVisits.ts'
import { TICKER_GAMES } from '../shared/types/ticker.ts'
import { TICKER_STATE_KEYS } from '../shared/utils/schemas.ts'

// The state endpoint runs in plain node over stubbed Nitro auto-imports.
let auth = { role: 'owner' }
let stored = {}
globalThis.defineEventHandler = fn => fn
globalThis.createError = ({ statusCode, message }) => Object.assign(new Error(message), { statusCode })
globalThis.requireTickerAccess = () => auth
globalThis.readTickerState = async () => stored
globalThis.readVisits = async () => read
globalThis.guestLabel = async () => 'Mom'
globalThis.withEtag = (_event, body) => body
const { default: stateGet } = await import('../server/api/ticker/state.get.ts')

const runner = { label: 'Mom', score: 340, date: '2026-10-08' }
const crusher = { label: 'Dad', score: 210, date: '2026-10-09' }
const read = {
  total: 3,
  pets: 7,
  recent: [{ date: '2026-10-08', role: 'friend', label: 'Mom', pets: 2, best_run: 340, bests: {} }],
  best: runner,
  bests: { runner, crusher },
  bestInviteIds: { runner: 'abc', crusher: 'def' }
}

test('a guest sees the house figures, no footprints, and each top scorer named only when it is them', () => {
  assert.deepEqual(visitsForGuest(read, 'xyz'), {
    total: 3, pets: 7, recent: [],
    best: { label: null, score: 340, date: '2026-10-08' },
    bests: { runner: { label: null, score: 340, date: '2026-10-08' }, crusher: { label: null, score: 210, date: '2026-10-09' } }
  })
  const mom = visitsForGuest(read, 'abc')
  assert.equal(mom.best.label, 'Mom', 'their own footprint holds the runner record')
  assert.equal(mom.bests.crusher.label, null, 'but not the crusher')
  assert.equal(visitsForGuest(read, 'def').bests.crusher.label, 'Dad')
  assert.equal(visitsForGuest(read, null).best.label, null, 'no invite, no name')
  const empty = visitsForGuest({ ...read, best: null, bests: { runner: null }, bestInviteIds: {} }, 'abc')
  assert.equal(empty.best, null)
  assert.equal(empty.bests.runner, null)
})

test('a guest is handed the pet counter and every game\'s house record, and nothing else the pet remembers', async () => {
  const record = (score, extra = {}) => ({ score, date: '2026-10-08', ...extra })
  const memory = Object.fromEntries(TICKER_STATE_KEYS.map(key => [key, { private: key }]))
  Object.assign(memory, {
    pets: { total: 40, date: '2026-10-08', today: 2 },
    runner: record(600), crusher: record(4100, { cleared: true }), world: record(900, { cleared: true, feats: ['chain-3'] }),
    maze: record(1810, { cleared: false }), drop: record(900, { cleared: true }), invaders: record(3100, { cleared: false })
  })
  const seen = stateForGuest(memory)
  assert.deepEqual(Object.keys(seen).sort(), ['pets', ...TICKER_GAMES].sort(), 'no stamp, feed check or snapshot')
  for (const game of TICKER_GAMES) assert.deepEqual(seen[game], memory[game], game)
  assert.deepEqual(stateForGuest({ pets: memory.pets, runner: memory.runner, fed: {} }), { pets: memory.pets, runner: memory.runner }, 'a game never played is absent, not null')
  assert.deepEqual(stateForGuest({}), {})

  // Through the endpoint: a friend gets that cut, the owner the whole memory, the demo a 403.
  stored = memory
  auth = { role: 'friend', inviteId: 'abc' }
  const guest = await stateGet({})
  assert.deepEqual(guest.state, seen)
  assert.equal(guest.state.crusher.score, 4100, 'the house record a guest\'s first crusher score is held against')
  assert.deepEqual(guest.me, { role: 'friend', label: 'Mom' })
  assert.deepEqual(guest.visits.recent, [])
  auth = { role: 'owner' }
  assert.equal((await stateGet({})).state, memory)
  auth = { role: 'demo' }
  await assert.rejects(() => stateGet({}), { statusCode: 403 })
})

test('the owner sees everything, but the holder ids stay on the server', () => {
  const owner = visitsForOwner(read)
  assert.deepEqual(Object.keys(owner).sort(), ['best', 'bests', 'pets', 'recent', 'total'])
  assert.equal(owner.best.label, 'Mom')
  assert.equal(owner.bests.crusher.label, 'Dad')
  assert.equal(owner.recent.length, 1)
})
