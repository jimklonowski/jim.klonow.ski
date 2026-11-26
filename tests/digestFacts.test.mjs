// server/utils/digestFacts.ts — the fact sheet every digest is written from, untested until
// audit #44 item 56. "Every number the model cites is computed here, not by it", so a wrong
// number here is a wrong sentence in the recap, stated with confidence.
//
// Run against the real schema in node:sqlite, so the SELECTs are checked against the columns that
// exist, over a made-up fortnight (tests/_fixtures/fortnight.mjs) small enough that each figure
// below was worked out by hand from its rows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { d1Of, freshDb, insert } from './_fixtures/d1.mjs'
import { installAutoImports } from './_fixtures/nitro.mjs'
import { DAY, PROTOCOL, RULES, TODAY, WEEK, seedFortnight } from './_fixtures/fortnight.mjs'

await installAutoImports()
const { dailyDigestFacts, digestTrends, weeklyDigestFacts } = await import('../server/utils/digestFacts.ts')
const { buildAskContext } = await import('../server/utils/askContext.ts')

const seeded = () => {
  const db = freshDb()
  seedFortnight(db)
  return { db, d1: d1Of(db) }
}
/** The one line that starts with `prefix` (fails when there is none, or two). */
const lineOf = (facts, prefix) => {
  const hits = facts.lines.filter(l => l.startsWith(prefix))
  assert.equal(hits.length, 1, `one "${prefix}" line, found ${hits.length}`)
  return hits[0]
}

// ── the day ──────────────────────────────────────────────────────────────────

test('a day: the vitals, each with what it is compared against', async () => {
  const day = await dailyDigestFacts(seeded().d1, DAY, RULES, TODAY)
  assert.equal(day.hasData, true)
  // Against the last WEIGH-IN (Tuesday), not the last row: Wednesday's row is a soda tap with no weight.
  assert.match(lineOf(day, 'Weight:'), /^Weight: 187 lbs \(trend [\d.]+ lbs, .+; -0\.4 vs Tue Nov 10\)$/)
  // The week's average is the two full readings inside the 7 days (124/78, 122/76); Nov 5's is outside.
  assert.equal(lineOf(day, 'Blood pressure:'), 'Blood pressure: 122/76 (7-day average 123/77 over 2 readings: elevated by the AHA categories; goal under 130/80 met)')
  assert.equal(lineOf(day, 'Resting HR:'), 'Resting HR: 55 bpm')
  assert.equal(lineOf(day, 'HRV:'), 'HRV: 54 ms')
  assert.equal(lineOf(day, 'Whoop recovery:'), 'Whoop recovery: 62%')
  assert.equal(lineOf(day, 'Whoop strain:'), 'Whoop strain: 12.3')
  assert.equal(lineOf(day, 'Sleep:'), 'Sleep: 7h 0m (88% performance) — 1h 35m deep, 1h 50m REM')
  // The seven days before: 188.0, 187.6, 187.4 (the tap day has no weight to drag the mean down).
  assert.equal(lineOf(day, 'Prior 7 days'), 'Prior 7 days, for comparison: avg weight 187.7 lbs, avg resting HR 57 bpm, avg HRV 51 ms, avg recovery 58.3%, avg sleep 6h 52m')
})

test('a day: doses, the one workout recorded twice, and the drinks told apart', async () => {
  const day = await dailyDigestFacts(seeded().d1, DAY, RULES, TODAY)
  assert.equal(lineOf(day, 'Doses logged:'), 'Doses logged: Testosterone Cypionate 70mg')
  // Whoop's and Apple's copy of the same ride: one session, the longer record, Whoop's strain.
  assert.equal(lineOf(day, 'Workouts:'), 'Workouts: Cycling 46min 410kcal strain 9.8')
  // "Dr Pepper" and " dr pepper " are one drink; the Gatorade is not a soda.
  assert.equal(lineOf(day, 'Sodas:'), 'Sodas: 2, ~24 oz (Dr Pepper x2)')
  assert.equal(lineOf(day, 'Other drinks'), 'Other drinks (not sodas): Gatorade Zero 20oz bottle')
  assert.match(lineOf(day, 'Caffeine:'), /^Caffeine: 82 mg from logged drinks, last at 16:20, 41 mg of it after 14:00/)
  // 16 + 24 oz poured, plus the sports drink's 20.
  assert.equal(lineOf(day, 'Water:'), 'Water: 60 oz over 2 pours (incl. 20 oz of sports drink)')
  assert.equal(lineOf(day, 'Water goal:'), 'Water goal: 100 oz/day — 40 oz short (60 oz)')
  assert.match(lineOf(day, 'Schedule check'), /due today: Testosterone Cypionate 70 mg \(Thu\+Sun\)\. Logged: Testosterone Cypionate\. Not due today: hCG \(Tue\+Fri; next Fri Nov 13\)/)
})

