// Unit tests for the cycle date/window math that adherence scoring, calendar rings, the PK
// overlay, and the AI prompt context all hang off. Plain node:test + native TS type
// stripping (Node 23.6+), so there's no test framework to install:
//
//   node --test tests/
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkpointStates, cycleEnd, cycleProgress, cycleRules, cycleStatusOn,
  diffDays, isTentative, itemWindow, mergeRules, periodLabel, plannedDoses, plannedEnd,
  relevantCycle, shiftDays, startAnchor, tentativeStartLabel
} from '../shared/utils/cycles.ts'

// 2026-09-14 is a Monday.
const primo = { compound: 'Methenolone Enanthate', dose: 200, unit: 'mg', weekdays: [1, 4], fromWeek: 1, toWeek: null }
const anavar = { compound: 'Oxandrolone', dose: 25, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 12, toWeek: 16 }

function run(overrides = {}) {
  return {
    id: 1,
    name: 'Primo Run 1',
    start_date: '2026-09-14',
    planned_weeks: 16,
    actual_end: null,
    compounds: [primo, anavar],
    ...overrides
  }
}

test('date helpers', () => {
  assert.equal(shiftDays('2026-09-14', 7), '2026-09-21')
  assert.equal(shiftDays('2026-03-01', -1), '2026-02-28')
  assert.equal(diffDays('2026-09-14', '2026-09-21'), 7)
  // Spans the US spring-forward DST change — noon anchoring keeps it whole days.
  assert.equal(diffDays('2026-03-07', '2026-03-09'), 2)
})

test('cycle end and status derive from dates', () => {
  const c = run()
  assert.equal(plannedEnd(c), '2027-01-03') // 16 weeks = 112 days, inclusive end
  assert.equal(cycleEnd(c), '2027-01-03')
  assert.equal(cycleStatusOn(c, '2026-09-13'), 'upcoming')
  assert.equal(cycleStatusOn(c, '2026-09-14'), 'active')
  assert.equal(cycleStatusOn(c, '2027-01-03'), 'active')
  assert.equal(cycleStatusOn(c, '2027-01-04'), 'done')

  const cut = run({ actual_end: '2026-11-01' })
  assert.equal(cycleEnd(cut), '2026-11-01')
  assert.equal(cycleStatusOn(cut, '2026-11-02'), 'done')
})

test('progress counts 1-based days and weeks, clamped to the span', () => {
  const c = run()
  assert.deepEqual(cycleProgress(c, '2026-09-14'), { day: 1, week: 1, totalDays: 112, totalWeeks: 16, pct: 1 })
  const day34 = cycleProgress(c, shiftDays('2026-09-14', 33))
  assert.equal(day34.day, 34)
  assert.equal(day34.week, 5)
  assert.equal(cycleProgress(c, '2028-01-01').day, 112) // long done — clamps
})

test('item windows are week-relative and clamp to an early end', () => {
  const c = run()
  assert.deepEqual(itemWindow(c, primo), { from: '2026-09-14', to: '2027-01-03' })
  // Weeks 12-16: days 78..112 of the cycle.
  assert.deepEqual(itemWindow(c, anavar), { from: shiftDays('2026-09-14', 77), to: '2027-01-03' })

  const cut = run({ actual_end: '2026-11-01' }) // ended in week 8 — Anavar never started
  assert.equal(itemWindow(cut, primo).to, '2026-11-01')
  assert.equal(itemWindow(cut, anavar), null)
  assert.equal(cycleRules(cut).length, 1)
})

test('shifting the start date moves every phase with it', () => {
  const c = run({ start_date: '2026-09-21' }) // slipped one week
  assert.deepEqual(itemWindow(c, anavar), { from: shiftDays('2026-09-21', 77), to: '2027-01-10' })
})

