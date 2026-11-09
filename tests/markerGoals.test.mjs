// Dated marker goals and their verdicts (shared/utils/markerGoals.ts) — audit #43 item 60.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cycleGoalSummary, goalLabel, goalLine, goalVerdict, goalsForCycle } from '../shared/utils/markerGoals.ts'

const goal = (over = {}) => ({ id: 1, marker: 'hematocrit', comparator: 'falling', target: null, by_date: null, cycle_id: 7, stated: '2026-10-23', note: null, created_at: 'x', ...over })
const draw = (date, markers, notes) => ({ date, markers, ...(notes ? { notes } : {}) })
// Jim's draws: Hct flat at 51.7 on Sep 9 and Oct 17; E2 up 106 → 126; the Sep 9 T is a ceiling.
const draws = [
  draw('2026-08-15', { hematocrit: 50.9, estradiol: 106, testosterone_total: 1180 }),
  draw('2026-09-09', { hematocrit: 51.7, testosterone_total: 1500 }, { testosterone_total: { date: '2026-09-09', note: 'ceiling', censored: true } }),
  draw('2026-10-17', { hematocrit: 51.7, estradiol: 126, testosterone_total: 980 })
]

test('a trend goal: flat is not falling; a drop after the goal was set is', () => {
  // Stated before the Oct 17 draw, so that draw counts: flat against Sep 9 is not falling.
  const flat = goalVerdict(goal({ stated: '2026-09-10' }), draws, '2026-11-09')
  assert.equal(flat.status, 'not-met')
  assert.equal(flat.reason, '51.7 on 2026-09-09 → 51.7 on 2026-10-17 (flat)')
  // Jim's actual goal, stated Oct 23 after that draw: nothing to judge until the next one lands.
  assert.equal(goalVerdict(goal(), draws, '2026-11-09').status, 'insufficient')
  const later = goalVerdict(goal(), [...draws, draw('2026-12-20', { hematocrit: 50.2 })], '2026-12-21')
  assert.equal(later.status, 'met')
  assert.deepEqual([later.previous.value, later.latest.value], [51.7, 50.2])
  assert.match(later.reason, /\(-1\.5\)$/)
  // Rising reads the other way.
  assert.equal(goalVerdict(goal({ marker: 'estradiol', comparator: 'rising', stated: '2026-09-10' }), draws, '2026-11-09').status, 'met')
})

test('a trend goal needs a draw after it was stated, and two readings', () => {
  const stale = goalVerdict(goal({ stated: '2026-10-20' }), draws.slice(0, 2), '2026-11-09')
  assert.equal(stale.status, 'insufficient')
  assert.match(stale.reason, /no draw since the goal was set on 2026-10-20/)
  const one = goalVerdict(goal({ stated: '2026-08-01' }), draws.slice(0, 1), '2026-08-20')
  assert.equal(one.status, 'insufficient')
  assert.match(one.reason, /only one reading/)
  assert.equal(goalVerdict(goal(), [], '2026-11-09').status, 'insufficient')
})

test('a threshold goal judges the latest usable reading; a ceiling is skipped; the deadline is named once passed', () => {
  const e2 = goalVerdict(goal({ marker: 'estradiol', comparator: 'below', target: 100 }), draws, '2026-11-09')
  assert.equal(e2.status, 'not-met')
  assert.equal(e2.reason, '126 on 2026-10-17 against under 100')
  assert.equal(goalVerdict(goal({ marker: 'estradiol', comparator: 'at_most', target: 126 }), draws, '2026-11-09').status, 'met')
  // The censored Sep 9 T is never the reading: Aug 15's 1180 is, as of Sep 10.
  const t = goalVerdict(goal({ marker: 'testosterone_total', comparator: 'below', target: 1000 }), draws, '2026-09-10')
  assert.equal(t.latest.date, '2026-08-15')
  assert.equal(t.status, 'not-met')
  assert.equal(goalVerdict(goal({ marker: 'testosterone_total', comparator: 'below', target: 1000 }), draws, '2026-11-09').status, 'met')
  const late = goalVerdict(goal({ marker: 'estradiol', comparator: 'below', target: 100, by_date: '2026-11-01' }), draws, '2026-11-09')
  assert.match(late.reason, /past the 2026-11-01 date$/)
  const inTime = goalVerdict(goal({ marker: 'estradiol', comparator: 'below', target: 100, by_date: '2027-03-01' }), draws, '2026-11-09')
  assert.doesNotMatch(inTime.reason, /past the/)
  assert.equal(goalVerdict(goal({ comparator: 'below', target: null }), draws, '2026-11-09').status, 'insufficient')
})

test('a reading drawn on a confounding medication decides nothing', () => {
  const onCourse = date => (date >= '2026-11-07' ? 'Isotretinoin' : null)
  const all = [...draws, draw('2026-12-15', { hdl: 41, hematocrit: 50.1 })]
  const hdl = goalVerdict(goal({ marker: 'hdl', comparator: 'at_least', target: 45 }), all, '2026-12-16', onCourse)
  assert.equal(hdl.status, 'confounded')
  assert.equal(hdl.confoundedBy, 'Isotretinoin')
  assert.match(hdl.reason, /drawn on Isotretinoin/)
  // Hematocrit is not a caveat marker: the same draw judges it normally.
  assert.equal(goalVerdict(goal(), all, '2026-12-16', () => null).status, 'met')
})

test('the roll-up: GO only when every goal is met, NO-GO on any miss, else UNDECIDED; labels and prompt lines', () => {
  const v = status => ({ status })
  assert.equal(cycleGoalSummary([v('met'), v('met')]).verdict, 'go')
  assert.equal(cycleGoalSummary([v('met'), v('not-met'), v('insufficient')]).verdict, 'no-go')
  assert.deepEqual(cycleGoalSummary([v('met'), v('insufficient'), v('confounded')]), { verdict: 'undecided', met: 1, notMet: 0, open: 2, total: 3 })
  assert.equal(cycleGoalSummary([]).verdict, 'undecided')
  assert.deepEqual(goalsForCycle([goal({ id: 1, cycle_id: 7 }), goal({ id: 2, cycle_id: null }), goal({ id: 3, cycle_id: 8 })], 7).map(g => g.id), [1, 2])
  assert.deepEqual(goalsForCycle([goal({ id: 1, cycle_id: 7 }), goal({ id: 2, cycle_id: null })], null).map(g => g.id), [2])
  assert.equal(goalLabel(goal(), { label: 'Hematocrit', unit: '%' }), 'Hematocrit seen falling')
  assert.equal(goalLabel(goal({ marker: 'estradiol', comparator: 'below', target: 100, by_date: '2027-03-01' }), { label: 'Estradiol', unit: 'pg/mL' }), 'Estradiol under 100 pg/mL by 2027-03-01')
  assert.equal(goalLabel(goal({ marker: 'x', comparator: 'at_least', target: 45.0 })), 'x at or over 45')
  const line = goalLine(goalVerdict(goal({ note: 'gates Primo', stated: '2026-09-10' }), draws, '2026-11-09'), { label: 'Hematocrit' })
  assert.equal(line, '- Hematocrit seen falling: NOT MET — 51.7 on 2026-09-09 → 51.7 on 2026-10-17 (flat) (gates Primo)')
})
