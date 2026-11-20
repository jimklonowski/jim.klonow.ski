// The water goal and protein target as digest fact lines (shared/utils/intakeTargets.ts), and
// the digest prompts that read them (server/utils/digestPrompts.ts) — audit #44 item 33.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { intakeTargetsFor, proteinTargetDayFact, proteinTargetWeekFact, waterGoalDayFact, waterGoalWeekFact } from '../shared/utils/intakeTargets.ts'
import { dailyDigestPrompt, readerContext, weeklyDigestPrompt } from '../server/utils/digestPrompts.ts'
import { labsSummaryPrompt } from '../server/utils/summaryPrompts.ts'
import { AS_NEEDED, RULES, STANDING } from './_fixtures/protocol.mjs'

const SCANS = [
  { date: '2031-01-10', total: { lean_mass_lbs: 140 } },
  { date: '2031-06-10', total: { lean_mass_lbs: 150.25 } },
  { date: '2031-09-10', total: {} }
]

test('the targets in force: the profile\'s water goal or the default, a fixed protein target or the lean rule as of the date', () => {
  const none = intakeTargetsFor({}, SCANS, '2031-07-01')
  assert.deepEqual(none, { waterGoalOz: 100, waterGoalSet: false, protein: null })
  assert.equal(intakeTargetsFor(null, [], '2031-07-01').protein, null)
  const fixed = intakeTargetsFor({ water_goal_oz: '120', protein_target_g: '185', protein_per_lb_lean: '1' }, SCANS, '2031-07-01')
  assert.equal(fixed.waterGoalOz, 120)
  assert.equal(fixed.waterGoalSet, true)
  assert.deepEqual(fixed.protein, { grams: 185, source: 'fixed' }, 'the typed figure is the override')
  const lean = intakeTargetsFor({ protein_per_lb_lean: '1.1' }, SCANS, '2031-07-01').protein
  assert.deepEqual([lean.grams, lean.source, lean.scanDate], [165, 'lean', '2031-06-10'])
  assert.equal(intakeTargetsFor({ protein_per_lb_lean: '1.1' }, SCANS, '2031-03-01').protein.grams, 154, 'a digest for March reads the January scan')
  assert.equal(intakeTargetsFor({ water_goal_oz: 'abc' }, [], '2031-07-01').waterGoalSet, false, 'an unparseable goal is not a goal')
})

test('the Water goal line: the goal, whether it is the owner\'s, and the verdict on the amount', () => {
  const set = intakeTargetsFor({ water_goal_oz: '100' }, [], '2031-07-01')
  const dflt = intakeTargetsFor({}, [], '2031-07-01')
  assert.equal(waterGoalDayFact(set, 104), 'Water goal: 100 oz/day — met (104 oz)')
  assert.equal(waterGoalDayFact(set, 100), 'Water goal: 100 oz/day — met (100 oz)')
  assert.equal(waterGoalDayFact(set, 99.6), 'Water goal: 100 oz/day — 0.4 oz short (99.6 oz)', 'met on the amount, never on a rounded figure')
  assert.equal(waterGoalDayFact(dflt, 84), 'Water goal: 100 oz/day (the tracker\'s default; none is set on the profile) — 16 oz short (84 oz)')
  assert.equal(waterGoalWeekFact(set, [104, 0, 60, 100, 0, 0, 99]), 'Water goal: 100 oz/day — met on 2 of the 4 days that logged water', 'an unlogged day is unknown, not a miss')
  assert.equal(waterGoalWeekFact(set, [120]), 'Water goal: 100 oz/day — met on 1 of the 1 day that logged water')
  assert.equal(waterGoalWeekFact(set, [0, 0]), 'Water goal: 100 oz/day')
})