test('a day: a meal without figures makes the total a floor, and nothing is judged against it', async () => {
  const day = await dailyDigestFacts(seeded().d1, DAY, RULES, TODAY)
  // Oats 300 (label) + stew 600 (model) + two Dr Peppers 300; the sandwich has no figures.
  assert.equal(lineOf(day, 'Meals:'), 'Meals: breakfast — zzq oats; lunch — zzq sandwich; dinner — zzq mystery stew. Est. ≈ 1200 kcal, 50 g protein, 175 g carbs, 31 g fat (incl. ~300 kcal from drinks); 1 meal without figures yet, so this is a floor.')
  assert.equal(lineOf(day, 'Protein target:'), 'Protein target: 150 g/day (set by hand) — not judged: the day\'s protein figure is a floor, not a total')
  assert.match(lineOf(day, 'Sodium and fibre:'), /sodium ≈ 1377 mg \(a floor: 1 meal without a sodium figure\); fibre ≈ 14 g \(a floor: 1 meal without a fibre figure\)/)
  assert.equal(lineOf(day, 'Your note for the day'), 'Your note for the day — Thu Nov 12: "Legs felt heavy. / Slept late."')
  assert.equal(lineOf(day, 'Labs were drawn'), 'Labs were drawn this day — results are on the labs page.')
  assert.deepEqual(day.stats, {
    weight_lbs: 187, weight_trend: day.stats.weight_trend, weight_rate_wk: day.stats.weight_rate_wk, rhr: 55, hrv: 54, recovery: 62, strain: 12.3,
    sleep_min: 420, doses: 1, workouts: 1, sodas: 2, soda_oz: 24, water_oz: 60, kcal_est: 1200, protein_g_est: 50
  })
})

test('a day with every meal figured is judged; label figures are called label figures', async () => {
  const day = await dailyDigestFacts(seeded().d1, '2026-11-13', RULES, TODAY)
  // Oats twice (label, 300/10) and the stew (model, 600/40): a mix reads "Est.".
  assert.equal(lineOf(day, 'Meals:'), 'Meals: breakfast — zzq oats; lunch — zzq oats; dinner — zzq mystery stew. Est. ≈ 1200 kcal, 60 g protein, 145 g carbs, 37 g fat.')
  assert.match(lineOf(day, 'Protein target:'), /^Protein target: 150 g\/day \(set by hand\) — .*90 g short/)
  assert.equal(lineOf(day, 'Water goal:'), 'Water goal: 100 oz/day — met (100 oz)')
  // A day whose every meal came from the label says so.
  const { db, d1 } = seeded()
  insert(db, 'journal_entries', { date: '2026-11-14', food: { breakfast: 'zzq oats', dinner: 'zzq oats' } })
  assert.match(lineOf(await dailyDigestFacts(d1, '2026-11-14', RULES, TODAY), 'Meals:'), /\. Label figures ≈ 600 kcal, 20 g protein, /)
})

