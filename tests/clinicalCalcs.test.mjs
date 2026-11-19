// Clinical calculators (shared/utils/clinicalCalcs.ts) — audit #43 item 77.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { PSA_HISTORY_SQL, ageOn, clinicalCalcs, egfrCystatin, fib4, fib4Band, fiveAriOn, psaAdjusted, psaVelocity } from '../shared/utils/clinicalCalcs.ts'
import { BEFORE_RECORDS } from '../shared/utils/protocolStore.ts'

// --- audit #44 item 21 -----------------------------------------------------------------------

test('the 5-ARI clock runs from the first day of the unbroken stretch, not from the schedule row in force', () => {
  // Finasteride as the schedule stores it after two edits: three versions, each starting the
  // day after the one before ends.
  const spans = [
    { compound: 'Finasteride', from: '2026-07-29', to: '2026-09-30', label: '1 mg' },
    { compound: 'Finasteride', from: '2026-10-01', to: '2026-11-04', label: '0.5 mg' },
    { compound: 'Finasteride', from: '2026-11-05', to: null, label: '1 mg' },
    { compound: 'Testosterone Cypionate', from: '2026-01-01', to: null }
  ]
  assert.deepEqual(fiveAriOn(spans, '2026-11-17'), { from: '2026-07-29' }, 'not Nov 5, the newest version')
  assert.deepEqual(fiveAriOn(spans, '2026-10-17'), { from: '2026-07-29' }, 'a past day reads the stretch it sat in')
  assert.deepEqual(fiveAriOn(spans, '2026-07-29'), { from: '2026-07-29' })
  assert.equal(fiveAriOn(spans, '2026-07-28'), null, 'before the drug')
  assert.equal(fiveAriOn([], '2026-11-17'), null)
  // A real gap starts a new stretch; the earlier one keeps its own start.
  const gap = [{ compound: 'Finasteride', from: '2025-01-01', to: '2025-06-30' }, { compound: 'Finasteride', from: '2026-07-29', to: null }]
  assert.deepEqual(fiveAriOn(gap, '2026-11-17'), { from: '2026-07-29' })
  assert.deepEqual(fiveAriOn(gap, '2025-03-01'), { from: '2025-01-01' })
  assert.equal(fiveAriOn(gap, '2026-01-01'), null, 'off the drug between them')
  // A switch to dutasteride the next day is the same stretch, as is an overlap.
  const swap = [{ compound: 'Finasteride', from: '2026-07-29', to: '2026-12-31' }, { compound: 'Dutasteride', from: '2027-01-01', to: null }]
  assert.deepEqual(fiveAriOn(swap, '2027-03-01'), { from: '2026-07-29' })
  const overlap = [{ compound: 'Finasteride', from: '2026-07-29', to: null }, { compound: 'finasteride 1 mg', from: '2026-10-01', to: null }]
  assert.deepEqual(fiveAriOn(overlap, '2026-11-17'), { from: '2026-07-29' })
})

test('a 5-ARI with no start date is long-standing: no day count, and never called early', () => {
  const undated = [{ compound: 'Finasteride', from: BEFORE_RECORDS, to: '2026-09-30' }, { compound: 'Finasteride', from: '2026-10-01', to: null }]
  assert.deepEqual(fiveAriOn(undated, '2026-11-17'), { from: null }, 'the stretch runs back to the undated version')
  const draws = [{ date: '2025-09-11', markers: { psa: 0.6 } }, { date: '2026-11-17', markers: { psa: 0.8 } }]
  const rows = Object.fromEntries(clinicalCalcs(draws, draws[1], { birthDate: null, fiveAri: d => fiveAriOn(undated, d) }).map(r => [r.key, r]))
  assert.equal(rows.psa_adjusted.value, '1.6', 'still doubled: on the drug is known')
  assert.equal(rows.psa_adjusted.inputs, '0.8 measured on a long-standing 5-ARI (no start date on the schedule) × 2')
  assert.doesNotMatch(rows.psa_adjusted.inputs, /days into/, 'it printed "20,000 days into a 5-ARI", counted from the placeholder date')
  assert.equal(rows.psa_adjusted.reading, 'under 2.5')
  assert.equal(rows.psa_velocity.value, '+0.34', 'both readings on the drug: (1.6 − 1.2) over 1.18 years')
  assert.equal(rows.psa_velocity.tone, 'ok')
})

