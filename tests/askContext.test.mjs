// server/utils/askContext.ts — the standing fact sheet behind /ask, untested until audit #44
// item 56. Breadth is its job: every draw, every scan, the whole dose history in aggregate, and
// day-by-day detail only for the recent window. So the tests are about what is IN it, for how far
// back, and that nothing is counted twice.
//
// The real schema in node:sqlite, over the made-up fortnight in tests/_fixtures/fortnight.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { d1Of, freshDb, insert } from './_fixtures/d1.mjs'
import { installAutoImports } from './_fixtures/nitro.mjs'
import { PROTOCOL, TODAY, seedFortnight } from './_fixtures/fortnight.mjs'
import { shiftDays } from '../shared/utils/dates.ts'

await installAutoImports()
const { buildAskContext } = await import('../server/utils/askContext.ts')

const seeded = () => {
  const db = freshDb()
  seedFortnight(db)
  return { db, d1: d1Of(db) }
}
/** The sheet's blank-line-separated sections, and the one that starts with `heading`. */
const sectionsOf = sheet => sheet.split('\n\n')
const section = (sheet, heading) => {
  const hits = sectionsOf(sheet).filter(s => s.startsWith(heading))
  assert.equal(hits.length, 1, `one "${heading}" section, found ${hits.length}`)
  return hits[0].split('\n')
}

test('the sheet opens with the date and holds every block, in a fixed order', async () => {
  const sheet = await buildAskContext(seeded().d1, TODAY, PROTOCOL)
  const order = ['Today is 2026-11-16.', 'Weight now:', 'Personal facts on file:', 'Lab draws', 'DEXA scans:', 'Compound history', 'Reconstitutions', 'Vial inventory', 'Meal figures:', 'Weekly aggregates, last 20 weeks:', 'Daily detail, last 35 days:', 'Recent workouts']
  const at = order.map(heading => sectionsOf(sheet).findIndex(s => s.startsWith(heading)))
  assert.ok(at.every(i => i >= 0), `missing: ${order.filter((_, i) => at[i] < 0).join(', ')}`)
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'the model is told where things are; they stay there')
  assert.equal(sectionsOf(sheet).some(s => !s.trim()), false, 'an empty block leaves no gap')
  assert.match(section(sheet, 'Weight now:')[0], /^Weight now: trend [\d.]+ lbs, .+ — the trend is the gap-aware EMA/)
  assert.equal(section(sheet, 'Personal facts on file:')[0], 'Personal facts on file: Water goal 100; Protein target 150; Blood type A+.')
})

test('every draw and every scan is there with its raw values', async () => {
  const { db, d1 } = seeded()
  insert(db, 'labs_entries', { date: '2024-03-02', fasting: 0, markers: { ferritin: 38 }, readings: { ferritin: { text: '<40' } } })
  const sheet = await buildAskContext(d1, TODAY, PROTOCOL)
  const labs = section(sheet, 'Lab draws')
  assert.match(labs[0], /every draw on file/)
  assert.equal(labs.find(l => l.startsWith('2026-11-12')), '2026-11-12 (fasting): hematocrit 49.5, estradiol 31')
  assert.ok(labs.some(l => l.startsWith('2024-03-02')), 'a draw from years back is still a draw on file')
  assert.ok(labs.findIndex(l => l.startsWith('2024-03-02')) < labs.findIndex(l => l.startsWith('2026-11-12')), 'oldest first')
  assert.deepEqual(section(sheet, 'DEXA scans:'), ['DEXA scans:', '2026-09-20: weight 188.2 lbs, fat_pct 17.6, lean_lbs 150.1, VAT mass_lbs 0.9, A/G ratio 0.98'])
})

test('the dose log in aggregate, the vials mixed, and the inventory as it stands', async () => {
  const sheet = await buildAskContext(seeded().d1, TODAY, PROTOCOL)
  assert.deepEqual(section(sheet, 'Compound history').slice(1), [
    // Most recently used first; the average is per day it was taken.
    'Testosterone Cypionate: 2026-11-05 → 2026-11-15, 4 days, avg 70mg/day used',
    'hCG: 2026-11-10 → 2026-11-10, 1 days, avg 250IU/day used'
  ])
  // 5000 IU in 5 mL: the concentration is worked out here, not left to the model.
  assert.deepEqual(section(sheet, 'Reconstitutions').slice(1), ['2026-11-10: hCG — 5000IU vial, 5 mL BAC water, 1000IU/mL, from Empower'])
  assert.deepEqual(section(sheet, 'Vial inventory').slice(1), [
    'hCG 5000IU: active, opened 2026-11-10, 5 mL BAC water, from Empower',
    'Testosterone Cypionate 200mg: sealed, ×2'
  ], 'the open vial first')
})

