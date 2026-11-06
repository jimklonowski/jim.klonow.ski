// Maintenance from the food log and the scale (shared/utils/energyBalance.ts) — audit #43 item 62.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KCAL_PER_LB_DEFAULT, KCAL_PER_LB_LEAN, appleExpenditure, dexaCalibration, energyBalance, fmtStored,
  scanPeriodBalance, trendAsOf
} from '../shared/utils/energyBalance.ts'
import { shiftDays } from '../shared/utils/dates.ts'

const TO = '2026-11-05'
const FROM = '2026-10-09' // 28 days ending TO

/** `n` days of intake ending `to`, `kcal` each, skipping any date in `skip`. */
function days(n, kcal, to = TO, skip = new Set()) {
  return Array.from({ length: n }, (_, i) => shiftDays(to, -i)).filter(d => !skip.has(d)).map(date => ({ date, kcal }))
}
const pt = (date, trend) => ({ date, raw: trend, trend })

// Jim's two scans as the local DB holds them: fat 31.9 → 29.8, lean 120.1 → 134.0.
const SCANS = [
  { date: '2026-06-12', fat_lbs: 31.9, lean_lbs: 120.1 },
  { date: '2026-09-30', fat_lbs: 29.8, lean_lbs: 134 }
]

test('a scan pair prices its pound by tissue: a recomposition stores far less than 3,500 a pound, clamped at lean', () => {
  const c = dexaCalibration(SCANS)
  assert.equal(c.from, '2026-06-12')
  assert.equal(c.to, '2026-09-30')
  assert.equal(c.days, 110)
  assert.equal(c.fatDelta, -2.1)
  assert.equal(c.leanDelta, 13.9)
  assert.equal(c.massDelta, 11.8)
  // −2.1 × 4,264 + 13.9 × 816 = 2,388 kcal stored over 110 days — about 22 a day, not 375.
  assert.equal(c.storedKcal, 2388)
  assert.equal(c.rawKcalPerLb, 202)
  assert.equal(c.kcalPerLb, KCAL_PER_LB_LEAN, 'never priced below lean tissue')
  // A pure fat gain prices at fat.
  assert.equal(dexaCalibration([{ date: '2026-01-01', fat_lbs: 20, lean_lbs: 130 }, { date: '2026-04-01', fat_lbs: 26, lean_lbs: 130 }]).kcalPerLb, 4264)
})

test('calibration needs two usable scans far enough apart, and a mass change big enough to divide by', () => {
  assert.equal(dexaCalibration([]), null)
  assert.equal(dexaCalibration([SCANS[0]]), null)
  assert.equal(dexaCalibration([SCANS[0], { date: '2026-09-30', fat_lbs: null, lean_lbs: 134 }]), null)
  // A scan two weeks after the last pairs with the one before it instead.
  const c = dexaCalibration([...SCANS, { date: '2026-10-14', fat_lbs: 29, lean_lbs: 135 }])
  assert.equal(c.from, '2026-06-12')
  assert.equal(c.to, '2026-10-14')
  // Mass barely moved: the stored energy is real, the per-pound price is not.
  const flat = dexaCalibration([{ date: '2026-01-01', fat_lbs: 30, lean_lbs: 130 }, { date: '2026-04-01', fat_lbs: 28, lean_lbs: 133 }])
  assert.equal(flat.massDelta, 1)
  assert.equal(flat.rawKcalPerLb, null)
  assert.equal(flat.kcalPerLb, null)
})

test('the trend is read as of a date only with a weigh-in close enough before it', () => {
  const points = [pt('2026-10-01', 170), pt('2026-10-05', 170.4)]
  assert.equal(trendAsOf(points, '2026-10-04'), 170)
  assert.equal(trendAsOf(points, '2026-10-12'), 170.4)
  assert.equal(trendAsOf(points, '2026-10-13'), null, 'eight days past the last weigh-in')
  assert.equal(trendAsOf(points, '2026-09-30'), null)
})

