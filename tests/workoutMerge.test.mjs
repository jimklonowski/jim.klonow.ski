// Unit tests for the read-time workout merge (shared/utils/workoutMerge.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeWorkouts, workoutSource } from '../shared/utils/workoutMerge.ts'

function row(overrides) {
  return {
    external_id: 'APPLE-UUID', date: '2026-10-19', workout_type: 'Indoor Cycling', start_time: null,
    duration_min: null, calories: null, avg_hr: null, max_hr: null, distance_mi: null, ...overrides
  }
}

function pick(w) {
  const { date, workout_type, start_time, duration_min, calories, avg_hr, max_hr, distance_mi, sources } = w
  return { date, workout_type, start_time, duration_min, calories, avg_hr, max_hr, distance_mi, sources }
}

// The rows exactly as the workouts table held them for the 45-min HIIT ride of 2026-10-19: the
// watch failed to reach the bike twice (two false starts under two minutes each, every metric
// filled in), then the real recording, plus Whoop's copy twice (its own row and the one it wrote
// to HealthKit, which comes back through Health Auto Export as an Apple-sourced row).
const OCT_19 = [
  row({ external_id: 'EB3F57A6', start_time: '2026-10-19 18:41:37 -0500', duration_min: 1.8, calories: 7, avg_hr: 104, max_hr: 111, distance_mi: 0.4 }),
  row({ external_id: '82FDAEDD', start_time: '2026-10-19 18:42:13 -0500', duration_min: 45, calories: 531, avg_hr: 152, max_hr: 183 }),
  row({ external_id: 'AFB3C063', start_time: '2026-10-19 18:44:38 -0500', duration_min: 1.7, calories: 9, avg_hr: 120, max_hr: 126, distance_mi: 1 }),
  row({ external_id: '862F94C6', start_time: '2026-10-19 18:46:34 -0500', duration_min: 40.7, calories: 376, avg_hr: 157, max_hr: 183, distance_mi: 13.3 }),
  row({ external_id: 'whoop:e53d826d', workout_type: 'spin', start_time: '2026-10-19T23:42:13.000Z', duration_min: 45, calories: 531, avg_hr: 149, max_hr: 180 })
]

test('false starts before the real recording neither lead the merge nor leak their figures', () => {
  const merged = mergeWorkouts(OCT_19)
  assert.equal(merged.length, 1)
  // The watch joined the class five minutes in (40.7 min); the Whoop copies knew it was 45.
  assert.deepEqual(pick(merged[0]), {
    date: '2026-10-19', workout_type: 'Indoor Cycling', start_time: '2026-10-19 18:46:34 -0500',
    duration_min: 45, calories: 376, avg_hr: 157, max_hr: 183, distance_mi: 13.3, sources: ['apple', 'whoop']
  })
})

test('a session lasts as long as its longest whole record; its figures stay with the richest', () => {
  const merged = mergeWorkouts([
    row({ external_id: 'A', start_time: '2026-10-19 18:46:34 -0500', duration_min: 40.7, calories: 376, avg_hr: 157, max_hr: 183, distance_mi: 13.3 }),
    row({ external_id: 'whoop:x', workout_type: 'spin', start_time: '2026-10-19T23:42:13.000Z', duration_min: 45, calories: 531, avg_hr: 149, max_hr: 180 })
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].duration_min, 45)
  assert.equal(merged[0].calories, 376)
  assert.equal(merged[0].avg_hr, 157)
  assert.equal(merged[0].start_time, '2026-10-19 18:46:34 -0500')
  // A false start's duration is not in the running.
  const withFalseStart = mergeWorkouts([
    row({ external_id: 'F', start_time: '2026-10-19 18:41:37 -0500', duration_min: 1.8, calories: 7, avg_hr: 104, max_hr: 111, distance_mi: 0.4 }),
    row({ external_id: 'A', start_time: '2026-10-19 18:46:34 -0500', duration_min: 20, calories: 200, avg_hr: 150, max_hr: 170, distance_mi: 6 })
  ])
  assert.equal(withFalseStart[0].duration_min, 20)
})

test('a false start does not fill a gap in the full record either', () => {
  const merged = mergeWorkouts([
    row({ external_id: 'A', start_time: '2026-10-19 18:41:37 -0500', duration_min: 1.8, calories: 7, avg_hr: 104, max_hr: 111, distance_mi: 0.4 }),
    row({ external_id: 'B', start_time: '2026-10-19 18:46:34 -0500', duration_min: 40.7, calories: 376, avg_hr: 157, max_hr: 183 })
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].duration_min, 40.7)
  assert.equal(merged[0].distance_mi, null)
})