test('a day with nothing logged is not worth a recap, though the schedule still has something to say', async () => {
  const empty = await dailyDigestFacts(seeded().d1, '2026-11-14', RULES, TODAY)
  assert.equal(empty.hasData, false)
  assert.equal(empty.lines[0], 'Doses logged: none')
  assert.match(empty.lines[1], /^Schedule check for Sat Nov 14.*due today: nothing/)
  assert.match(empty.lines[2], /^Prior 7 days/)
  assert.equal(empty.lines.length, 3, 'the baseline and the schedule are context, not data')
  assert.deepEqual([empty.stats.weight_lbs, empty.stats.sleep_min, empty.stats.doses, empty.stats.sodas, empty.stats.soda_oz, empty.stats.water_oz, empty.stats.kcal_est], [null, null, 0, 0, null, null, null])

  // A soda tap and a night of sleep, no weigh-in: worth one, and no line invents a vital.
  const tap = await dailyDigestFacts(seeded().d1, '2026-11-11', RULES, TODAY)
  assert.equal(tap.hasData, true)
  assert.equal(tap.lines.some(l => /^(Weight|Blood pressure|Resting HR|HRV|Water|Meals)/.test(l)), false)
  assert.equal(lineOf(tap, 'Sleep:'), 'Sleep: 6h 59m — 1h 20m deep, 1h 45m REM')
  assert.equal(lineOf(tap, 'Sodas:'), 'Sodas: 1, ~20 oz (dr pepper)')
  // No rules at all: no schedule line, and nothing else changes.
  const bare = await dailyDigestFacts(seeded().d1, '2026-11-14', [], TODAY)
  assert.equal(bare.lines.some(l => l.startsWith('Schedule check')), false)
})

// ── the week ─────────────────────────────────────────────────────────────────

test('a week: averages over the days that have the figure, never over the days that do not', async () => {
  const week = await weeklyDigestFacts(seeded().d1, ...WEEK, RULES, TODAY)
  assert.equal(week.hasData, true)
  assert.match(lineOf(week, 'Weight:'), /^Weight: 186\.5 lbs on the last weigh-in; trend [\d.]+ lbs, .+; week avg 186\.9, range 186\.5–187\.4$/)
  assert.equal(lineOf(week, 'Avg resting HR:'), 'Avg resting HR: 55.3 bpm') // 57, 55, 54
  assert.equal(lineOf(week, 'Avg HRV:'), 'Avg HRV: 53.7 ms') // 51, 54, 56
  assert.equal(lineOf(week, 'Avg blood pressure:'), 'Avg blood pressure: 122/76 (systolic range 120–124, 3 readings)')
  assert.equal(lineOf(week, 'Blood pressure, read'), 'Blood pressure, read as a clinician would: 7-day average 122/76 over 3 readings: elevated by the AHA categories; goal under 130/80 met')
  assert.equal(lineOf(week, 'Avg Whoop recovery:'), 'Avg Whoop recovery: 62.3%') // 70, 55, 62
  assert.equal(lineOf(week, 'Avg Whoop strain:'), 'Avg Whoop strain: 10.9') // 9.5, 11, 12.34
  // 420, 419, 420 → 419.67 min. Rounding the hours and minutes apart once printed "6h 60m" here.
  assert.equal(lineOf(week, 'Avg sleep:'), 'Avg sleep: 7h 0m/night (1h 28m deep, 1h 45m REM)')
})

test('a week: doses against the schedule, sessions counted once, drinks by the ounce', async () => {
  const week = await weeklyDigestFacts(seeded().d1, ...WEEK, RULES, TODAY)
  assert.equal(lineOf(week, 'Compounds used:'), 'Compounds used: Testosterone Cypionate (2d, 140mg total); hCG (1d, 250IU total)')
  const schedule = week.lines.find(l => l.startsWith('Schedule check'))
  assert.match(schedule, /- Testosterone Cypionate 70 mg \(Thu\+Sun\): due Thu Nov 12 and Sun Nov 15 — 2 logged\./)
  assert.match(schedule, /- hCG 250 IU \(Tue\+Fri\): due Tue Nov 10 and Fri Nov 13 — 1 logged; missed Fri Nov 13\./)
  // 60 min of strength and the ride once (46 min), not twice.
  assert.equal(lineOf(week, 'Workouts:'), 'Workouts: 2 sessions, 106 min total, 760 kcal')
  // A 20 oz bottle and two 12 oz cans, over seven days.
  assert.equal(lineOf(week, 'Sodas:'), 'Sodas: 3, ~44 oz, ~6 oz/day (dr pepper x3)')
  assert.equal(lineOf(week, 'Caffeine:'), 'Caffeine: ~75 mg/day from logged drinks over 2 days, with caffeine after 14:00 on 2 of them')
  // Water over the two days that logged any (60 and 100 oz): the other five are unknown, not zero.
  assert.equal(lineOf(week, 'Water:'), 'Water: ~80 oz/day over the 2 days it was logged (160 oz total)')
  assert.equal(lineOf(week, 'Water goal:'), 'Water goal: 100 oz/day — met on 1 of the 2 days that logged water')
})

