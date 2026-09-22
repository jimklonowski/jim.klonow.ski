// Unit tests for the exposure model (shared/utils/pk.ts): the unit handling and untimed-dose
// rule added 2026-09-22, plus the Bateman properties everything downstream relies on — the
// compound charts, the cycle dossier overlay, and the AI lab summary's draw-timing lines.
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PK_MODELS, drawTiming, exposureAt, peakHours, pkDoseAmount, pkDosesFor
} from '../shared/utils/pk.ts'

const TC = PK_MODELS['Testosterone Cypionate']
const HCG = PK_MODELS['hCG']
const hoursOf = (date, time = '08:00') => Date.parse(`${date}T${time}:00`) / 3_600_000
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b))

test('every model declares the unit its doses are summed in', () => {
  for (const [name, model] of Object.entries(PK_MODELS)) {
    assert.ok(model.unit === 'mg' || model.unit === 'iu', `${name} has a unit`)
  }
  assert.equal(HCG.unit, 'iu')
})

test('pkDoseAmount converts what it can and refuses what it cannot', () => {
  assert.equal(pkDoseAmount(75, 'mg', TC), 75)
  assert.equal(pkDoseAmount(75000, 'mcg', TC), 75, 'mcg → mg is exact')
  assert.equal(pkDoseAmount(75, 'MG', TC), 75, 'case-insensitive')
  assert.equal(pkDoseAmount(75, undefined, TC), 75, 'a missing unit is the model unit — legacy rows')
  assert.equal(pkDoseAmount(75, '', TC), 75)
  // IU and mass don't convert without a compound-specific factor, and for hCG there isn't a
  // fixed one — so these are dropped, never guessed.
  assert.equal(pkDoseAmount(250, 'iu', TC), null)
  assert.equal(pkDoseAmount(10, 'mg', HCG), null)
  assert.equal(pkDoseAmount(Number.NaN, 'mg', TC), null)
  assert.equal(pkDoseAmount(null, 'mg', TC), null, 'a row with no dose recorded')
  assert.equal(pkDoseAmount(undefined, 'mg', TC), null)
})

test('pkDosesFor keeps one compound, in the model unit, and drops the unusable', () => {
  const entries = [
    { date: '2026-09-01', peptides: [{ compound: 'Testosterone Cypionate', dose: 75, unit: 'mg', time: '09:00' }, { compound: 'HGH', dose: 2.5, unit: 'iu' }] },
    { date: '2026-09-04', peptides: [{ compound: 'Testosterone Cypionate', dose: 75000, unit: 'mcg' }] },
    { date: '2026-09-08', peptides: [{ compound: 'Testosterone Cypionate', dose: 75, unit: 'iu' }] },
    { date: '2026-09-11', peptides: [{ compound: 'Testosterone Cypionate', dose: 0, unit: 'mg' }] },
    { date: '2026-09-12' },
    { date: '2026-09-13', peptides: null }
  ]
  assert.deepEqual(pkDosesFor(entries, 'Testosterone Cypionate', TC), [
    { date: '2026-09-01', time: '09:00', amount: 75 },
    { date: '2026-09-04', time: undefined, amount: 75 }
  ])
  // Before the fix the mcg row was summed at face value — a thousandfold spike on the chart.
})

test('a single dose peaks at its own amount, at peakHours', () => {
  const dose = [{ date: '2026-09-01', time: '08:00', amount: 75 }]
  const peakAt = hoursOf('2026-09-01') + peakHours(TC)
  assert.ok(close(exposureAt(dose, TC, peakAt), 75, 1e-6))
  assert.equal(exposureAt(dose, TC, hoursOf('2026-09-01') - 1), 0, 'nothing before the dose')
  // Falling after the peak.
  assert.ok(exposureAt(dose, TC, peakAt + 48) < exposureAt(dose, TC, peakAt))
})

test('superposition is linear and additive', () => {
  const a = [{ date: '2026-09-01', time: '08:00', amount: 50 }]
  const b = [{ date: '2026-09-04', time: '20:00', amount: 30 }]
  const at = hoursOf('2026-09-06', '12:00')
  const doubled = [{ ...a[0], amount: 100 }]
  assert.ok(close(exposureAt(doubled, TC, at), 2 * exposureAt(a, TC, at)), 'scaling a dose scales its curve')
  assert.ok(close(exposureAt([...a, ...b], TC, at), exposureAt(a, TC, at) + exposureAt(b, TC, at)), 'doses add')
  // Order of the log must not matter.
  assert.ok(close(exposureAt([...b, ...a], TC, at), exposureAt([...a, ...b], TC, at)))
})

test('an untimed dose on the draw date is treated as after the draw', () => {
  // Mon + Thu, with the Monday shot logged without a time on draw day.
  const doses = [
    { date: '2026-09-10', time: '08:00', amount: 75 },
    { date: '2026-09-14', amount: 75 }
  ]
  const t = drawTiming(doses, TC, '2026-09-14')
  assert.ok(t)
  // Before the fix: lastDoseDate 2026-09-14, 0 days, 'rising', 0% — "drawn at the very bottom".
  assert.equal(t.lastDoseDate, '2026-09-10')
  assert.equal(t.daysSinceLastDose, 4)
  assert.ok(t.pctOfRecentPeak > 0)
})

test('a dose timed before the morning draw still counts', () => {
  const doses = [
    { date: '2026-09-10', time: '08:00', amount: 75 },
    { date: '2026-09-14', time: '06:30', amount: 75 }
  ]
  const t = drawTiming(doses, TC, '2026-09-14')
  assert.equal(t.lastDoseDate, '2026-09-14')
  assert.equal(t.phase, 'rising')
})

test('drawTiming is null with nothing recent enough to matter', () => {
  assert.equal(drawTiming([], TC, '2026-09-14'), null)
  assert.equal(drawTiming([{ date: '2025-01-01', time: '08:00', amount: 75 }], TC, '2026-09-14'), null)
  // …and only a later dose exists.
  assert.equal(drawTiming([{ date: '2026-09-20', time: '08:00', amount: 75 }], TC, '2026-09-14'), null)
})
