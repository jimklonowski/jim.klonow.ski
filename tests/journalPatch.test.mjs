// The one local-mirror helper behind the journal widgets (app/utils/journalPatch.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patchJournalDay } from '../app/utils/journalPatch.ts'

const ref = value => ({ value })

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
