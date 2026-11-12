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

// --- audit #43 item 83 ---
test('AHA categories: the higher figure decides', async () => {
  const { bpCategory } = await import('../shared/utils/bloodPressure.ts')
  const cat = (s, d) => bpCategory({ systolic: s, diastolic: d }).key
  assert.equal(cat(118, 76), 'normal')
  assert.equal(cat(120, 79), 'elevated')
  assert.equal(cat(129, 79), 'elevated')
  assert.equal(cat(118, 80), 'stage1', 'a diastolic of 80 is stage 1 on its own')
  assert.equal(cat(130, 70), 'stage1')
  assert.equal(cat(139, 89), 'stage1')
  assert.equal(cat(140, 70), 'stage2')
  assert.equal(cat(125, 90), 'stage2')
  assert.equal(cat(181, 90), 'crisis')
  assert.equal(cat(150, 121), 'crisis')
})

test('the 7-day average: full readings in the window, against the categories and the goal', async () => {
  const { bpWeekAverage, bpGoal, BP_DEFAULT_GOAL } = await import('../shared/utils/bloodPressure.ts')
  const rows = [
    { date: '2026-11-05', bp_systolic: 150, bp_diastolic: 95 }, // the day before the window
    { date: '2026-11-06', bp_systolic: 124, bp_diastolic: 78 },
    { date: '2026-11-08', bp_systolic: 128, bp_diastolic: null }, // half-logged: out
    { date: '2026-11-09', bp_systolic: 121, bp_diastolic: 72 },
    { date: '2026-11-12', bp_systolic: 121, bp_diastolic: 72 },
    { date: '2026-11-13', bp_systolic: 160, bp_diastolic: 100 } // after asOf
  ]
  const w = bpWeekAverage(rows, '2026-11-12')
  assert.deepEqual([w.systolic, w.diastolic, w.n, w.days, w.category.key, w.met], [122, 74, 3, 7, 'elevated', true])
  assert.deepEqual(w.goal, BP_DEFAULT_GOAL)
  assert.equal(bpWeekAverage(rows, '2026-11-12', { systolic: 120, diastolic: 80 }).met, false, '122 is not under 120')
  assert.equal(bpWeekAverage(rows, '2026-10-01'), null, 'no readings in the window')
  assert.deepEqual(bpGoal('125/80'), { systolic: 125, diastolic: 80 })
  assert.deepEqual(bpGoal(' 120 / 75 '), { systolic: 120, diastolic: 75 })
  assert.deepEqual(bpGoal('low'), BP_DEFAULT_GOAL)
  assert.deepEqual(bpGoal(undefined), BP_DEFAULT_GOAL)
})
