// Retest cadence (shared/utils/retest.ts) — audit #43 item 66.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RETEST_RULES, cadenceText, isFlaggedReading, markersDue, suggestedDrawDate } from '../shared/utils/retest.ts'
import { HCT_LADDER, ladderRung } from '../shared/utils/hematocrit.ts'
import { BIOMARKERS, getStatus } from '../app/data/biomarkers.ts'

const TODAY = '2026-11-10'
const plan = (id, date, over = {}) => ({ id, date, lab: 'Quest', panel: null, fasting: true, purpose: null, cycle_id: null, checkpoint_key: null, labs_date: null, created_at: '2026-10-01T00:00:00Z', ...over })
const draws = [
  { date: '2026-08-15', markers: { hematocrit: 50.4, ferritin: 16, testosterone_total: 1180, ldl: 102, psa: 0.8, vitamin_d: 52 } },
  { date: '2026-09-09', markers: { hematocrit: 51.7, ldl: 110 } },
  { date: '2026-10-17', markers: { testosterone_total: 980, estradiol: 157, estradiol_sensitive: 126, alt: 22 } }
]

test('a flagged reading runs the short clock: hematocrit at 50 every 42 days, ferritin under 38 every 42, a clean one the long clock', () => {
  assert.equal(isFlaggedReading(RETEST_RULES.hematocrit, 50), true, 'the ladder rung starts on its own figure')
  assert.equal(isFlaggedReading(RETEST_RULES.hematocrit, 49.9), false)
  assert.equal(isFlaggedReading(RETEST_RULES.ferritin, 37.9), true)
  assert.equal(isFlaggedReading(RETEST_RULES.ferritin, 38), false, 'at the reference floor the card reads in range, and so does the clock')
  assert.equal(isFlaggedReading(RETEST_RULES.alt, 46), false, 'at the reference ceiling likewise')
  assert.equal(isFlaggedReading(RETEST_RULES.alt, 47), true)
  assert.equal(isFlaggedReading(RETEST_RULES.testosterone_total, 5000), false, 'no flagged clock on that rule')
  assert.equal(cadenceText(RETEST_RULES.hematocrit, true), '42-day cadence while 50 or over')
  assert.equal(cadenceText(RETEST_RULES.ferritin, true), '42-day cadence while under 38')
  assert.equal(cadenceText(RETEST_RULES.alt, true), '42-day cadence while over 46')
  assert.equal(cadenceText(RETEST_RULES.hematocrit, false), '90-day cadence')
})

// Audit #44 item 26: the short clock and the card are one judgement. Every flag line is the
// catalogue's reference bound, and a reading is flagged exactly when its card reads HIGH or LOW —
// at the bound, just inside it and just outside it. The two lines that are their own are named.
test('the flag lines are the catalogue\'s bounds, read the way the cards read them', () => {
  const OWN_LINE = new Set(['hematocrit', 'ldl'])
  assert.equal(RETEST_RULES.hematocrit.flagFrom, HCT_LADDER[0].at, 'hematocrit runs on the ladder\'s first rung')
  assert.ok(isFlaggedReading(RETEST_RULES.hematocrit, HCT_LADDER[0].at) && ladderRung(HCT_LADDER[0].at) != null)
  assert.ok(RETEST_RULES.ldl.flagAbove > BIOMARKERS.ldl.refMax, 'LDL\'s short clock starts past the card\'s HIGH line, never inside the range')
  let checked = 0
  for (const [key, rule] of Object.entries(RETEST_RULES)) {
    if (rule.flaggedDays == null || OWN_LINE.has(key)) continue
    const meta = BIOMARKERS[key]
    assert.ok(meta, `${key} is in the catalogue`)
    assert.equal(rule.flagFrom, undefined, `${key} has no rung of its own`)
    if (rule.flagAbove != null) assert.equal(rule.flagAbove, meta.refMax, `${key}: the flag line is the reference ceiling`)
    if (rule.flagBelow != null) assert.equal(rule.flagBelow, meta.refMin, `${key}: the flag line is the reference floor`)
    const bound = rule.flagAbove ?? rule.flagBelow
    for (const value of [bound - 0.1, bound, bound + 0.1]) {
      const status = getStatus(value, meta)
      const outThatSide = rule.flagAbove != null ? status === 'high' : status === 'low'
      assert.equal(isFlaggedReading(rule, value), outThatSide, `${key} at ${value}: flagged = the card's ${status}`)
    }
    checked++
  }
  assert.ok(checked >= 7, `${checked} ruled markers checked`)
})

