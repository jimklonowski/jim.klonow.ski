// Blood pressure is a pair (shared/utils/bloodPressure.ts), audit #42 item 25.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bpAverageLabel, bpLabel, bpReading } from '../shared/utils/bloodPressure.ts'

test('a reading needs both figures above zero', () => {
  assert.deepEqual(bpReading({ bp_systolic: 128, bp_diastolic: 78 }), { systolic: 128, diastolic: 78 })
  assert.equal(bpReading({ bp_systolic: 128, bp_diastolic: null }), null, 'half-logged')
  assert.equal(bpReading({ bp_systolic: null, bp_diastolic: 78 }), null)
  assert.equal(bpReading({ bp_systolic: 0, bp_diastolic: null }), null, 'the 2026-04-03 shape: a zero and nothing')
  assert.equal(bpReading({ bp_systolic: 128, bp_diastolic: 0 }), null)
  assert.equal(bpReading(null), null)
  assert.equal(bpLabel({ bp_systolic: 113, bp_diastolic: 60 }), '113/60')
  assert.equal(bpLabel({ bp_systolic: 113 }), null)
})

test('the weekly average uses only full readings and never prints a 0 side', () => {
  const week = [
    { bp_systolic: 128, bp_diastolic: 80 },
    { bp_systolic: 132, bp_diastolic: null }, // half-logged: out
    { bp_systolic: 120, bp_diastolic: 76 },
    { bp_systolic: null, bp_diastolic: null }
  ]
  assert.equal(bpAverageLabel(week), '124/78')
  assert.equal(bpAverageLabel([{ bp_systolic: 128, bp_diastolic: null }]), null, 'used to read "bp 128/0"')
  assert.equal(bpAverageLabel([]), null)
})
