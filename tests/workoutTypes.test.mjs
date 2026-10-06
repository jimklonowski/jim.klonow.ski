// Source spellings of a workout fold to one label (shared/utils/workoutTypes.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWorkoutType } from '../shared/utils/workoutTypes.ts'

test('disc golf reads the same whichever source wrote it', () => {
  assert.equal(normalizeWorkoutType('disc-golf'), 'Disc Golf') // Whoop sport_name
  assert.equal(normalizeWorkoutType('Disc Sports'), 'Disc Golf') // HealthKit workout type
  assert.equal(normalizeWorkoutType('Disc Golf'), 'Disc Golf')
  assert.equal(normalizeWorkoutType(' DISC GOLF '), 'Disc Golf')
})

test('every other label passes through untouched', () => {
  assert.equal(normalizeWorkoutType('Indoor Cycling'), 'Indoor Cycling')
  assert.equal(normalizeWorkoutType('spin'), 'spin')
  assert.equal(normalizeWorkoutType('Workout'), 'Workout')
  assert.equal(normalizeWorkoutType(null), null)
  assert.equal(normalizeWorkoutType(undefined), null)
})