test('a week is its averages, with the ride counted once and water over the days that logged it', async () => {
  const sheet = await buildAskContext(seeded().d1, TODAY, PROTOCOL)
  const weeks = section(sheet, 'Weekly aggregates').slice(1)
  assert.deepEqual(weeks.map(l => l.slice(0, 23)), ['2026-10-27 → 2026-11-02', '2026-11-03 → 2026-11-09', '2026-11-10 → 2026-11-16'], 'seven-day windows ending today; weeks with nothing in them are left out')
  const last = weeks[2]
  for (const part of ['weight 186.9', 'rhr 55.3', 'hrv 53.7', 'bp 122/76', 'recovery 62.3%', 'sleep 420min', '2 workouts', '(~44 oz)', 'other drinks: Gatorade Zero 20oz bottle', 'caffeine 150 mg', 'water ~80 oz/day (2 days logged)', 'food ≈ 1200 kcal/day, 60 g protein/day (1 day with figures)']) {
    assert.ok(last.includes(part), `the last week has "${part}": ${last}`)
  }
  // The week of Nov 3–9 has one cuff reading and one soda; the one before, three figures and no more.
  assert.ok(weeks[1].includes('bp 126/80') && weeks[1].includes('(~12 oz)') && weeks[1].includes('water ~60 oz/day (1 day logged)'))
  assert.equal(weeks[0], '2026-10-27 → 2026-11-02: weight 188.4, rhr 59, hrv 49, 0 workouts, 0 sodas')
})

