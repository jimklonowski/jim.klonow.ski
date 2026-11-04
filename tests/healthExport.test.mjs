// The Health Auto Export payload parser (shared/utils/healthExport.ts) — audit #43 item 56: the
// metrics the webhook used to drop, with their units, and the sum-vs-last rule per metric.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHealthExport } from '../shared/utils/healthExport.ts'

const metric = (name, units, ...data) => ({ name, units, data })
const on = (date, qty, extra = {}) => ({ date: `${date} 08:00:00 -0500`, qty, ...extra })

test('the metrics that used to be dropped land on the day, converted', () => {
  const { healthByDate } = parseHealthExport([
    metric('step_count', 'count', on('2026-10-21', 8421)),
    metric('active_energy', 'kcal', on('2026-10-21', 612.4)),
    metric('basal_energy_burned', 'kJ', on('2026-10-21', 7531.2)), // 1800 kcal
    metric('respiratory_rate', 'count/min', on('2026-10-21', 14.83)),
    metric('blood_oxygen_saturation', '%', on('2026-10-21', 0.97)),
    metric('waist_circumference', 'cm', on('2026-10-21', 86.36)), // 34.0 in
    metric('dietary_water', 'mL', on('2026-10-21', 1182.9)), // 40.0 oz
    metric('sleep_analysis', 'hr', on('2026-10-21', null, { rem: 1.5, deep: 1, core: 4.5, awake: 0.25, sleepStart: '2026-10-20 23:12:00 -0500', sleepEnd: '2026-10-21 06:27:00 -0500' }))
  ])
  assert.deepEqual(healthByDate['2026-10-21'], {
    steps: 8421,
    active_kcal: 612.4,
    basal_kcal: 1800,
    resp_rate: 14.8,
    spo2_pct: 97,
    waist_in: 34,
    dietary_water_oz: 40,
    sleep_rem_min: 90,
    sleep_deep_min: 60,
    sleep_core_min: 270,
    sleep_awake_min: 15,
    sleep_total_min: 420,
    sleep_start: '2026-10-20 23:12:00 -0500',
    sleep_end: '2026-10-21 06:27:00 -0500'
  })
})

test('counts and energies sum over an hourly export; readings keep the day\'s last', () => {
  const { healthByDate } = parseHealthExport([
    metric('step_count', 'count', on('2026-10-21', 1000), on('2026-10-21', 2500), on('2026-10-22', 300)),
    metric('active_energy', 'kcal', on('2026-10-21', 100.26), on('2026-10-21', 200.11)),
    metric('dietary_water', 'fl_oz', on('2026-10-21', 12), on('2026-10-21', 8)),
    metric('oxygen_saturation', '%', on('2026-10-21', 95), on('2026-10-21', 98)),
    metric('waist_circumference', 'in', on('2026-10-21', 34.5), on('2026-10-21', 34.2))
  ])
  assert.deepEqual(healthByDate['2026-10-21'], { steps: 3500, active_kcal: 300.4, dietary_water_oz: 20, spo2_pct: 98, waist_in: 34.2 })
  assert.deepEqual(healthByDate['2026-10-22'], { steps: 300 })
})

test('the vitals still go to the journal row; a point with no date, an unknown metric and a null reading write nothing', () => {
  const { byDate, healthByDate } = parseHealthExport([
    metric('body_mass', 'kg', on('2026-10-21', 82.3)), // 181.4 lbs
    metric('resting_heart_rate', 'count/min', on('2026-10-21', 54.6)),
    metric('blood_pressure', 'mmHg', { date: '2026-10-21 07:00:00 -0500', systolic: 121.4, diastolic: 77.6 }),
    metric('something_new', 'x', on('2026-10-23', 1)),
    metric('step_count', 'count', { qty: 500 }, on('2026-10-24', null)),
    metric('sleep_analysis', 'hr', on('2026-10-24', null, { asleep: 0 }))
  ])
  assert.deepEqual(byDate['2026-10-21'], { weight_lbs: 181.4, rhr: 55, bp_systolic: 121, bp_diastolic: 78 })
  assert.deepEqual(healthByDate['2026-10-21'], {})
  assert.deepEqual(healthByDate['2026-10-23'], {}, 'an unknown metric makes an empty bucket the webhook skips')
  assert.deepEqual(healthByDate['2026-10-24'], {}, 'a null reading and a stageless night write nothing')
  assert.equal('undefined' in byDate, false)
})