test('markers due: the clock starts at the last reading, soonest first; outside the horizon left out; a nearby open plan covers', () => {
  const due = markersDue(draws, [], TODAY)
  const by = Object.fromEntries(due.map(d => [d.key, d]))
  // Hct 51.7 on Sep 9 → 42 days → Oct 21, 20 days overdue.
  assert.deepEqual([by.hematocrit.due, by.hematocrit.inDays, by.hematocrit.flagged, by.hematocrit.cadenceDays], ['2026-10-21', -20, true, 42])
  assert.deepEqual(by.hematocrit.last, { date: '2026-09-09', value: 51.7 })
  // Ferritin 16 on Aug 15 → 42 days → Sep 26.
  assert.equal(by.ferritin.due, '2026-09-26')
  // T 980 on Oct 17 → 90 days → Jan 15: beyond the 30-day horizon, not listed.
  assert.equal(by.testosterone_total, undefined)
  assert.equal(by.estradiol, undefined)
  // LDL 110 on Sep 9 is unflagged → 180 days → Mar 8: out. PSA 0.8 → a year: out. Vitamin D 52: out.
  assert.deepEqual(due.map(d => d.key), ['ferritin', 'hematocrit'])
  assert.ok(due.every(d => d.planned === null))
  // An open plan booked within 14 days after the due date covers it; one further out does not.
  const covered = markersDue(draws, [plan(1, '2026-11-03')], TODAY)
  assert.equal(covered.find(d => d.key === 'hematocrit').planned.id, 1, 'Nov 3 is inside Oct 21 + 14')
  assert.equal(covered.find(d => d.key === 'ferritin').planned, null, 'Sep 26 + 14 = Oct 10, before the plan')
  const far = markersDue(draws, [plan(2, '2026-12-20')], TODAY)
  assert.ok(far.every(d => d.planned === null))
  // A plan already fulfilled (a draw on its date) is not open and covers nothing.
  const done = markersDue(draws, [plan(3, '2026-10-17', { labs_date: '2026-10-17' })], TODAY)
  assert.ok(done.every(d => d.planned === null))
  // A later day: the horizon moves with it.
  const jan = markersDue(draws, [], '2027-01-01')
  assert.ok(jan.some(d => d.key === 'testosterone_total' && d.due === '2027-01-15' && d.inDays === 14))
  assert.deepEqual(markersDue([], [], TODAY), [])
})

test('the suggested booking date is the soonest unbooked due date, never before tomorrow', () => {
  assert.equal(suggestedDrawDate(markersDue(draws, [], TODAY), TODAY), '2026-11-11', 'both overdue → tomorrow')
  assert.equal(suggestedDrawDate(markersDue(draws, [], '2026-12-20'), '2026-12-20'), '2026-12-21', 'the overdue ferritin and Hct still head the list → tomorrow')
  const ahead = markersDue([draws[2]], [], '2026-12-20')
  assert.equal(suggestedDrawDate(ahead, '2026-12-20'), '2027-01-15', 'with only the Oct 17 draw, T and estradiol due Jan 15 are the soonest')
  assert.equal(suggestedDrawDate(markersDue(draws, [plan(1, '2026-11-03')], TODAY).filter(d => d.planned), TODAY), null, 'nothing unbooked')
})