test('a reading a year into the drug is settled however recently the dose was edited', () => {
  const spans = [{ compound: 'Finasteride', from: '2025-07-29', to: '2026-11-04' }, { compound: 'Finasteride', from: '2026-11-05', to: null }]
  const draws = [{ date: '2026-03-01', markers: { psa: 0.7 } }, { date: '2026-11-17', markers: { psa: 0.8 } }]
  const rows = Object.fromEntries(clinicalCalcs(draws, draws[1], { birthDate: null, fiveAri: d => fiveAriOn(spans, d) }).map(r => [r.key, r]))
  assert.match(rows.psa_adjusted.inputs, /0\.8 measured 476 days into a 5-ARI × 2/, 'not 12 days into the newest version')
  assert.doesNotMatch(rows.psa_adjusted.reading, /overstates/)
  assert.doesNotMatch(rows.psa_velocity.reading, /early on the 5-ARI/)
  assert.equal(rows.psa_velocity.tone, 'ok')
})

test('PSA_HISTORY_SQL: every earlier draw with a PSA, oldest first, on the real schema', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../server/database/schema.sql', import.meta.url), 'utf8'))
  const insert = db.prepare('INSERT INTO labs_entries (date, fasting, markers, qualitative, sources) VALUES (?, 1, ?, ?, ?)')
  insert.run('2024-09-26', JSON.stringify({ psa: 0.9, hematocrit: 49 }), '[]', '[]')
  insert.run('2025-09-11', JSON.stringify({ psa: 1.1 }), '[]', '[]')
  insert.run('2026-03-01', JSON.stringify({ psa: null, hematocrit: 50 }), '[]', '[]') // printed without a figure
  for (const d of ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']) insert.run(d, JSON.stringify({ hematocrit: 50 }), '[]', '[]')
  insert.run('2026-10-17', JSON.stringify({ psa: 0.8 }), '[]', '[]')
  insert.run('2026-11-17', JSON.stringify({ psa: 0.85 }), '[]', '[]')
  const rows = db.prepare(PSA_HISTORY_SQL).all('2026-10-17').map(r => [r.date, r.psa])
  assert.deepEqual(rows, [['2024-09-26', 0.9], ['2025-09-11', 1.1]], 'older than any seven-draw window; not the target itself, nothing after it')
  assert.deepEqual(db.prepare(PSA_HISTORY_SQL).all('2024-09-26'), [])
})

test('age, the PSA adjustment and velocity', () => {
  assert.equal(ageOn('1984-03-15', '2026-11-11'), 42.7)
  assert.equal(ageOn('bad', '2026-11-11'), null)
  assert.equal(ageOn('2030-01-01', '2026-11-11'), null, 'a birth date after the draw is no age')
  assert.equal(psaAdjusted({ date: 'x', value: 0.8, onFiveAri: true }), 1.6)
  assert.equal(psaAdjusted({ date: 'x', value: 0.8, onFiveAri: false }), 0.8)
  // Sep 2025 off the drug 1.1; Sep 2026 on it 0.8 → adjusted 1.6: +0.5 over a year.
  const v = psaVelocity([
    { date: '2025-09-11', value: 1.1, onFiveAri: false },
    { date: '2026-08-15', value: 0.75, onFiveAri: true }, // too close to the last to be the "from"
    { date: '2026-09-09', value: 0.8, onFiveAri: true }
  ])
  assert.equal(v.from.date, '2025-09-11', 'the nearest reading at least 90 days back')
  assert.equal(v.perYear, 0.5)
  assert.equal(psaVelocity([{ date: '2026-09-09', value: 0.8, onFiveAri: true }]), null)
  assert.equal(psaVelocity([{ date: '2026-08-15', value: 0.7, onFiveAri: true }, { date: '2026-09-09', value: 0.8, onFiveAri: true }]), null, '25 days apart is noise')
})

