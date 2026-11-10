// The hematocrit control panel's rules (shared/utils/hematocrit.ts) — audit #43 item 59.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HCT_LADDER, PHLEBOTOMY_EFFECT_DAYS, RBC_TURNOVER_DAYS, hctDraws, hctHeadline, ironLedger, ironMgOf, ironSpansFrom, ladderRung, nextRung,
  phlebotomyEffects, readingTags, rungAction, transitionalFor, transitionalWindows
} from '../shared/utils/hematocrit.ts'
import { diffDays } from '../shared/utils/dates.ts'

const rule = (compound, from, to, doseLabel, weekdays = [1, 4]) => ({ compound, doseLabel, weekdays, from, to })

test('the ladder: 50 watch, 52 act, 54 stop; below 50 nothing; the next rung and its gap', () => {
  assert.deepEqual(HCT_LADDER.map(r => r.at), [50, 52, 54])
  assert.equal(ladderRung(49.9), null)
  assert.equal(ladderRung(50).label, 'watch')
  assert.equal(ladderRung(51.7).label, 'watch')
  assert.equal(ladderRung(52).label, 'act')
  assert.equal(ladderRung(55.2).label, 'stop')
  assert.equal(ladderRung(null), null)
  assert.deepEqual(nextRung(51.7), { rung: HCT_LADDER[1], gap: 0.3 })
  assert.deepEqual(nextRung(48), { rung: HCT_LADDER[0], gap: 2 })
  assert.equal(nextRung(54), null)
})