test('mergeRules splits a standing rule around a same-compound cycle window', () => {
  const standingTC = { compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2026-06-18' }
  const bump = run({
    compounds: [{ compound: 'Testosterone Cypionate', dose: 100, unit: 'mg', weekdays: [1, 4], fromWeek: 1, toWeek: null }]
  })
  const merged = mergeRules([standingTC], [bump])
  const tc = merged.filter(r => r.compound === 'Testosterone Cypionate')
  assert.equal(tc.length, 3)
  // Pre-cycle segment keeps the standing dose and stops the day before the start.
  assert.deepEqual([tc[0].from, tc[0].to], ['2026-06-18', '2026-09-13'])
  // Post-cycle segment resumes the standing cadence open-ended.
  assert.deepEqual([tc[1].from, tc[1].to], ['2027-01-04', undefined])
  // The cycle rule owns the middle at its own dose.
  assert.deepEqual([tc[2].from, tc[2].to, tc[2].doseLabel], ['2026-09-14', '2027-01-03', '100 mg'])
})

test('mergeRules leaves unrelated compounds untouched', () => {
  const standing = { compound: 'HGH', doseLabel: '2 IU', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-06-13' }
  const merged = mergeRules([standing], [run()])
  assert.deepEqual(merged.find(r => r.compound === 'HGH'), standing)
  assert.equal(merged.filter(r => r.compound === 'Methenolone Enanthate').length, 1)
})

test('plannedDoses expands the cadence into dated doses', () => {
  const doses = plannedDoses(run(), 'Methenolone Enanthate')
  assert.equal(doses.length, 32) // 16 weeks x Mon+Thu
  assert.deepEqual(doses[0], { date: '2026-09-14', amount: 200 })
  assert.deepEqual(doses[1], { date: '2026-09-17', amount: 200 })
  assert.equal(plannedDoses(run(), 'Oxandrolone').length, 35) // 5 weeks daily
})

test('checkpoints: windows, baseline picks the freshest pre-start draw', () => {
  const c = run()
  const states = checkpointStates(c, ['2026-07-20', '2026-08-30', '2026-11-02'], '2026-11-10')
  const byKey = Object.fromEntries(states.map(s => [s.key, s]))

  assert.equal(byKey.baseline.drawDate, '2026-08-30') // latest inside the 45d window
  assert.equal(byKey.baseline.state, 'done')
  assert.equal(byKey.mid.drawDate, '2026-11-02') // mid ≈ day 56 → window covers Oct 30–Nov 19
  assert.equal(byKey.end.state, 'upcoming')
  assert.equal(byKey.recovery.state, 'upcoming')
})

test('checkpoints: missed when the window passes with no draw; short cycles drop mid', () => {
  const c = run()
  const states = checkpointStates(c, [], '2027-01-30')
  const byKey = Object.fromEntries(states.map(s => [s.key, s]))
  assert.equal(byKey.baseline.state, 'missed')
  assert.equal(byKey.mid.state, 'missed')
  assert.equal(byKey.end.state, 'missed')
  assert.equal(byKey.recovery.state, 'due') // Jan 30 is inside end+21..end+49 (Jan 24–Feb 21)

  const short = run({ planned_weeks: 6 })
  assert.ok(!checkpointStates(short, [], '2026-09-14').some(s => s.key === 'mid'))
})

test('relevantCycle: active beats upcoming beats recently-done, ancient history is null', () => {
  const active = run()
  const upcoming = run({ id: 2, start_date: '2027-06-01' })
  const oldDone = run({ id: 3, start_date: '2025-01-05', planned_weeks: 8 })
  const today = '2026-10-01'

  assert.equal(relevantCycle([upcoming, active, oldDone], today).id, 1)
  assert.equal(relevantCycle([upcoming, oldDone], today).id, 2)
  assert.equal(relevantCycle([oldDone], today), null)
  // A cycle that just ended stays relevant through its recovery window.
  const justEnded = run({ id: 4, actual_end: '2026-09-20' })
  assert.equal(relevantCycle([justEnded, oldDone], today).id, 4)
})

// --- tentative starts (start_precision 'month'/'quarter') ---

test('startAnchor canonicalizes to the period start; day precision passes through', () => {
  assert.equal(startAnchor('2026-10-14', 'day'), '2026-10-14')
  assert.equal(startAnchor('2026-10-14', 'month'), '2026-10-01')
  assert.equal(startAnchor('2026-10-14', 'quarter'), '2026-10-01')
  assert.equal(startAnchor('2026-02-28', 'quarter'), '2026-01-01')
  assert.equal(startAnchor('2026-09-03', 'quarter'), '2026-07-01')
  assert.equal(startAnchor('2026-12-31', 'quarter'), '2026-10-01')
})

test('period labels read as the period, not a date', () => {
  assert.equal(periodLabel('2026-10-01', 'month'), 'Oct 2026')
  assert.equal(periodLabel('2026-10-01', 'quarter'), 'Q4 2026')
  assert.equal(periodLabel('2026-01-01', 'quarter'), 'Q1 2026')
  // A cycle with a picked day has no period label — callers format the date themselves.
  assert.equal(tentativeStartLabel(run()), null)
  assert.equal(tentativeStartLabel(run({ start_precision: 'month', start_date: '2026-10-01' })), 'Oct 2026')
  // Absent precision (rows predating the migration) reads as a committed day.
  assert.equal(isTentative(run()), false)
  assert.equal(isTentative(run({ start_precision: 'day' })), false)
  assert.equal(isTentative(run({ start_precision: 'quarter' })), true)
})

test('a tentative cycle never leaves upcoming, however far its anchor is in the past', () => {
  const tentative = run({ start_precision: 'month', start_date: '2026-10-01' })
  assert.equal(cycleStatusOn(tentative, '2026-09-03'), 'upcoming')
  assert.equal(cycleStatusOn(tentative, '2026-10-05'), 'upcoming') // anchor passed
  assert.equal(cycleStatusOn(tentative, '2028-01-01'), 'upcoming') // long past
  // The same dates on a committed cycle do move it along.
  const committed = run({ start_date: '2026-10-01' })
  assert.equal(cycleStatusOn(committed, '2026-10-05'), 'active')
  assert.equal(cycleStatusOn(committed, '2028-01-01'), 'done')
})

test('a tentative cycle derives no dated cadence and no checkpoints', () => {
  const tentative = run({ start_precision: 'month', start_date: '2026-10-01' })
  assert.deepEqual(cycleRules(tentative), [])
  assert.deepEqual(checkpointStates(tentative, ['2026-09-30'], '2026-10-05'), [])
  // Sanity: the identical plan with a committed start derives both.
  const committed = run({ start_date: '2026-10-01' })
  assert.equal(cycleRules(committed).length, 2)
  assert.equal(checkpointStates(committed, [], '2026-10-05').length, 4)
})

test('plannedDoses stays whole for a tentative plan — stock coverage depends on the totals', () => {
  const tentative = run({ start_precision: 'month', start_date: '2026-10-01' })
  const committed = run({ start_date: '2026-10-01' })
  // Same plan, same requirement: what to buy doesn't depend on having picked a day. Gating
  // this would report a fully-stocked fridge for a run nothing has been bought for.
  assert.deepEqual(
    plannedDoses(tentative, 'Methenolone Enanthate'),
    plannedDoses(committed, 'Methenolone Enanthate')
  )
  assert.ok(plannedDoses(tentative, 'Methenolone Enanthate').length > 0)
})

test('a tentative cycle neither overrides the standing schedule nor blocks a committed one', () => {
  const standing = [{ compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2026-01-01', to: null }]
  const tentative = run({
    start_precision: 'month',
    start_date: '2026-10-01',
    compounds: [{ compound: 'Testosterone Cypionate', dose: 150, unit: 'mg', weekdays: [1, 4], fromWeek: 1, toWeek: null }]
  })
  // The standing rule survives whole — no window carved out of it, nothing added.
  assert.deepEqual(mergeRules(standing, [tentative]), standing)

  // A committed upcoming cycle outranks a tentative one anchored earlier.
  const committed = run({ id: 2, start_date: '2026-11-15' })
  assert.equal(relevantCycle([tentative, committed], '2026-09-03').id, 2)
  // With only the tentative plan on file, it's still the one worth showing.
  assert.equal(relevantCycle([tentative], '2026-09-03').id, 1)
})
