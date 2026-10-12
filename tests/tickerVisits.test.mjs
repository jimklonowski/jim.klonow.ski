// What each role may see of the /ticker visitors' footprints (shared/utils/tickerVisits.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visitsForGuest, visitsForOwner } from '../shared/utils/tickerVisits.ts'

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

test('the owner sees everything, but the holder ids stay on the server', () => {
  const owner = visitsForOwner(read)
  assert.deepEqual(Object.keys(owner).sort(), ['best', 'bests', 'pets', 'recent', 'total'])
  assert.equal(owner.best.label, 'Mom')
  assert.equal(owner.bests.crusher.label, 'Dad')
  assert.equal(owner.recent.length, 1)
})