test('maintenance = mean intake − the trend change priced per pound ÷ the days', () => {
  const intake = days(28, 3000)
  const points = [pt('2026-10-08', 170), pt(TO, 172)]
  const plain = energyBalance(intake, points, null, TO)
  assert.equal(plain.from, FROM)
  assert.equal(plain.loggedDays, 28)
  assert.equal(plain.intakeKcal, 3000)
  assert.equal(plain.weightDelta, 2)
  assert.equal(plain.kcalPerLb, KCAL_PER_LB_DEFAULT)
  assert.equal(plain.source, 'default')
  assert.equal(plain.storedKcalPerDay, 250)
  assert.equal(plain.maintenanceKcal, 2750)
  assert.equal(plain.status, 'ok')

  const priced = energyBalance(intake, points, dexaCalibration(SCANS), TO)
  assert.equal(priced.source, 'dexa')
  assert.equal(priced.kcalPerLb, 816)
  assert.equal(priced.storedKcalPerDay, 58)
  assert.equal(priced.maintenanceKcal, 2940, 'rounded to 10 kcal')
})

test('a cut is not priced by a bulk\'s recomposition: the scans moved up, the window down → the default, flagged', () => {
  const b = energyBalance(days(28, 2200), [pt('2026-10-08', 172), pt(TO, 170)], dexaCalibration(SCANS), TO)
  assert.equal(b.source, 'default')
  assert.equal(b.directionMismatch, true)
  assert.equal(b.storedKcalPerDay, -250)
  assert.equal(b.maintenanceKcal, 2450)
})

test('below 70 % of days logged there is no figure; missing days are left out, not filled', () => {
  const points = [pt('2026-10-08', 170), pt(TO, 170)]
  const skip9 = new Set(Array.from({ length: 9 }, (_, i) => shiftDays(TO, -2 * i - 1)))
  const few = energyBalance(days(28, 2800, TO, skip9), points, null, TO)
  assert.equal(few.loggedDays, 19)
  assert.equal(few.status, 'few-days')
  assert.equal(few.maintenanceKcal, null)
  assert.equal(few.intakeKcal, 2800, 'the logged days still average')
  const skip8 = new Set([...skip9].slice(0, 8))
  const enough = energyBalance(days(28, 2800, TO, skip8), points, null, TO)
  assert.equal(enough.loggedDays, 20)
  assert.equal(enough.status, 'ok')
  assert.equal(enough.maintenanceKcal, 2800)
})

test('no weigh-in near the window\'s start (or end) → no delta, no figure', () => {
  const b = energyBalance(days(28, 2800), [pt('2026-09-20', 170), pt(TO, 171)], null, TO)
  assert.equal(b.weightDelta, null)
  assert.equal(b.status, 'no-weight')
  assert.equal(b.maintenanceKcal, null)
})

test('the scan period itself: intake over its days against the scans\' own stored energy', () => {
  const c = dexaCalibration(SCANS)
  const intake = days(110, 2900, '2026-09-30')
  const p = scanPeriodBalance(intake, c)
  assert.equal(p.loggedDays, 110)
  assert.equal(p.intakeKcal, 2900)
  assert.equal(p.storedKcalPerDay, 22)
  assert.equal(p.maintenanceKcal, 2880)
  // Half-logged: the figure is withheld.
  const half = scanPeriodBalance(intake.filter((_, i) => i % 2), c)
  assert.equal(half.maintenanceKcal, null)
})

test('Apple\'s figure counts only days carrying both active and resting energy', () => {
  const rows = [
    { date: '2026-10-10', active_kcal: 900, basal_kcal: 1900 },
    { date: '2026-10-11', active_kcal: 700, basal_kcal: 1900 },
    { date: '2026-10-12', active_kcal: 50, basal_kcal: null }, // watch off most of the day
    { date: '2026-09-01', active_kcal: 2000, basal_kcal: 2000 } // outside
  ]
  assert.deepEqual(appleExpenditure(rows, FROM, TO), { kcal: 2700, days: 2 })
  assert.equal(appleExpenditure([], FROM, TO), null)
})

test('stored energy reads one way everywhere', () => {
  assert.equal(fmtStored(35), '+35 kcal/day stored')
  assert.equal(fmtStored(-210), '−210 kcal/day from stores')
  assert.equal(fmtStored(0), '0 kcal/day stored')
})
