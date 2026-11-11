// Sodium → next-morning systolic and late caffeine → that night's sleep (shared/utils/drivers.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_GROUP, caffeinePoints, median, nightOf, sleepByNight, sodiumPoints, splitAt, wholeDaySodium } from '../shared/utils/drivers.ts'
import { indexEstimates } from '../shared/utils/nutrition.ts'
import { mealKey } from '../shared/utils/mealKey.ts'
import { shiftDays } from '../shared/utils/dates.ts'

const est = (text, sodium_mg) => ({ key: mealKey(text), text, kcal: 500, protein_g: 30, carbs_g: 40, fat_g: 20, sodium_mg, fiber_g: 2, confidence: 'high', assumptions: null, source: 'manual', model: null, created_at: 'x', updated_at: 'x' })
const index = indexEstimates([est('test salty', 1500), est('test plain', 400), est('test nofigure', null)])
const food = (...meals) => ({ breakfast: meals[0], lunch: meals[1], dinner: meals[2] })

test('a night belongs to the day whose evening it follows', () => {
  assert.equal(nightOf({ date: '2026-11-05', sleep_start: '2026-11-04 23:10:00 -0600' }), '2026-11-04')
  assert.equal(nightOf({ date: '2026-11-05', sleep_start: '2026-11-05 00:40:00 -0600' }), '2026-11-04', 'after midnight is still last night')
  assert.equal(nightOf({ date: '2026-11-05', sleep_start: '2026-11-05T05:10:00.000Z' }), '2026-11-04', 'Whoop\'s UTC stamp: 23:10 Chicago on the 4th')
  assert.equal(nightOf({ date: '2026-11-05', sleep_start: null }), '2026-11-04', 'no start → dated by its morning')
  const nights = sleepByNight([
    { date: '2026-11-05', sleep_total_min: 400, sleep_start: '2026-11-04 23:10:00 -0600' },
    { date: '2026-11-05', sleep_total_min: 30, sleep_start: '2026-11-05 00:40:00 -0600' },
    { date: '2026-11-06', sleep_total_min: 0, sleep_start: null }
  ])
  assert.deepEqual([...nights], [['2026-11-04', 400]], 'the longer record wins; a zero night is no night')
})

test('sodium counts only on a whole day whose every meal carries a sodium figure, paired with the next day\'s systolic', () => {
  assert.equal(wholeDaySodium({ date: 'x', food: food('test salty', 'test plain', 'test plain') }, index), 2300)
  assert.equal(wholeDaySodium({ date: 'x', food: food('test salty', 'test nofigure', 'test plain') }, index), null, 'a meal with no sodium figure → a floor, not a figure')
  assert.equal(wholeDaySodium({ date: 'x', food: { breakfast: 'test salty' } }, index), null, 'no dinner → not a whole day')
  // A labelled-less Gatorade adds its table sodium (160 mg per 12 oz).
  assert.equal(wholeDaySodium({ date: 'x', food: food('test plain', 'test plain', 'test plain'), sodas: [{ time: '10:00', drink: 'Gatorade', size: '12oz bottle' }] }, index), 1360)

  const journal = [
    { date: '2026-11-01', food: food('test salty', 'test salty', 'test salty') },
    { date: '2026-11-02', bp_systolic: 130, food: food('test plain', 'test plain', 'test plain') },
    { date: '2026-11-03', bp_systolic: 120, food: food('test salty', 'test nofigure', 'test plain') },
    { date: '2026-11-04', bp_systolic: 125 },
    { date: '2026-11-06', bp_systolic: 118 }
  ]
  assert.deepEqual(sodiumPoints(journal, index), [
    { day: '2026-11-01', x: 4500, y: 130 },
    { day: '2026-11-02', x: 1200, y: 120 }
  ], 'the 3rd has a floor only; the 5th has no row')
})

test('late caffeine against the night that followed, 0 on a day with none', () => {
  const journal = [
    { date: '2026-11-01', sodas: [{ time: '15:30', drink: 'Dr Pepper', size: '12oz can' }, { time: '09:00', drink: 'Coffee', size: '12oz cup' }] },
    { date: '2026-11-02', sodas: [] },
    { date: '2026-11-03', sodas: [{ time: '20:00', drink: 'Dr Pepper', size: '20oz bottle' }] }
  ]
  const health = [
    { date: '2026-11-02', sleep_total_min: 380, sleep_start: '2026-11-01 23:50:00 -0600' },
    { date: '2026-11-03', sleep_total_min: 450, sleep_start: '2026-11-03 00:10:00 -0600' }
  ]
  assert.deepEqual(caffeinePoints(journal, health, index), [
    { day: '2026-11-01', x: 41, y: 380 },
    { day: '2026-11-02', x: 0, y: 450 }
  ], 'the 3rd has no night on file yet')
})

test('a split compares the two sides only once each holds enough days', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(median([]), null)
  const pts = Array.from({ length: 12 }, (_, n) => ({ day: shiftDays('2026-10-01', n), x: n < 6 ? 0 : 50, y: n < 6 ? 420 : 390 }))
  const s = splitAt(pts, 0)
  assert.deepEqual([s.above.n, s.below.n, s.above.mean, s.below.mean, s.diff, s.enough], [6, 6, 390, 420, -30, true])
  const few = splitAt(pts.slice(0, 6 + MIN_GROUP - 1), 0)
  assert.equal(few.enough, false)
  assert.equal(few.diff, null, 'four days on one side is not a comparison')
  assert.equal(splitAt([], 0).above.mean, null)
})