test('a recent day is its vitals, doses, drinks, meals and note on one line', async () => {
  const sheet = await buildAskContext(seeded().d1, TODAY, PROTOCOL)
  const days = section(sheet, 'Daily detail').slice(1)
  assert.deepEqual(days.map(l => l.slice(0, 10)), ['2026-11-02', '2026-11-05', '2026-11-08', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-15'])
  const thursday = days[5]
  for (const part of ['187lbs', 'bp 122/76', 'rhr 55', 'hrv 54', 'recovery 62%', 'sleep 420min', 'doses: Testosterone Cypionate 70mg', '(~24 oz)', 'other drinks: Gatorade Zero 20oz bottle', 'caffeine 82 mg', 'water 60 oz',
    'meals: breakfast zzq oats; lunch zzq sandwich; dinner zzq mystery stew (≈ 1200 kcal, 50 g protein, floor: 1 without figures)', 'note: "Legs felt heavy. / Slept late."']) {
    assert.ok(thursday.includes(part), `Thursday has "${part}": ${thursday}`)
  }
  // A tap-only day has no vitals to print, and says there were no doses rather than nothing.
  assert.equal(days[4], '2026-11-11: recovery 55%, sleep 419min, no doses, 1 soda (~20 oz), caffeine 68 mg')
  // Every meal figured: a total, and no "floor".
  assert.ok(days[6].endsWith('meals: breakfast zzq oats; lunch zzq oats; dinner zzq mystery stew (≈ 1200 kcal, 60 g protein)'))
  assert.deepEqual(section(sheet, 'Recent workouts').slice(1), [
    '2026-11-05: Running 30min 300kcal strain 8.1',
    '2026-11-10: Strength Training 60min 350kcal strain 7.2',
    '2026-11-12: Cycling 46min 410kcal avgHR 141 strain 9.8' // Apple's record and Whoop's, merged: one line
  ])
})

test('old days leave the day-by-day and then the weekly window, but never the all-time blocks', async () => {
  const { db, d1 } = seeded()
  const lastMonth = shiftDays(TODAY, -36) // one day outside the 35-day window
  const lastYear = shiftDays(TODAY, -200) // outside the 20 weeks too
  const dose = { compound: 'Retatrutide', dose: 2, unit: 'mg' }
  insert(db, 'journal_entries', { date: lastMonth, weight_lbs: 190, peptides: [dose], notes: `${'n'.repeat(250)}` })
  insert(db, 'journal_entries', { date: lastYear, weight_lbs: 195, peptides: [dose], reconstitutions: [{ compound: 'Retatrutide', vial_amount: 10, vial_unit: 'mg', bac_water_ml: 2 }] })
  insert(db, 'journal_entries', { date: shiftDays(TODAY, -35), notes: `${'n'.repeat(250)}` })
  insert(db, 'workouts', { external_id: 'whoop:old', date: lastMonth, workout_type: 'Rowing', duration_min: 20 })
  const sheet = await buildAskContext(d1, TODAY, PROTOCOL)

  const days = section(sheet, 'Daily detail').slice(1)
  assert.equal(days.some(l => l.startsWith(lastMonth)), false)
  assert.ok(days[0].startsWith(shiftDays(TODAY, -35)), 'thirty-five days back is the first day in')
  assert.equal(/note: "(n+)"/.exec(days[0])[1].length, 200, 'a long note is cut at 200 characters')
  assert.equal(section(sheet, 'Recent workouts').some(l => l.includes('Rowing')), false)

  const weeks = section(sheet, 'Weekly aggregates').slice(1)
  assert.ok(weeks.some(l => l.includes('weight 190')), 'last month is in its week')
  assert.equal(weeks.some(l => l.includes('weight 195')), false, 'two hundred days back is not')
  assert.ok(weeks.length <= 20)

  // All-time: the first dose and the vial mixed two hundred days ago are still answerable.
  assert.ok(section(sheet, 'Compound history').includes(`Retatrutide: ${lastYear} → ${lastMonth}, 2 days, avg 2mg/day used`))
  assert.ok(section(sheet, 'Reconstitutions').includes(`${lastYear}: Retatrutide — 10mg vial, 2 mL BAC water, 5mg/mL`))
})

test('an empty database is a sheet that says "none", block by block', async () => {
  const sheet = await buildAskContext(d1Of(freshDb()), TODAY, { rules: [], standing: [], asNeeded: [] })
  assert.ok(sheet.startsWith('Today is 2026-11-16.'))
  assert.deepEqual(section(sheet, 'DEXA scans:'), ['DEXA scans:', 'none'])
  assert.equal(section(sheet, 'Lab draws').at(-1), 'none')
  assert.equal(section(sheet, 'Compound history').at(-1), 'none')
  assert.equal(section(sheet, 'Reconstitutions').at(-1), 'none logged')
  assert.equal(section(sheet, 'Weekly aggregates').at(-1), 'none')
  assert.equal(section(sheet, 'Daily detail').at(-1), 'none')
  assert.equal(section(sheet, 'Recent workouts').at(-1), 'none')
  for (const absent of ['Weight now:', 'Personal facts on file:', 'Vial inventory', 'Sustained trends']) {
    assert.equal(sectionsOf(sheet).some(s => s.startsWith(absent)), false, `no "${absent}" block when there is nothing to put in it`)
  }
})

test('the number of reads does not grow with the record: no query per day, draw or dose', async () => {
  const small = seeded()
  await buildAskContext(small.d1, TODAY, PROTOCOL)
  const reads = (d1, table) => d1.ran.filter(sql => new RegExp(`FROM ${table}\\b`).test(sql)).length
  assert.equal(reads(small.d1, 'cycles'), 1, 'the planned cycles are read once and shared (item 51)')
  assert.ok(small.d1.ran.length <= 25, `${small.d1.ran.length} statements for the whole sheet`)

  // A year more of days, a dozen more draws, a workout a day.
  const big = seeded()
  for (let n = 40; n < 400; n++) {
    const date = shiftDays(TODAY, -n)
    insert(big.db, 'journal_entries', { date, weight_lbs: 190, peptides: [{ compound: 'hCG', dose: 250, unit: 'IU' }] })
    insert(big.db, 'health_metrics', { date, recovery_score: 60 })
    insert(big.db, 'workouts', { external_id: `whoop:big${n}`, date, workout_type: 'Walking', duration_min: 30 })
    if (n % 30 === 0) insert(big.db, 'labs_entries', { date, markers: { hematocrit: 48 }, readings: {} })
  }
  await buildAskContext(big.d1, TODAY, PROTOCOL)
  assert.equal(big.d1.ran.length, small.d1.ran.length, 'the same statements, however much is on file')
})