test('while donation is deferred no rung suggests one: blood out is a therapeutic phlebotomy by order', () => {
  const [watch, act, stop] = HCT_LADDER
  assert.match(rungAction(act, false), /weigh a donation/)
  for (const rung of [act, stop]) {
    const deferred = rungAction(rung, true)
    assert.doesNotMatch(deferred, /weigh a donation/)
    assert.match(deferred, /therapeutic phlebotomy on a prescriber's order/)
  }
  assert.equal(rungAction(watch, true), watch.action, 'a rung with nothing to defer reads the same')
})

test('a dose change of an erythropoietic compound opens a 120-day transitional window; other compounds do not', () => {
  const rules = [
    rule('Testosterone Cypionate', '2026-01-01', '2026-08-23', '100 mg'),
    rule('Testosterone Cypionate', '2026-08-24', null, '75 mg'), // the T cut: a handover
    rule('hCG', '2026-01-01', '2026-10-23', '300 IU', [0, 2, 5]),
    rule('hCG', '2026-10-24', null, '250 IU', [2, 5]),
    rule('BPC-157', '2026-09-01', null, '250 mcg', [0, 1, 2, 3, 4, 5, 6]) // not a driver
  ]
  const windows = transitionalWindows(rules)
  assert.deepEqual(windows.map(w => [w.from, w.to, w.change]), [
    ['2026-01-01', '2026-04-30', 'T start 100 mg'],
    ['2026-01-01', '2026-04-30', 'hCG start 300 IU'],
    ['2026-08-24', '2026-12-21', 'T 100→75 mg'],
    ['2026-10-24', '2027-02-20', 'hCG 300→250 IU Tue+Fri']
  ])
  assert.equal(diffDays('2026-08-24', '2026-12-21') + 1, RBC_TURNOVER_DAYS)
  // Inside the window after the cut; the hCG change is the later window once it opens.
  assert.equal(transitionalFor('2026-10-17', windows).change, 'T 100→75 mg')
  assert.equal(transitionalFor('2026-11-04', windows).change, 'hCG 300→250 IU Tue+Fri', 'the latest change wins an overlap')
  assert.equal(transitionalFor('2026-07-01', windows), null)
  assert.deepEqual(transitionalWindows([]), [])
})

test('the headline: the last reading, its rung, the window today sits in, and whether the reading itself was transitional', () => {
  const draws = hctDraws([
    { date: '2026-08-15', markers: { hematocrit: 50.4, hemoglobin: 17.1, ferritin: 16 } },
    { date: '2026-09-09', markers: { hematocrit: 51.7, hemoglobin: 17.4 } },
    { date: '2026-10-17', markers: { hematocrit: 51.7, ferritin: 35 } },
    { date: '2026-10-20', markers: { ldl: 100 } }, // no CBC: not a draw here
    { date: '2027-01-05', markers: { hematocrit: 49 } } // after today
  ])
  assert.equal(draws.length, 4)
  const windows = [{ from: '2026-08-24', to: '2026-12-21', change: 'T 100→75 mg' }]
  const h = hctHeadline(draws, windows, '2026-11-04')
  assert.deepEqual(h.current, { date: '2026-10-17', value: 51.7 })
  assert.equal(h.rung.label, 'watch')
  assert.deepEqual(h.next, { rung: HCT_LADDER[1], gap: 0.3 })
  assert.equal(h.transitional.change, 'T 100→75 mg')
  assert.equal(h.daysIn, 72)
  assert.equal(h.currentIsTransitional, true, 'Oct 17 sits 54 days after the cut')
  const settled = hctHeadline(draws, windows, '2027-01-10')
  assert.equal(settled.transitional, null)
  assert.equal(settled.current.value, 49)
  assert.equal(settled.currentIsTransitional, false)
  assert.equal(hctHeadline([], windows, '2026-11-04').current, null)
})

test('reading tags: a red-cell marker inside a turnover window is transitional; a CBC or ferritin within 8 weeks of a visit is post-phlebotomy', () => {
  const windows = [{ from: '2026-08-24', to: '2026-12-21', change: 'T 100→75 mg' }]
  const visit = { id: 1, date: '2026-10-17', kind: 'donation', ml: 500, pre_hgb: null, notes: null, created_at: 'x' }
  const kinds = tags => tags.map(t => t.kind)
  // Inside the window, no visit yet: transitional, with the day count.
  const sep = readingTags('hematocrit', '2026-09-09', windows, [visit])
  assert.deepEqual(kinds(sep), ['transitional'])
  assert.match(sep[0].text, /^16 days after T 100→75 mg — red cells turn over on a ~120-day cycle/)
  assert.match(readingTags('hematocrit', '2026-08-25', windows, [])[0].text, /^1 day after T/)
  // The visit's own day is before it (phlebotomyEffects' rule): no post-phlebotomy tag.
  assert.deepEqual(kinds(readingTags('hematocrit', '2026-10-17', windows, [visit])), ['transitional'])
  // Six weeks on, still inside the window: both, the visit's tag naming the kind and the days.
  const dec = readingTags('hematocrit', '2026-11-28', windows, [visit])
  assert.deepEqual(kinds(dec), ['transitional', 'post-phlebotomy'])
  assert.match(dec[1].text, /^42 days after the 2026-10-17 blood donation — a lower reading here is the blood taken out/)
  // Ferritin never wears the turnover tag, does wear the visit's, with its own wording.
  const fer = readingTags('ferritin', '2026-11-28', windows, [visit])
  assert.deepEqual(kinds(fer), ['post-phlebotomy'])
  assert.match(fer[0].text, /iron that left with the blood/)
  assert.match(readingTags('hemoglobin', '2026-11-28', windows, [{ ...visit, kind: 'therapeutic' }])[1].text, /therapeutic phlebotomy/)
  // The last day of the effect window counts; the day after does not. Past the window: nothing.
  assert.deepEqual(kinds(readingTags('hematocrit', '2026-12-12', windows, [visit])), ['transitional', 'post-phlebotomy'])
  assert.equal(diffDays('2026-10-17', '2026-12-12'), PHLEBOTOMY_EFFECT_DAYS)
  assert.deepEqual(kinds(readingTags('hematocrit', '2026-12-13', windows, [visit])), ['transitional'])
  assert.deepEqual(readingTags('hematocrit', '2027-01-20', windows, [visit]), [])
  // The nearest earlier visit is the one named when two qualify.
  const two = readingTags('hematocrit', '2026-11-28', [], [visit, { ...visit, id: 2, date: '2026-11-20' }])
  assert.match(two[0].text, /8 days after the 2026-11-20/)
  // Other markers never wear either.
  assert.deepEqual(readingTags('estradiol', '2026-11-28', windows, [visit]), [])
})

test('what a phlebotomy bought: the reading before it against the first after', () => {
  const draws = hctDraws([
    { date: '2026-09-09', markers: { hematocrit: 51.7 } },
    { date: '2026-10-17', markers: { hematocrit: 51.7 } },
    { date: '2026-12-01', markers: { hematocrit: 48.9 } },
    { date: '2027-01-20', markers: { hematocrit: 47.5 } }
  ])
  const p = (id, date, over = {}) => ({ id, date, kind: 'donation', ml: 500, pre_hgb: null, notes: null, created_at: 'x', ...over })
  const row = e => [e.phlebotomy.id, e.before?.value, e.after?.value, e.hctDelta, e.sharedWith]
  // One visit between two draws: its own change; a same-day draw counts as "before".
  assert.deepEqual(phlebotomyEffects([p(1, '2026-10-17')], draws).map(row), [[1, 51.7, 48.9, -2.8, []]])
  // Two visits with no draw between them: one combined −2.8, named as shared — not −2.8 twice.
  assert.deepEqual(phlebotomyEffects([p(2, '2026-11-20'), p(1, '2026-10-17')], draws).map(row), [
    [1, 51.7, 48.9, -2.8, ['2026-11-20']],
    [2, 51.7, 48.9, -2.8, ['2026-10-17']]
  ])
  // A draw between them splits them: each its own before and after.
  assert.deepEqual(phlebotomyEffects([p(1, '2026-10-17'), p(2, '2026-12-05')], draws).map(row), [
    [1, 51.7, 48.9, -2.8, []],
    [2, 48.9, 47.5, -1.4, []]
  ])
  // A draw on the later visit's own day is "before" that visit, so it splits them too.
  assert.deepEqual(phlebotomyEffects([p(1, '2026-10-17'), p(2, '2026-12-01')], draws).map(row), [
    [1, 51.7, 48.9, -2.8, []],
    [2, 48.9, 47.5, -1.4, []]
  ])
  // Three in a row, the last still waiting for its draw: grouped, no delta yet.
  const waiting = phlebotomyEffects([p(3, '2027-02-01'), p(4, '2027-03-01'), p(5, '2027-04-01')], draws)
  assert.deepEqual(waiting.map(row), [
    [3, 47.5, undefined, null, ['2027-03-01', '2027-04-01']],
    [4, 47.5, undefined, null, ['2027-02-01', '2027-04-01']],
    [5, 47.5, undefined, null, ['2027-02-01', '2027-03-01']]
  ])
  assert.equal(phlebotomyEffects([p(3, '2027-02-15')], draws)[0].after, null)
})

test('the iron ledger: 500 mL out is ~250 mg; oral iron counts at 15 % absorbed; spans clip to the window', () => {
  const phlebs = [
    { id: 1, date: '2026-10-01', kind: 'donation', ml: 500, pre_hgb: 16.1, notes: null, created_at: 'x' },
    { id: 2, date: '2026-11-15', kind: 'therapeutic', ml: null, pre_hgb: null, notes: null, created_at: 'x' }, // defaults to 500 mL
    { id: 3, date: '2026-01-01', kind: 'donation', ml: 500, pre_hgb: null, notes: null, created_at: 'x' } // outside
  ]
  const spans = [
    { label: 'Iron 50 mg (standing)', from: '2026-01-01', to: null, mgPerDay: 50 },
    { label: 'Vorck round #2', from: '2026-10-19', to: '2026-10-25', mgPerDay: 225 }
  ]
  const l = ironLedger(phlebs, spans, '2026-09-01', '2026-11-30') // 91 days
  assert.equal(l.days, 91)
  assert.equal(l.phlebotomies, 2)
  assert.equal(l.lostMg, 500)
  assert.deepEqual(l.sources, [{ label: 'Iron 50 mg (standing)', mg: 4550, days: 91 }, { label: 'Vorck round #2', mg: 1575, days: 7 }])
  assert.equal(l.takenMg, 6125)
  assert.equal(l.absorbedMg, 919)
  assert.equal(l.netMg, 419)
})

test('a dose label reads as elemental iron: salts by their iron fraction, counts multiplied, no mg → nothing', () => {
  assert.equal(ironMgOf('50 mg'), 50)
  assert.equal(ironMgOf('75mg'), 75)
  assert.equal(ironMgOf('2 x 25 mg'), 50)
  assert.equal(ironMgOf('325 mg ferrous sulfate'), 65, 'ferrous sulfate is a fifth iron')
  assert.equal(ironMgOf('324 mg ferrous gluconate'), 39)
  assert.equal(ironMgOf('324 mg ferrous fumarate'), 107)
  assert.equal(ironMgOf('ferrous sulfate 325 mg (65 mg elemental)'), 325, 'the first mg figure wins, elemental said → as is')
  assert.equal(ironMgOf('65 mg elemental (as ferrous sulfate)'), 65)
  assert.equal(ironMgOf('25 mg bisglycinate'), 25, 'a chelate label states the iron itself')
  assert.equal(ironMgOf('2 IU'), null)
  assert.equal(ironMgOf('1 capsule'), null)
  assert.equal(ironMgOf(null), null)
})

test('iron spans come from every iron item whatever its kind or category, at each version\'s cadence, plus iron cycles', () => {
  const items = [
    { id: 1, name: 'Iron Bisglycinate', kind: 'standing' }, // the demo's: category supplement, filed among the stack rows
    { id: 2, name: 'Iron (ferrous gluconate)', kind: 'logged' },
    { id: 3, name: 'Iron', kind: 'as_needed' },
    { id: 4, name: 'Magnesium', kind: 'standing' }
  ]
  const v = (id, item_id, from_date, to_date, dose_label, weekdays, note = null) => ({ id, item_id, from_date, to_date, dose_label, weekdays, note })
  const versions = [
    v(1, 1, '2026-09-01', null, '25 mg', null, 'empty stomach + vitamin C, M/W/F'),
    v(2, 2, '2026-10-01', '2026-10-31', '324 mg ferrous gluconate', '[1,3,5]'),
    v(3, 2, '2026-11-01', null, '324 mg ferrous gluconate', '[0,1,2,3,4,5,6]'),
    v(4, 3, '2026-01-01', null, '50 mg', null),
    v(5, 4, '2026-01-01', null, '400 mg', '[0,1,2,3,4,5,6]'),
    v(6, 1, null, '2026-08-31', '1 capsule', null) // no mg figure: nothing to count
  ]
  const round = {
    id: 7, name: 'Vorck round #2', start_date: '2026-10-19', planned_weeks: 1, planned_days: 7,
    compounds: [{ compound: 'Iron Bisglycinate', dose: 225, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 1, toWeek: 1 }]
  }
  const spans = ironSpansFrom(items, versions, [round])
  assert.deepEqual(spans.map(s => [s.label, s.from, s.to, s.mgPerDay]), [
    ['Iron Bisglycinate 25 mg · no fixed days, counted daily', '2026-09-01', null, 25],
    ['Iron (ferrous gluconate) 324 mg ferrous gluconate ×3/wk', '2026-10-01', '2026-10-31', 16.71],
    ['Iron (ferrous gluconate) 324 mg ferrous gluconate', '2026-11-01', null, 39],
    ['Vorck round #2 (225 mg)', '2026-10-19', '2026-10-25', 225]
  ])
  assert.deepEqual(ironSpansFrom([], [], []), [])
})
