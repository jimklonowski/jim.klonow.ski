// The weekly scorecard (shared/utils/weeklyScorecard.ts) — audit #43 item 79.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bedtimeMinutes, weeklyScorecard } from '../shared/utils/weeklyScorecard.ts'
import { shiftDays } from '../shared/utils/dates.ts'
import { mealKey } from '../shared/utils/mealKey.ts'

const START = '2026-11-01'
const END = '2026-11-07'
const est = (text, kcal, protein) => [mealKey(text), { key: mealKey(text), text, kcal, protein_g: protein, carbs_g: 0, fat_g: 0, confidence: 'high', assumptions: null, source: 'manual', model: null, created_at: 'x', updated_at: 'x' }]
const estimates = new Map([est('test breakfast', 600, 40), est('test lunch', 800, 50), est('test dinner', 900, 60)])
const food = { breakfast: 'test breakfast', lunch: 'test lunch', dinner: 'test dinner' }

// Three weeks of weigh-ins drifting down 0.1 lb a day; the scored week is the last.
const journal = Array.from({ length: 21 }, (_, n) => {
  const date = shiftDays('2026-10-18', n)
  const inWeek = date >= START
  return {
    date,
    weight_lbs: 172 - n * 0.1,
    food: inWeek && n % 7 !== 6 ? food : inWeek ? { breakfast: 'test breakfast' } : {},
    sodas: date === '2026-11-03' ? [{ time: '15:30', drink: 'Dr Pepper', size: '12oz can' }, { time: '09:00', drink: 'Gatorade', size: '20oz bottle' }] : [],
    water: inWeek ? [{ oz: 80 }] : []
  }
})
const health = Array.from({ length: 7 }, (_, n) => ({
  date: shiftDays(START, n),
  steps: 8000 + n * 500,
  sleep_total_min: 400 + n * 5,
  sleep_start: `${shiftDays(START, n)} ${n % 2 ? '23:40' : '22:40'}:00 -0600`
}))
const workouts = [{ date: '2026-11-02', duration_min: 45 }, { date: '2026-11-02', duration_min: 20 }, { date: '2026-11-05', duration_min: 60 }]

test('bedtime minutes are noon-anchored so midnight does not split a week', () => {
  assert.equal(bedtimeMinutes('2026-10-21 23:30:00 -0500'), 690)
  assert.equal(bedtimeMinutes('2026-10-22T00:30:00.000Z'), 750, 'an hour later, not 23 hours earlier')
  assert.equal(bedtimeMinutes(null), null)
})

test('the week\'s rows: weight, intake, protein, training, steps, sleep, soda, caffeine, water', () => {
  const rows = weeklyScorecard({ start: START, end: END, journal, health, workouts, estimates, scans: [], proteinTarget: 160, waterGoalOz: 100 })
  const by = Object.fromEntries(rows.map(r => [r.key, r]))
  assert.deepEqual(rows.map(r => r.key), ['weight', 'intake', 'protein', 'training', 'steps', 'sleep', 'soda', 'caffeine', 'water'])
  assert.match(by.weight.value, /^17\d(\.\d)? lb$/)
  assert.match(by.weight.detail, /^−0\.\d lb on the week/)
  // Six whole days at 2,300 kcal and 150 g of food, plus the Nov 3 drinks' 283 kcal (47 a day);
  // the seventh logged breakfast only and is left out.
  assert.equal(by.intake.value, '2,347 kcal/day')
  assert.match(by.intake.detail, /^6 of 7 days logged whole/)
  assert.equal(by.protein.value, '150 g/day')
  assert.equal(by.protein.detail, 'target 160 g · 0 of 6 days met')
  assert.equal(by.protein.tone, 'warn')
  assert.equal(by.training.value, '3 sessions')
  assert.equal(by.training.detail, '125 min across 2 days')
  assert.equal(by.steps.value, '9,500/day')
  assert.equal(by.sleep.value, '6h 55m/night')
  assert.match(by.sleep.detail, /7 nights · bedtime ±30 min/)
  assert.equal(by.sleep.tone, 'warn', 'under seven hours')
  // One soda; the Gatorade is not one, and adds 20 oz to that day's water.
  assert.equal(by.soda.value, '1')
  assert.equal(by.soda.detail, '~12 oz · 1 of 7 days')
  assert.equal(by.caffeine.value, '41 mg/day')
  assert.match(by.caffeine.detail, /after 14:00 on 1/)
  assert.equal(by.water.value, '83 oz/day')
  assert.equal(by.water.detail, '7 of 7 days logged · goal 100 oz, met on 1')
})

test('an empty week still says so for training and soda, and nothing else', () => {
  const rows = weeklyScorecard({ start: START, end: END, journal: [], health: [], workouts: [], estimates: new Map(), scans: [], proteinTarget: null, waterGoalOz: null })
  assert.deepEqual(rows.map(r => [r.key, r.value, r.detail, r.tone]), [['training', '0 sessions', 'none logged', 'warn'], ['soda', '0', 'a clean week', 'ok']])
})