test('the Protein target line: where the target comes from, and a verdict only on complete figures', () => {
  const fixed = { grams: 180, source: 'fixed' }
  const lean = intakeTargetsFor({ protein_per_lb_lean: '1' }, SCANS, '2031-07-01').protein
  assert.equal(proteinTargetDayFact(fixed, 184.6, true), 'Protein target: 180 g/day (set by hand) — met (185 g)')
  assert.equal(proteinTargetDayFact(fixed, 141.7, true), 'Protein target: 180 g/day (set by hand) — 38 g short (142 g)')
  assert.equal(proteinTargetDayFact(fixed, 90, false), 'Protein target: 180 g/day (set by hand) — not judged: the day\'s protein figure is a floor, not a total')
  assert.equal(proteinTargetDayFact(fixed, 190, false), 'Protein target: 180 g/day (set by hand) — met already (190 g so far)', 'a floor over the target has met it')
  assert.equal(proteinTargetDayFact(lean, 150, true), 'Protein target: 150 g/day (1 g per lb of lean mass × 150.3 lb lean on the 2031-06-10 DEXA) — met (150 g)')
  assert.equal(proteinTargetWeekFact(fixed, 150, 4), 'Protein target: 180 g/day (set by hand) — the average of 150 g over the 4 complete days is 30 g short')
  assert.equal(proteinTargetWeekFact(fixed, 181, 1), 'Protein target: 180 g/day (set by hand) — the average of 181 g over the 1 complete day meets it')
  assert.equal(proteinTargetWeekFact(fixed, null, 0), 'Protein target: 180 g/day (set by hand) — not judged: no day in the period has complete meal figures')
})

// The prompts name the two lines exactly as the fact sheet prints them, and the standing reader
// paragraph states nothing that can go stale.
test('the prompts read the lines the fact sheet emits, and the reader paragraph carries no perishable fact', () => {
  const protocol = { rules: RULES, standing: STANDING, asNeeded: AS_NEEDED, supplements: [] }
  const set = intakeTargetsFor({ water_goal_oz: '100', protein_target_g: '180' }, [], '2026-11-19')
  const facts = [waterGoalDayFact(set, 84), proteinTargetDayFact(set.protein, 150, true)].join('\n')
  for (const prompt of [dailyDigestPrompt('2026-11-19', facts, '', protocol), weeklyDigestPrompt('2026-11-08', '2026-11-14', facts, '', protocol)]) {
    for (const name of ['Water goal', 'Protein target']) {
      assert.ok(prompt.includes(`"${name}" line`), `the ground rules point at the ${name} line`)
      assert.ok(facts.split('\n').some(l => l.startsWith(`${name}: `)), `and the sheet has a line that starts "${name}: "`)
    }
    assert.ok(!/"(Water goal|Protein target)" fact/.test(prompt), 'no reference to a fact the sheet does not print')
    assert.ok(!/otherwise about 100 oz/.test(prompt), 'no fallback goal for the model to assume')
  }
  // The framing paragraph alone: everything before the generated schedule.
  const framing = readerContext('2026-11-19', protocol).split('Intended dosing schedule')[0]
  assert.ok(framing.length > 400, 'the paragraph is there')
  // The only digits allowed are in two peptide names.
  const unnamed = framing.replace(/BPC-157|TB-500/g, '')
  assert.ok(!/\d/.test(unnamed), `no figure of any kind: ${unnamed.match(/[^.]*\d[^.]*/)?.[0] ?? ''}`)
  for (const stale of [/Primobolan|Anavar|Anastrozole/i, /not currently taking/i, /recently over/i, /running high/i]) {
    assert.ok(!stale.test(framing), `no perishable claim (${stale})`)
  }
  // The labs summary opens with the same kind of paragraph, and had the same three claims in it.
  const blank = { protocolBlock: '', supplementBlock: '', cycleBlock: '', vaccineBlock: '', eventBlock: '', plannedBlock: '', phlebotomyBlock: '', goalsBlock: '', accutaneBlock: '', calcsBlock: '', pgxBlock: '', qualitativeBlock: '' }
  const labs = labsSummaryPrompt({ ...blank, date: '2026-11-19', fasting: true, protocol, draws: [{ date: '2026-11-19', fasting: true }], markerLines: ['LDL [mg/dL]: NEW 2026-11-19: 90'], readingNotes: [] })
  const labsOpening = labs.split('Intended dosing schedule')[0]
  assert.ok(labsOpening.length > 400 && !/\d/.test(labsOpening), `the labs opening has no figure: ${labsOpening.match(/[^.]*\d[^.]*/)?.[0] ?? ''}`)
  for (const stale of [/Primobolan|Anavar|Anastrozole/i, /not currently taking/i, /has been climbing/i, /may read over/i]) {
    assert.ok(!stale.test(labsOpening), `no perishable claim in the labs opening (${stale})`)
  }
  assert.match(readerContext('2026-11-19', protocol), /Intended dosing schedule/, 'the schedule still follows it')
  assert.match(readerContext('2026-11-19', protocol), /Current goals \(stated 2026-10-23\)/, 'and the dated goals')
  assert.doesNotMatch(readerContext('2026-10-01', protocol), /Current goals/, 'a prompt for a day before the goals were stated has none')
})
