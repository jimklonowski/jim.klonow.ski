// What each role may see of the /ticker visitors' footprints (shared/utils/tickerVisits.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visitsForGuest, visitsForOwner } from '../shared/utils/tickerVisits.ts'

const read = {
  total: 3,
  pets: 7,
  recent: [{ date: '2026-10-08', role: 'friend', label: 'Mom', pets: 2, best_run: 340 }],
  best: { label: 'Mom', score: 340, date: '2026-10-08' },
  bestInviteId: 'abc'
}

test('a guest sees the house figures, no footprints, and the top scorer named only when it is them', () => {
  assert.deepEqual(visitsForGuest(read, 'xyz'), { total: 3, pets: 7, recent: [], best: { label: null, score: 340, date: '2026-10-08' } })
  assert.equal(visitsForGuest(read, 'abc').best.label, 'Mom', 'their own footprint holds the record')
  assert.equal(visitsForGuest(read, null).best.label, null, 'no invite, no name')
  assert.equal(visitsForGuest({ ...read, best: null, bestInviteId: null }, 'abc').best, null)
})

test('the owner sees everything, but the holder id stays on the server', () => {
  const owner = visitsForOwner(read)
  assert.deepEqual(Object.keys(owner).sort(), ['best', 'pets', 'recent', 'total'])
  assert.equal(owner.best.label, 'Mom')
  assert.equal(owner.recent.length, 1)
})