test('a week: food is averaged only over days logged through to dinner with every meal figured', async () => {
  const week = await weeklyDigestFacts(seeded().d1, ...WEEK, RULES, TODAY)
  // Thursday has a meal without figures, so Friday (1200 kcal, 60 g) is the whole average.
  assert.equal(lineOf(week, 'Food:'), 'Food: meals logged on 2 days; ≈ 1200 kcal/day and 60 g protein/day over the 1 day logged through to dinner with figures for every meal; most logged: zzq oats ×3, zzq mystery stew ×2, zzq sandwich')
  assert.equal(lineOf(week, 'Protein target:'), 'Protein target: 150 g/day (set by hand) — the average of 60 g over the 1 complete day is 90 g short')
  assert.equal(lineOf(week, 'Your notes this week'), 'Your notes this week — Thu Nov 12: "Legs felt heavy. / Slept late."')
  assert.equal(lineOf(week, 'Labs drawn'), 'Labs drawn Thu Nov 12 — results are on the labs page.')
  assert.equal(lineOf(week, 'Previous week'), 'Previous week (Mon Nov 2 – Sun Nov 8), for comparison: avg recovery 54%, avg sleep 6h 45m/night, avg resting HR 57.7 bpm, avg HRV 50.3 ms, avg BP 126/80, avg weight 188 lbs, 1 workout, 1 soda (~12 oz), water ~60 oz/day')
  assert.deepEqual(week.stats, {
    weight_lbs: 186.5, weight_trend: week.stats.weight_trend, weight_rate_wk: week.stats.weight_rate_wk, weight_change: -0.9,
    avg_recovery: 62.3, avg_strain: 10.9, avg_sleep_min: 420, avg_bp_systolic: 122, avg_bp_diastolic: 76,
    compounds: 2, workouts: 2, sodas: 3, soda_oz: 44, water_oz_per_day: 80, avg_kcal_est: 1200, avg_protein_g_est: 60
  })
})

test('an empty week says so in plain lines and is not worth a recap', async () => {
  const week = await weeklyDigestFacts(seeded().d1, '2026-08-03', '2026-08-09', [], TODAY)
  assert.equal(week.hasData, false)
  assert.deepEqual(week.lines, ['Compounds used: none logged', 'Workouts: none', 'Sodas: none logged', 'Water: none logged', 'Food: no meals logged'])
  assert.deepEqual([week.stats.weight_lbs, week.stats.weight_change, week.stats.avg_sleep_min, week.stats.water_oz_per_day, week.stats.avg_kcal_est], [null, null, null, null, null])
})

test('a note is flattened to one line and cut at 280 characters', async () => {
  const { db, d1 } = seeded()
  insert(db, 'journal_entries', { date: '2026-11-14', notes: `first line\n\n\nsecond line ${'x'.repeat(400)}` })
  const note = lineOf(await dailyDigestFacts(d1, '2026-11-14', [], TODAY), 'Your note for the day')
  assert.match(note, /^Your note for the day — Sat Nov 14: "first line \/ second line x+\.\.\."$/)
  assert.equal(note.length, 'Your note for the day — Sat Nov 14: ""'.length + 280)
})

// ── the long window, and what happens when the database is not whole ─────────