test('FIB-4 and its bands; eGFR from cystatin C (CKD-EPI 2012)', () => {
  assert.equal(fib4(42.7, 22, 20, 250), 0.84) // (42.7×22)/(250×√20)
  assert.equal(fib4Band(0.84, 42.7), 'low')
  assert.equal(fib4Band(1.5, 42.7), 'indeterminate')
  assert.equal(fib4Band(1.5, 66), 'low', 'the lower cutoff rises to 2.0 from 65')
  assert.equal(fib4Band(3, 42.7), 'high')
  assert.equal(fib4(42.7, 0, 20, 250), null)
  // Scys 0.8 is the hinge: 133 × 0.996^age exactly. Age 40 → 133 × 0.8521 = 113.
  assert.equal(egfrCystatin(0.8, 40), 113)
  assert.equal(egfrCystatin(1.2, 40), 66, 'above the hinge the steep exponent bites')
  assert.equal(egfrCystatin(0.6, 40), 131)
  assert.equal(egfrCystatin(0.8, 40, true), 106, 'the female factor')
  assert.equal(egfrCystatin(0, 40), null)
})

test('the calculator rows as of a draw: computed where the inputs exist, naming the missing one otherwise', () => {
  const draws = [
    { date: '2025-09-11', markers: { psa: 1.1 } },
    { date: '2026-09-09', markers: { psa: 0.8, ast: 22, alt: 20, platelets: 250, cystatin_c: 0.9, egfr: 85 } }
  ]
  // Finasteride since Jul 29: the Sep 9 reading is 42 days in — early, and the velocity pair
  // straddles the start, so neither is read as settled.
  const ctx = { birthDate: '1984-03-15', fiveAri: date => (date >= '2026-07-29' ? { from: '2026-07-29' } : null) }
  const rows = clinicalCalcs(draws, draws[1], ctx)
  const by = Object.fromEntries(rows.map(r => [r.key, r]))
  assert.equal(by.psa_adjusted.value, '1.6')
  assert.match(by.psa_adjusted.inputs, /0\.8 measured 42 days into a 5-ARI × 2/)
  assert.match(by.psa_adjusted.reading, /under 180 days on the drug the halving is incomplete/)
  assert.equal(by.psa_adjusted.tone, 'ok')
  assert.equal(by.psa_velocity.value, '+0.5')
  assert.equal(by.psa_velocity.tone, 'muted', 'straddling the start is never a follow-up trigger')
  assert.match(by.psa_velocity.reading, /straddles the 5-ARI start/)
  assert.match(by.psa_velocity.inputs, /1\.1 \(2025-09-11\) → 1\.6 \(2026-09-09, ×2\)/)
  // A year on: two settled on-treatment readings read plainly.
  const settled = clinicalCalcs(
    [{ date: '2027-03-01', markers: { psa: 0.7 } }, { date: '2027-09-01', markers: { psa: 1.2 } }],
    { date: '2027-09-01', markers: { psa: 1.2 } },
    { birthDate: '1984-03-15', fiveAri: () => ({ from: '2026-07-29' }) }
  )
  const sv = settled.find(r => r.key === 'psa_velocity')
  assert.equal(sv.value, '+1.99', '(2.4 − 1.4) over half a year')
  assert.equal(sv.tone, 'warn')
  assert.doesNotMatch(settled.find(r => r.key === 'psa_adjusted').reading, /overstates/)
  assert.equal(by.fib4.value, '0.84')
  assert.equal(by.fib4.tone, 'ok')
  assert.match(by.egfr_cystatin.inputs, /creatinine eGFR read 85/)
  assert.equal(by.egfr_cystatin.tone, 'ok')
  // No birth date: the age-dependent ones say so; PSA still computes.
  const noDob = Object.fromEntries(clinicalCalcs(draws, draws[1], { ...ctx, birthDate: null }).map(r => [r.key, r]))
  assert.equal(noDob.fib4.value, null)
  assert.match(noDob.fib4.missing, /date of birth/)
  assert.match(noDob.egfr_cystatin.missing, /date of birth/)
  assert.equal(noDob.psa_adjusted.value, '1.6')
  // A draw with only PSA: velocity needs a partner.
  const lone = Object.fromEntries(clinicalCalcs([draws[0]], draws[0], ctx).map(r => [r.key, r]))
  assert.match(lone.psa_velocity.missing, /two PSA readings/)
  assert.equal(lone.fib4, undefined, 'no liver inputs at all → not listed')
  // Platelets missing: FIB-4 names it.
  const partial = clinicalCalcs([{ date: '2026-10-17', markers: { ast: 22, alt: 20 } }], { date: '2026-10-17', markers: { ast: 22, alt: 20 } }, ctx)
  assert.equal(lone.psa_adjusted.inputs, '1.1 measured, no 5-ARI on the schedule that day')
  assert.match(partial.find(r => r.key === 'fib4').missing, /missing platelets/)
})
