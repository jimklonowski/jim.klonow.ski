// Unit tests for the digest trend engine (shared/utils/trends.ts): protocol change-point
// detection from the dose log, and the before/after metric comparison the AI recaps narrate.
// The histories below are synthetic and built to trip exactly one rule each.
//
//   node --test tests/
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTrends, detectProtocolChanges, formatTrendLines } from '../shared/utils/trends.ts'
import { eachDay, shiftDays, weekdayOf } from '../shared/utils/dates.ts'

const END = '2026-09-20' // a Sunday

/** One journal row per day in [from, to]; `fill(date)` returns that day's fields. */
function days(from, to, fill) {
  return eachDay(from, to).map(date => ({
    date, weight_lbs: null, rhr: null, hrv: null, bp_systolic: null, peptides: [], ...fill(date)
  }))
}

/** Merge several day-lists into one row per date (peptides concatenated, vitals overlaid). */
function merge(...lists) {
  const byDate = new Map()
  for (const row of lists.flat()) {
    const prev = byDate.get(row.date)
    if (!prev) byDate.set(row.date, { ...row, peptides: [...row.peptides] })
    else {
      for (const [k, v] of Object.entries(row)) if (k !== 'peptides' && k !== 'date' && v != null) prev[k] = v
      prev.peptides.push(...row.peptides)
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const dose = (compound, amount = 75, unit = 'mg') => ({ compound, dose: amount, unit, time: '', site: '' })
/** Doses on the given weekdays (0 = Sun) across [from, to]. */
const dosing = (compound, from, to, weekdays, amount, unit) =>
  days(from, to, d => ({ peptides: weekdays.includes(weekdayOf(d)) ? [dose(compound, amount, unit)] : [] }))
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const vitals = (from, to, fields) => days(from, to, d => (typeof fields === 'function' ? fields(d) : fields))

// --- change detection ---

test('a compound with three or more dose-days registers a start; a one-off does not', () => {
  const journal = merge(
    days('2026-09-01', '2026-09-02', () => ({ peptides: [dose('PT-141', 1)] })),
    days('2026-09-05', '2026-09-07', () => ({ peptides: [dose('Semax', 0.5)] }))
  )
  const changes = detectProtocolChanges(journal, END)
  assert.deepEqual(changes.filter(c => c.kind === 'start'), [{ date: '2026-09-05', compounds: ['Semax'], kind: 'start' }])
  // PT-141 leaves no trace at all, not even a stop.
  assert.ok(changes.every(c => !c.compounds.includes('PT-141')))
})

test('a pause of four weeks or more reads as a resume', () => {
  const journal = merge(
    dosing('Testosterone Cypionate', '2026-06-01', '2026-06-30', [1, 4]),
    dosing('Testosterone Cypionate', '2026-08-03', '2026-09-17', [1, 4])
  )
  const changes = detectProtocolChanges(journal, END)
  // The June start is past the 90-day lookback; the August return is the event.
  assert.deepEqual(changes, [{ date: '2026-08-03', compounds: ['Testosterone Cypionate (resumed)'], kind: 'start' }])
})

test('ten dose-free days after regular dosing is a stop, dated the day after the last dose', () => {
  const journal = dosing('KPV', '2026-07-15', '2026-09-01', EVERY_DAY, 0.5)
  const changes = detectProtocolChanges(journal, END)
  assert.deepEqual(changes.map(c => [c.date, c.kind]), [['2026-07-15', 'start'], ['2026-09-02', 'stop']])
})

test('a sustained dose change is one adjust event at the day it happened', () => {
  const journal = merge(
    dosing('HGH', '2026-07-01', '2026-08-19', EVERY_DAY, 2, 'iu'),
    dosing('HGH', '2026-08-20', END, EVERY_DAY, 4, 'iu')
  )
  const adjust = detectProtocolChanges(journal, END).filter(c => c.kind === 'adjust')
  assert.equal(adjust.length, 1, 'the sliding window trips several days; they collapse to one')
  assert.equal(adjust[0].date, '2026-08-20')
  assert.deepEqual(adjust[0].compounds, ['HGH (~2 iu 7x/wk → ~4 iu 7x/wk)'])
})

test('starts within two weeks cluster; a stop the same week stays its own entry', () => {
  const journal = merge(
    dosing('hCG', '2026-08-02', END, [0, 2, 5], 250, 'iu'),
    dosing('Testosterone Cypionate', '2026-08-06', END, [1, 4]),
    dosing('KPV', '2026-07-01', '2026-08-04', EVERY_DAY, 0.5)
  )
  const changes = detectProtocolChanges(journal, END)
  const starts = changes.filter(c => c.kind === 'start' && c.date >= '2026-08-01')
  assert.deepEqual(starts, [{ date: '2026-08-02', compounds: ['hCG', 'Testosterone Cypionate'], kind: 'start' }])
  assert.ok(changes.some(c => c.kind === 'stop' && c.date === '2026-08-05' && c.compounds[0] === 'KPV'))
})

// --- metric findings ---

// Resting HR at 60 for six weeks, then 68 from the day testosterone starts.
const TC_START = '2026-08-10' // a Monday, 41 days before END
const rhrStep = (start, before, after) => vitals(shiftDays(start, -42), END, d => ({ rhr: d < start ? before : after }))

test('a move that clears the noise floor is anchored to the change that preceded it', () => {
  const journal = merge(dosing('Testosterone Cypionate', TC_START, END, [1, 4]), rhrStep(TC_START, 60, 68))
  const { findings } = computeTrends(journal, [], END)
  assert.equal(findings.length, 1)
  const f = findings[0]
  assert.equal(f.key, 'rhr')
  assert.equal(f.baselineAvg, 60)
  assert.equal(f.recentAvg, 68)
  assert.equal(f.delta, 8)
  assert.equal(f.significance, 2, 'delta / the 4 bpm floor')
  assert.deepEqual(f.since, { date: TC_START, compounds: ['Testosterone Cypionate'], kind: 'start' })
  assert.equal(f.reversal, false)
})

test('a move under the noise floor is not a finding', () => {
  const journal = merge(dosing('Testosterone Cypionate', TC_START, END, [1, 4]), rhrStep(TC_START, 60, 63))
  assert.deepEqual(computeTrends(journal, [], END).findings, [])
})

test('with no change to explain it, a sustained shift reports as plain drift', () => {
  const journal = vitals('2026-07-01', END, d => ({ weight_lbs: d < '2026-09-07' ? 200 : 204 }))
  const { changes, findings } = computeTrends(journal, [], END)
  assert.deepEqual(changes, [])
  assert.equal(findings.length, 1)
  assert.equal(findings[0].key, 'weight_lbs')
  assert.equal(findings[0].delta, 4)
  assert.equal(findings[0].since, undefined)
})

test('health_metrics rows feed recovery and sleep', () => {
  const health = eachDay('2026-07-01', END).map(date => ({
    date, recovery_score: date < '2026-09-07' ? 70 : 55, sleep_total_min: 420
  }))
  const { findings } = computeTrends([], health, END)
  assert.deepEqual(findings.map(f => [f.key, f.delta]), [['recovery_score', -15]])
})

// --- the ancillary age-out (and the standing exemption) ---

// Daily dosing until Jul 31 (stop dated Aug 1), with RHR stepping 60 → 66 at the stop.
const stopHistory = compound => merge(
  dosing(compound, '2026-06-01', '2026-07-31', EVERY_DAY, 1),
  vitals('2026-06-01', END, d => ({ rhr: d < '2026-08-01' ? 60 : 66 }))
)

test('an ancillary stop anchors trends while it is recent', () => {
  const { findings } = computeTrends(stopHistory('KPV'), [], '2026-08-31')
  assert.equal(findings[0]?.since?.kind, 'stop')
  assert.deepEqual(findings[0].since.compounds, ['KPV'])
})

test('past six weeks an ancillary stop stops anchoring and leaves the digest sheet', () => {
  const trends = computeTrends(stopHistory('KPV'), [], END) // 50 days after the stop
  // Still in `changes`: the lab summary's four-month window wants it.
  assert.ok(trends.changes.some(c => c.kind === 'stop' && c.compounds.includes('KPV')))
  assert.ok(trends.findings.every(f => !f.since), 'no finding anchored to the old stop')
  assert.ok(formatTrendLines(trends, END).every(l => !l.includes('KPV')))
})

test('a compound whose rule has ended is ancillary too (the GHK-Cu regression)', () => {
  // GHK-Cu is in PROTOCOL_RULES but its rule ended 2026-09-01. Before the fix it counted as
  // standing forever, so its stop kept anchoring trends for months.
  const trends = computeTrends(stopHistory('GHK-Cu'), [], END)
  assert.ok(trends.findings.every(f => !f.since))
  assert.ok(formatTrendLines(trends, END).every(l => !l.includes('GHK-Cu')))
})

test('a standing compound still anchors past six weeks', () => {
  const start = '2026-07-27' // a Monday, 55 days before END; testosterone's rule is active on END
  const journal = merge(dosing('Testosterone Cypionate', start, END, [1, 4]), rhrStep(start, 60, 68))
  const { findings } = computeTrends(journal, [], END)
  assert.equal(findings[0]?.since?.date, start)
})

// --- rendering ---

test('formatTrendLines states each change with its age and each finding with its anchor', () => {
  const journal = merge(dosing('Testosterone Cypionate', TC_START, END, [1, 4]), rhrStep(TC_START, 60, 68))
  const lines = formatTrendLines(computeTrends(journal, [], END), END)
  assert.deepEqual(lines, [
    'Protocol changes: Testosterone Cypionate began Aug 10 (41 days ago)',
    'Resting HR: avg 68 bpm over the last 2 weeks, vs 60 in the month before Testosterone Cypionate began (Aug 10) — +8 bpm'
  ])
})