test('a short session with no longer copy beside it is kept whole', () => {
  const merged = mergeWorkouts([
    row({ external_id: 'A', start_time: '2026-10-19 18:41:37 -0500', duration_min: 2, calories: 9, avg_hr: 110, max_hr: 120, distance_mi: 0.5 }),
    row({ external_id: 'whoop:x', workout_type: 'spin', start_time: '2026-10-19T23:41:00.000Z', duration_min: 2.5, calories: 12, avg_hr: 108, max_hr: 118 })
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].duration_min, 2.5)
  assert.equal(merged[0].calories, 9)
  assert.equal(merged[0].distance_mi, 0.5)
  assert.deepEqual(merged[0].sources, ['apple', 'whoop'])
})

test('on equal richness the longer record leads, so the figures match the duration shown', () => {
  // A strength session the watch split in two: a 5-min segment and a 10.3-min one, same fields.
  const merged = mergeWorkouts([
    row({ external_id: 'A', date: '2024-06-24', workout_type: 'Preparation & Recovery', start_time: '2024-06-24 17:13:42 -0500', duration_min: 5, calories: 32, avg_hr: 125, max_hr: 142 }),
    row({ external_id: 'B', date: '2024-06-24', workout_type: 'Functional Strength Training', start_time: '2024-06-24 17:20:42 -0500', duration_min: 10.3, calories: 79, avg_hr: 115, max_hr: 146 })
  ])
  assert.equal(merged.length, 1)
  assert.deepEqual(pick(merged[0]), {
    date: '2024-06-24', workout_type: 'Functional Strength Training', start_time: '2024-06-24 17:20:42 -0500',
    duration_min: 10.3, calories: 79, avg_hr: 115, max_hr: 146, distance_mi: null, sources: ['apple']
  })
})

test('a record with no duration is not mistaken for a false start', () => {
  const merged = mergeWorkouts([
    row({ external_id: 'A', start_time: '2026-10-19 18:41:37 -0500', duration_min: 45, calories: 531, avg_hr: 152, max_hr: 183 }),
    row({ external_id: 'B', start_time: '2026-10-19 18:42:00 -0500', distance_mi: 13.3 })
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].duration_min, 45)
  assert.equal(merged[0].distance_mi, 13.3)
})

test('whoop base on a richness tie still takes the label, date and local start from apple', () => {
  const merged = mergeWorkouts([
    row({ external_id: 'whoop:x', date: '2026-10-20', workout_type: 'spin', start_time: '2026-10-19T23:41:00.000Z', duration_min: 45, calories: 531, avg_hr: 149, max_hr: 180 }),
    row({ external_id: 'A', start_time: '2026-10-19 18:42:13 -0500', duration_min: 45, calories: 400, avg_hr: 152, max_hr: 183 })
  ])
  assert.equal(merged.length, 1)
  assert.deepEqual(pick(merged[0]), {
    date: '2026-10-19', workout_type: 'Indoor Cycling', start_time: '2026-10-19 18:42:13 -0500',
    duration_min: 45, calories: 531, avg_hr: 149, max_hr: 180, distance_mi: null, sources: ['whoop', 'apple']
  })
})

test('a whoop copy that lags the class by over ten minutes still merges on overlap', () => {
  const merged = mergeWorkouts([
    row({ external_id: 'A', start_time: '2026-10-19 18:00:00 -0500', duration_min: 45, calories: 400, avg_hr: 150, max_hr: 180, distance_mi: 13 }),
    row({ external_id: 'whoop:x', workout_type: 'spin', start_time: '2026-10-19T23:11:42.000Z', duration_min: 40, calories: 500, avg_hr: 149, max_hr: 180 })
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].distance_mi, 13)
})

test('back-to-back classes stay separate sessions', () => {
  const merged = mergeWorkouts([
    row({ external_id: 'A', start_time: '2026-10-19 18:00:00 -0500', duration_min: 30, calories: 300, avg_hr: 150, max_hr: 180, distance_mi: 9 }),
    row({ external_id: 'B', start_time: '2026-10-19 18:32:00 -0500', duration_min: 30, calories: 280, avg_hr: 145, max_hr: 175, distance_mi: 8.5 })
  ])
  assert.equal(merged.length, 2)
  assert.deepEqual(merged.map(w => w.distance_mi), [9, 8.5])
})

test('rows without a readable start pass through on their own, sorted after timed ones that day', () => {
  const merged = mergeWorkouts([
    row({ external_id: null, workout_type: 'Walking', start_time: null, duration_min: 20 }),
    row({ external_id: 'A', start_time: '2026-10-19 07:00:00 -0500', duration_min: 30, calories: 300, avg_hr: 150, max_hr: 180 })
  ])
  assert.deepEqual(merged.map(w => [w.workout_type, w.sources]), [['Indoor Cycling', ['apple']], ['Walking', ['manual']]])
})

test('source is read off the external id', () => {
  assert.equal(workoutSource('whoop:abc'), 'whoop')
  assert.equal(workoutSource('EB3F57A6-E3BD'), 'apple')
  assert.equal(workoutSource(null), 'manual')
})