test('the trend window is the 120 days to the period\'s end, read once each', async () => {
  const { d1 } = seeded()
  const trends = await digestTrends(d1, WEEK[1], PROTOCOL)
  assert.ok(Array.isArray(trends.lines) && Array.isArray(trends.findings))
  assert.equal(d1.ran.length, 2, 'the journal and the health metrics, nothing else')
  assert.ok(d1.ran.every(sql => /WHERE date >= \?1 AND date <= \?2/.test(sql)))
})

const MIGRATIONS = 'server/database/migrations'
const baseline = new Set([...readFileSync(`${MIGRATIONS}/${readdirSync(MIGRATIONS).sort()[0]}`, 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]))
const tablesOf = db => db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all().map(r => r.name)
const BUILDERS = {
  'daily digest': d1 => dailyDigestFacts(d1, DAY, RULES, TODAY),
  'weekly digest': d1 => weeklyDigestFacts(d1, ...WEEK, RULES, TODAY),
  'ask sheet': d1 => buildAskContext(d1, TODAY, PROTOCOL)
}

test('a table from a later migration that is not there yet never fails a fact sheet', async () => {
  // Code can reach a database before its migration does. Every table added since the baseline
  // reads as "nothing on file" when it is missing; the fact sheets are built from the rest.
  const later = tablesOf(freshDb()).filter(t => !baseline.has(t))
  assert.ok(later.length >= 10, `tables added since the baseline: ${later.length}`)
  for (const table of later) {
    for (const [name, build] of Object.entries(BUILDERS)) {
      const db = freshDb()
      seedFortnight(db)
      db.exec('PRAGMA foreign_keys = OFF')
      db.exec(`DROP TABLE ${table}`)
      await assert.doesNotReject(() => build(d1Of(db)), `${name} without ${table}`)
    }
  }
  // Without the profile the water goal is the tracker's default, and says it is.
  const db = freshDb()
  seedFortnight(db)
  db.exec('DROP TABLE profile')
  const day = await dailyDigestFacts(d1Of(db), DAY, RULES, TODAY)
  assert.equal(lineOf(day, 'Water goal:'), 'Water goal: 100 oz/day (the tracker\'s default; none is set on the profile) — 40 oz short (60 oz)')
  assert.equal(day.lines.some(l => l.startsWith('Protein target:')), false, 'no target on file: none is invented')
})

test('a read that fails for any other reason fails the fact sheet — it is never "nothing logged"', async () => {
  for (const [name, build] of Object.entries(BUILDERS)) {
    for (const table of ['journal_entries', 'health_metrics', 'workouts', 'labs_entries', 'meal_estimates', 'profile']) {
      const { d1 } = seeded()
      d1.fail(new RegExp(`FROM ${table}\\b`))
      await assert.rejects(() => build(d1), /Network connection lost/, `${name}: ${table} unreadable`)
    }
  }
})

test('the blood-pressure goal is the owner\'s, the default only when none is on file', async () => {
  const goalLine = async d1 => lineOf(await dailyDigestFacts(d1, DAY, RULES, TODAY), 'Blood pressure:')
  const own = seeded()
  insert(own.db, 'profile', { key: 'bp_goal', value: '120/75', updated_at: 'x' })
  assert.ok((await goalLine(own.d1)).endsWith('goal under 120/75 not met)'), 'the average is 123/77')
  // Text that is not a reading, and a database with no profile table: the default, 130/80.
  const garbled = seeded()
  insert(garbled.db, 'profile', { key: 'bp_goal', value: 'lower', updated_at: 'x' })
  assert.ok((await goalLine(garbled.d1)).endsWith('goal under 130/80 met)'))
  const none = seeded()
  none.db.exec('DROP TABLE profile')
  assert.ok((await goalLine(none.d1)).endsWith('goal under 130/80 met)'))
  // The goal's own read failing is a failure. It used to answer the default, and the recap then
  // judged the week against 130/80 whatever the owner had set.
  const blip = seeded()
  blip.d1.fail(/FROM profile WHERE key = \?1/)
  await assert.rejects(() => dailyDigestFacts(blip.d1, DAY, RULES, TODAY), /Network connection lost/)
  await assert.rejects(() => weeklyDigestFacts(blip.d1, ...WEEK, RULES, TODAY), /Network connection lost/)
})
