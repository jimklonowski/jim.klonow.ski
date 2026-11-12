// Intake on training days against rest days (shared/utils/trainingSplit.ts) — audit #43 item 80.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTrainingType, trainingMinutesByDay, trainingSplit } from '../shared/utils/trainingSplit.ts'
import { indexEstimates } from '../shared/utils/nutrition.ts'
import { mealKey } from '../shared/utils/mealKey.ts'

const est = (text, kcal, protein) => ({ key: mealKey(text), text, kcal, protein_g: protein, carbs_g: 50, fat_g: 20, sodium_mg: null, fiber_g: null, confidence: 'high', assumptions: null, source: 'manual', model: null, created_at: 'x', updated_at: 'x' })
const index = indexEstimates([est('test big', 900, 60), est('test small', 600, 40)])
const day = (date, meal, dinner = true) => ({ date, food: { breakfast: meal, lunch: meal, ...(dinner ? { dinner: meal } : {}) } })
const TODAY = '2026-11-12'

test('a commute or a stretch is not a session; an unknown type is', () => {
  for (const t of ['Indoor Cycling', 'spin', 'Functional Strength Training', 'functional-fitness', 'weightlifting', 'Other', 'pickleball', null]) assert.equal(isTrainingType(t), true, String(t))
  for (const t of ['commuting', 'yard-work', 'stretching', 'Preparation & Recovery', 'Walking', 'Disc Golf']) assert.equal(isTrainingType(t), false, t)
  const m = trainingMinutesByDay([
    { date: '2026-11-01', workout_type: 'Indoor Cycling', duration_min: 20 },
    { date: '2026-11-01', workout_type: 'Functional Strength Training', duration_min: 12 },
    { date: '2026-11-02', workout_type: 'commuting', duration_min: 40 },
    { date: '2026-11-03', workout_type: 'spin', duration_min: null }
  ])
  assert.deepEqual([...m], [['2026-11-01', 32]])
})

test('whole days are averaged by whether the day had a session', () => {
  const journal = [
    day('2026-11-01', 'test big'), day('2026-11-02', 'test big'), day('2026-11-03', 'test big'),
    day('2026-11-04', 'test small'), day('2026-11-05', 'test small'), day('2026-11-06', 'test small'),
    day('2026-11-07', 'test big', false), // no dinner: not a whole day
    { date: '2026-11-08', food: { breakfast: 'test big', lunch: 'unknown thing', dinner: 'test big' } }, // a meal without figures
    day('2026-11-09', 'test small') // ten minutes of dips: under the bar, a rest day
  ]
  const workouts = [
    ...['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-07', '2026-11-08'].map(date => ({ date, workout_type: 'Indoor Cycling', duration_min: 30 })),
    { date: '2026-11-04', workout_type: 'commuting', duration_min: 45 },
    { date: '2026-11-09', workout_type: 'Functional Strength Training', duration_min: 10 }
  ]
  const s = trainingSplit(journal, workouts, index, TODAY)
  assert.deepEqual(s.training, { days: 3, kcal: 2700, protein_g: 180, carbs_g: 150, fat_g: 60 })
  assert.deepEqual(s.rest, { days: 4, kcal: 1800, protein_g: 120, carbs_g: 150, fat_g: 60 })
  assert.deepEqual([s.enough, s.diffKcal, s.diffProtein], [true, 900, 60])
})

test('no comparison until each side has three days; today waits for its dinner', () => {
  const journal = [day('2026-11-01', 'test big'), day('2026-11-02', 'test big'), day('2026-11-04', 'test small'), day('2026-11-05', 'test small'), day('2026-11-06', 'test small')]
  const workouts = ['2026-11-01', '2026-11-02'].map(date => ({ date, workout_type: 'spin', duration_min: 30 }))
  const s = trainingSplit(journal, workouts, index, TODAY)
  assert.deepEqual([s.training.days, s.rest.days, s.enough, s.diffKcal], [2, 3, false, null])
  const empty = trainingSplit([], [], index, TODAY)
  assert.deepEqual([empty.training, empty.rest, empty.enough], [null, null, false])
  // Today with breakfast and lunch only is left out; with its dinner in, it counts.
  assert.equal(trainingSplit([day(TODAY, 'test big', false)], [], index, TODAY).rest, null)
  assert.equal(trainingSplit([day(TODAY, 'test big')], [], index, TODAY).rest.days, 1)
})
