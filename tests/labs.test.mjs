// The labs save sanitizers (server/utils/labs.ts) — what reaches labs_entries / dexa_entries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeDexa, sanitizeMarkers } from '../server/utils/labs.ts'

test('markers: numbers and numeric strings are kept, unknown keys and junk are dropped', () => {
  const { markers, dropped } = sanitizeMarkers({ hematocrit: 51.7, ferritin: ' 35 ', not_a_marker: 1, ldl: 'high' })
  assert.deepEqual(markers, { hematocrit: 51.7, ferritin: 35 })
  assert.deepEqual(dropped.sort(), ['ldl', 'not_a_marker'])
})

test('markers: a blank string is no reading — never a 0 (audit #43 item 3)', () => {
  const { markers, dropped } = sanitizeMarkers({ testosterone_total: '', estradiol: '   ', hematocrit: null, ferritin: 0 })
  assert.deepEqual(markers, { ferritin: 0 }, 'a real 0 is still a reading')
  assert.deepEqual(dropped, [], 'blank is absent, not refused')
})

test('dexa: a blank figure is absent, so an emptied block is null rather than a row of zeros', () => {
  const d = sanitizeDexa({
    total: { body_fat_pct: '17.6', lean_mass_lbs: '' },
    vat: { volume_in3: ' ', fat_mass_lbs: '' },
    ag_ratio: ''
  })
  assert.deepEqual(d.total, { body_fat_pct: 17.6 })
  assert.equal(d.vat, null)
  assert.equal(d.ag_ratio, null)
  assert.deepEqual(d.dropped, [])
})
