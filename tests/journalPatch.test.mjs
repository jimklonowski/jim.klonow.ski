// The one local-mirror helper behind the journal widgets (app/utils/journalPatch.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { overlayTaps, patchJournalDay, setPendingTapSource } from '../app/utils/journalPatch.ts'

const ref = value => ({ value })
const water = (id, date = '2026-10-21', oz = 12) => ({ id, kind: 'water', date, time: '09:00', oz })
const soda = (id, date = '2026-10-21') => ({ id, kind: 'soda', date, time: '13:00', drink: 'Dr Pepper', size: '12oz can' })

test('overlayTaps: each queued tap goes on its day after the server\'s rows, once', () => {
  const list = [{ date: '2026-10-20', water: [{ time: '08:00', oz: 8 }] }, { date: '2026-10-21', sodas: [{ time: '12:00', id: 'srv' }] }]
  const out = overlayTaps(list, [water('tap-w'), soda('tap-s'), water('tap-y', '2026-10-20', 16)])
  assert.notEqual(out, list)
  assert.deepEqual(list[1], { date: '2026-10-21', sodas: [{ time: '12:00', id: 'srv' }] }, 'the input is not mutated')
  assert.deepEqual(out[0].water, [{ time: '08:00', oz: 8 }, { time: '09:00', oz: 16, id: 'tap-y' }])
  assert.deepEqual(out[1].sodas, [{ time: '12:00', id: 'srv' }, { time: '13:00', drink: 'Dr Pepper', size: '12oz can', id: 'tap-s' }])
  assert.deepEqual(out[1].water, [{ time: '09:00', oz: 12, id: 'tap-w' }])
  // Already there by id (it landed; only the answer was lost), or nothing queued: the same array.
  assert.equal(overlayTaps(out, [water('tap-w'), soda('tap-s')]), out)
  assert.equal(overlayTaps(list, []), list)
  // A day with no row yet gets one, in date order; a null list reads as empty.
  assert.deepEqual(overlayTaps([{ date: '2026-10-19' }, { date: '2026-10-22', water: null }], [water('a'), water('b', '2026-10-22')]).map(e => [e.date, e.water?.length]), [['2026-10-19', undefined], ['2026-10-21', 1], ['2026-10-22', 1]])
})

test('patchJournalDay keeps the queued taps on the day a server list is written into', () => {
  setPendingTapSource(() => [water('tap-a')])
  try {
    const data = ref([{ date: '2026-10-21', water: [{ time: '09:00', oz: 12, id: 'tap-a' }] }])
    // The next tap's answer: the server's list, which cannot hold the queued one.
    patchJournalDay(data, '2026-10-21', { water: [{ time: '10:00', oz: 12, id: 'tap-b' }] })
    assert.deepEqual(data.value[0].water.map(w => w.id), ['tap-b', 'tap-a'])
    // A patch to another field of the day (the food card) leaves the lists as they are.
    const before = data.value[0].water
    patchJournalDay(data, '2026-10-21', { food: { breakfast: 'eggs' } })
    assert.equal(data.value[0].water, before)
  }
  finally {
    setPendingTapSource(() => [])
  }
})

test('an existing day is replaced by a NEW array with the patch merged in', () => {
  const data = ref([{ date: '2026-10-20', sodas: [] }, { date: '2026-10-21', sodas: [], water: [{ oz: 12 }] }])
  const before = data.value
  patchJournalDay(data, '2026-10-21', { sodas: [{ time: '12:00' }] })
  assert.notEqual(data.value, before, 'reassigned, not mutated')
  assert.deepEqual(data.value[1], { date: '2026-10-21', sodas: [{ time: '12:00' }], water: [{ oz: 12 }] })
  assert.deepEqual(data.value[0], before[0])
})

test('a day with no row yet is inserted in date order', () => {
  const data = ref([{ date: '2026-10-19' }, { date: '2026-10-21' }])
  patchJournalDay(data, '2026-10-20', { water: [{ oz: 12 }] })
  assert.deepEqual(data.value.map(e => e.date), ['2026-10-19', '2026-10-20', '2026-10-21'])
  assert.deepEqual(data.value[1], { date: '2026-10-20', water: [{ oz: 12 }] })
})

test('before the list has loaded there is nothing to mirror into', () => {
  const data = ref(null)
  patchJournalDay(data, '2026-10-20', { water: [] })
  assert.equal(data.value, null)
})
