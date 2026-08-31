// Unit tests for the passive cycle vitals watch — window math, noise thresholds, the weight
// rate escalation, and the good-direction cap. Same zero-framework runner as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeSignals, computeCycleSignals, signalShorthand } from '../shared/utils/cycleSignals.ts'
import { shiftDays } from '../shared/utils/cycles.ts'

// 2026-09-14 is a Monday. Cycle runs 16 weeks unless ended.
function cycle(overrides = {}) {
  return {
    id: 1,
    name: 'Primo Run 1',
    start_date: '2026-09-14',
    planned_weeks: 16,
    actual_end: null,
    compounds: [{ compound: 'Methenolone Enanthate', dose: 200, unit: 'mg', weekdays: [1, 4], fromWeek: 1, toWeek: null }],
    ...overrides
  }
}

/** Daily journal rows from `from` (inclusive) for `days`, weight from a per-day function. */
function weightRows(from, days, valueAt) {
  return Array.from({ length: days }, (_, i) => ({
    date: shiftDays(from, i),
    weight_lbs: valueAt(i)
  }))
}

function weightSignal(c, today, rows) {
  return computeCycleSignals(c, today, rows, []).find(s => s.key === 'weight')
}

test('upcoming cycle reports the forming baseline, no delta', () => {
  const rows = weightRows('2026-08-17', 28, () => 163)
  const s = weightSignal(cycle(), '2026-09-02', rows)
  assert.equal(s.state, 'baseline')
  assert.equal(s.baseline, 163)
  assert.equal(s.current, null)
  assert.equal(s.delta, null)
})

test('steady inside the noise floor, watch at 1x, flagged at 2x adverse', () => {
  const base = weightRows('2026-08-17', 28, () => 163) // baseline window
  const today = '2026-10-12' // day 29 of the cycle
  const onCycle = level => weightRows('2026-09-29', 14, () => level) // full current window

  assert.equal(weightSignal(cycle(), today, [...base, ...onCycle(164)]).state, 'steady') // +1 < 2.5
  const watch = weightSignal(cycle(), today, [...base, ...onCycle(166)]) // +3 >= 1x
  assert.equal(watch.state, 'watch')
  assert.equal(watch.adverse, true) // weight moves are watch-worthy in either direction
  assert.equal(weightSignal(cycle(), today, [...base, ...onCycle(168.5)]).state, 'flagged') // +5.5 >= 2x
})

test('weight rate escalates a small level delta — the water-retention tell', () => {
  const base = weightRows('2026-08-17', 28, () => 163)

  // A ramp only one week old: the week-avg-vs-week-avg rate reads about half the slope
  // (the prior week was still flat), so 0.4 lbs/day one week in = ~1.6 lbs/wk → watch.
  const oneWeek = weightRows('2026-09-29', 14, i => (i < 7 ? 163 : 163 + (i - 6) * 0.4))
  const early = weightSignal(cycle(), '2026-10-12', [...base, ...oneWeek])
  assert.equal(early.ratePerWeek, 1.6)
  assert.equal(early.state, 'watch')

  // Sustained across the full window, the same slope reads true (0.4/day → 2.8 lbs/wk)
  // and flags even though the 14-day level average is barely past one noise threshold.
  const sustained = weightRows('2026-09-29', 14, i => 163 + i * 0.4)
  const s = weightSignal(cycle(), '2026-10-12', [...base, ...sustained])
  assert.equal(s.ratePerWeek, 2.8)
  assert.equal(s.state, 'flagged')
})

test('a strong move in the GOOD direction caps at watch and is not adverse', () => {
  const mk = (date, hrv) => ({ date, hrv })
  const base = Array.from({ length: 28 }, (_, i) => mk(shiftDays('2026-08-17', i), 40))
  const better = Array.from({ length: 14 }, (_, i) => mk(shiftDays('2026-09-29', i), 58)) // +18 = >2x of 7
  const s = computeCycleSignals(cycle(), '2026-10-12', [...base, ...better], []).find(x => x.key === 'hrv')
  assert.equal(s.state, 'watch')
  assert.equal(s.adverse, false)

  const worse = Array.from({ length: 14 }, (_, i) => mk(shiftDays('2026-09-29', i), 22)) // −18
  const bad = computeCycleSignals(cycle(), '2026-10-12', [...base, ...worse], []).find(x => x.key === 'hrv')
  assert.equal(bad.state, 'flagged')
  assert.equal(bad.adverse, true)
})

test('sparse windows produce no-data, never a false flag', () => {
  const rows = [
    { date: '2026-09-01', weight_lbs: 163 }, // 1 baseline point < MIN_POINTS
    ...weightRows('2026-09-29', 14, () => 170)
  ]
  const s = weightSignal(cycle(), '2026-10-12', rows)
  assert.equal(s.state, 'no-data')
  assert.equal(s.current, 170)
  assert.equal(s.delta, null)
})

test('a finished cycle reads its last two weeks, not today', () => {
  const c = cycle({ actual_end: '2026-10-19' })
  const base = weightRows('2026-08-17', 28, () => 163)
  const during = weightRows('2026-10-06', 14, () => 166.5) // last 14 days of the cycle: +3.5 = 1.4x
  const after = weightRows('2026-10-20', 30, () => 180) // post-cycle rebound must NOT count
  const s = weightSignal(c, '2026-11-25', [...base, ...during, ...after])
  assert.equal(s.current, 166.5)
  assert.equal(s.state, 'watch')
})

test('health metrics flow from the second source; recovery drop flags', () => {
  const mk = (date, recovery_score) => ({ date, recovery_score })
  const health = [
    ...Array.from({ length: 28 }, (_, i) => mk(shiftDays('2026-08-17', i), 60)),
    ...Array.from({ length: 14 }, (_, i) => mk(shiftDays('2026-09-29', i), 42)) // −18 = >2x of 8
  ]
  const s = computeCycleSignals(cycle(), '2026-10-12', [], health).find(x => x.key === 'recovery')
  assert.equal(s.state, 'flagged')
  assert.equal(s.adverse, true)
})

test('activeSignals surfaces flagged before watch; shorthand formats signed deltas', () => {
  const base = weightRows('2026-08-17', 28, () => 163)
  const heavy = weightRows('2026-09-29', 14, () => 169) // +6 flagged
  const mkH = (date, hrv, bp) => ({ date, hrv, bp_systolic: bp })
  const vitals = [
    ...Array.from({ length: 28 }, (_, i) => mkH(shiftDays('2026-08-17', i), 40, 120)),
    ...Array.from({ length: 14 }, (_, i) => mkH(shiftDays('2026-09-29', i), 33, 127)) // hrv −7 watch, bp +7 watch
  ]
  const journal = [...base, ...heavy].map((r, i) => ({ ...r, ...vitals[i] }))
  const signals = computeCycleSignals(cycle(), '2026-10-12', journal, [])
  const act = activeSignals(signals)
  assert.equal(act[0].key, 'weight')
  assert.ok(act.length >= 3)
  assert.match(signalShorthand(act[0]), /^Weight \+6 lbs$/)
})

test('spark marks where the cycle starts', () => {
  const rows = [...weightRows('2026-08-17', 28, () => 163), ...weightRows('2026-09-14', 5, () => 164)]
  const s = weightSignal(cycle(), '2026-09-18', rows)
  assert.equal(s.spark.length, 33)
  assert.equal(s.sparkStartIdx, 28)
})
