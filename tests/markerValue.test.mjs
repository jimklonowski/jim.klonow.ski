// One marker-value formatter for the labs page and the home watch tile (shared/utils/markerValue.ts), audit #42 item 21.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtMarkerValue } from '../shared/utils/markerValue.ts'

test('a reading keeps its decimal at any magnitude; whole numbers print as themselves', () => {
  assert.equal(fmtMarkerValue(51.7), '51.7', 'hematocrit — used to read "52"')
  assert.equal(fmtMarkerValue(50.4), '50.4', 'flagged high against ≤50 — used to print as "50"')
  assert.equal(fmtMarkerValue(7.1), '7.1')
  assert.equal(fmtMarkerValue(16), '16')
  assert.equal(fmtMarkerValue(1500), '1500')
  assert.equal(fmtMarkerValue(2211), '2211')
  assert.equal(fmtMarkerValue(0.5), '0.5')
})

test('a second decimal rounds to one, the labs page precision', () => {
  assert.equal(fmtMarkerValue(1.07), '1.1')
  assert.equal(fmtMarkerValue(37.25), '37.3')
})
