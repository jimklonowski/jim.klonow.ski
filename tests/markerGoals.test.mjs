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
  const hdl = goalVerdict(goal({ marker: 'hdl', comparator: 'at_least', target: 45 }), all, '2026-12-16', { confoundedBy: onCourse })
  assert.equal(hdl.status, 'confounded')
  assert.equal(hdl.confoundedBy, 'Isotretinoin')
  assert.match(hdl.reason, /drawn on Isotretinoin/)
  // Hematocrit is not a caveat marker: the same draw judges it normally.
  assert.equal(goalVerdict(goal(), all, '2026-12-16', { confoundedBy: () => null }).status, 'met')
})

// --- the hematocrit page's own rules (audit #44 item 16) ---
// The T cut of Aug 24 and the hCG cut of Oct 24, each with its 120-day turnover window.
const windows = [
  { from: '2026-08-24', to: '2026-12-21', change: 'T 100→75 mg' },
  { from: '2026-10-24', to: '2027-02-20', change: 'hCG 300→250 IU Tue+Fri' }
]
const visit = (date, id = 1) => ({ id, date, kind: 'therapeutic', ml: 500, pre_hgb: null, notes: null, created_at: 'x' })

test('a red-cell reading inside a turnover window is TOO EARLY, not NOT MET, and names the first clean read', () => {
  const under50 = goal({ comparator: 'below', target: 50 })
  // Without the windows, the Oct 17 reading (54 days after the T cut) fails the goal outright.
  assert.equal(goalVerdict(under50, draws, '2026-11-09').status, 'not-met')
  const v = goalVerdict(under50, draws, '2026-11-09', { windows })
  assert.equal(v.status, 'too-early')
  assert.equal(v.cleanFrom, '2027-02-21', 'the day after the later window closes')
  assert.equal(v.reason, '51.7 on 2026-10-17: 54 days after T 100→75 mg — red cells turn over on a ~120-day cycle, so this reading cannot yet show that change\'s full effect — it decides nothing; first clean read from 2027-02-21')
  assert.equal(goalLine(v, { label: 'Hematocrit', unit: '%' }), `- Hematocrit under 50 %: TOO EARLY — ${v.reason}`)
  // A reading that already meets the goal inside the window decides nothing either.
  assert.equal(goalVerdict(goal({ comparator: 'below', target: 52 }), draws, '2026-11-09', { windows }).status, 'too-early')

  // The late-December draw falls in the hCG window: a drop there is still too early to call.
  const dec = [...draws, draw('2026-12-28', { hematocrit: 50.2 })]
  const falling = goalVerdict(goal(), dec, '2026-12-29', { windows })
  assert.equal(falling.status, 'too-early')
  assert.match(falling.reason, /^50\.2 on 2026-12-28: 65 days after hCG 300→250 IU Tue\+Fri — /)
  assert.equal(cycleGoalSummary([falling]).verdict, 'undecided')

  // The first draw past the window is a clean read, compared with the reading before it: a
  // transitional reading is still a true level, so December's 50.2 is what February is read against.
  const feb = [...dec, draw('2027-02-25', { hematocrit: 49.8 })]
  const clean = goalVerdict(goal(), feb, '2027-02-26', { windows })
  assert.equal(clean.status, 'met')
  assert.deepEqual([clean.previous.date, clean.latest.date, clean.cleanFrom], ['2026-12-28', '2027-02-25', null])
  assert.equal(clean.reason, '50.2 on 2026-12-28 → 49.8 on 2027-02-25 (-0.4)')

  // The window has closed but no draw has landed since: the old reading still decides nothing,
  // and a draw now would.
  const stale = goalVerdict(under50, dec, '2027-03-01', { windows })
  assert.equal(stale.status, 'too-early')
  assert.equal(stale.cleanFrom, null)
  assert.match(stale.reason, /it decides nothing; a draw from today on is a clean read$/)
})

test('a verdict that is waiting says when the next clean read is; a marker the windows do not touch is read as before', () => {
  // Jim's goal, stated Oct 23 after the last draw: nothing to judge yet — and a draw before
  // Feb 21 would not judge it either.
  const waiting = goalVerdict(goal(), draws, '2026-11-09', { windows })
  assert.equal(waiting.status, 'insufficient')
  assert.equal(waiting.reason, 'no draw since the goal was set on 2026-10-23 — next clean read from 2027-02-21')
  assert.equal(goalVerdict(goal(), [], '2026-11-09', { windows }).reason, 'no usable reading on file — next clean read from 2027-02-21')
  // A clean reading from before the cuts that misses the goal: NOT MET, with the same note.
  const early = [draw('2026-08-15', { hematocrit: 50.9 })]
  const notYet = goalVerdict(goal({ comparator: 'below', target: 50 }), early, '2026-11-09', { windows })
  assert.equal(notYet.status, 'not-met')
  assert.equal(notYet.reason, '50.9 on 2026-08-15 against under 50 — next clean read from 2027-02-21')
  // …and one that meets it says nothing more.
  assert.equal(goalVerdict(goal({ comparator: 'below', target: 51 }), early, '2026-11-09', { windows }).reason, '50.9 on 2026-08-15 against under 51')
  // Estradiol is not a red-cell marker: no window, no note.
  const e2 = goalVerdict(goal({ marker: 'estradiol', comparator: 'below', target: 100 }), draws, '2026-11-09', { windows, phlebotomies: [visit('2026-10-01')] })
  assert.deepEqual([e2.status, e2.cleanFrom, e2.reason], ['not-met', null, '126 on 2026-10-17 against under 100'])
})

test('a CBC or ferritin in the weeks after a phlebotomy is TOO EARLY, and a trend is never measured from one', () => {
  const phlebotomies = [visit('2027-03-01')]
  const all = [
    draw('2027-02-25', { hematocrit: 49.8, ferritin: 60 }),
    draw('2027-03-20', { hematocrit: 47, ferritin: 31 }), // 19 days after the visit
    draw('2027-05-10', { hematocrit: 49, ferritin: 44 }) // 70 days after: clean
  ]
  // On Mar 21 the low reading is the blood taken out: it does not meet "under 50", it waits.
  const low = goalVerdict(goal({ comparator: 'below', target: 50 }), all, '2027-03-21', { phlebotomies })
  assert.equal(low.status, 'too-early')
  assert.equal(low.cleanFrom, '2027-04-27', '57 days after the visit')
  assert.match(low.reason, /^47 on 2027-03-20: 19 days after the 2027-03-01 therapeutic phlebotomy — a lower reading here is the blood taken out/)
  const fer = goalVerdict(goal({ marker: 'ferritin', comparator: 'at_least', target: 40 }), all, '2027-03-21', { phlebotomies })
  assert.equal(fer.status, 'too-early')
  assert.match(fer.reason, /the iron that left with the blood/)
  // In May the reading is clean, and it is compared with February's — not with the hole in March,
  // from which any reading would look like a rise.
  const rising = goalVerdict(goal({ comparator: 'rising', stated: '2027-02-01' }), all, '2027-05-11', { phlebotomies })
  assert.equal(rising.previous.date, '2027-02-25')
  assert.equal(rising.status, 'not-met')
  assert.equal(goalVerdict(goal({ comparator: 'falling', stated: '2027-02-01' }), all, '2027-05-11', { phlebotomies }).status, 'met')
  // Without the log, the same draws read March → May as a rise.
  assert.equal(goalVerdict(goal({ comparator: 'rising', stated: '2027-02-01' }), all, '2027-05-11').status, 'met')
})

test('the roll-up: GO only when every goal is met, NO-GO on any miss, else UNDECIDED; labels and prompt lines', () => {
  const v = status => ({ status })
  assert.equal(cycleGoalSummary([v('met'), v('met')]).verdict, 'go')
  assert.equal(cycleGoalSummary([v('met'), v('not-met'), v('insufficient')]).verdict, 'no-go')
  assert.deepEqual(cycleGoalSummary([v('met'), v('insufficient'), v('confounded')]), { verdict: 'undecided', met: 1, notMet: 0, open: 2, total: 3 })
  assert.deepEqual(cycleGoalSummary([v('met'), v('too-early')]), { verdict: 'undecided', met: 1, notMet: 0, open: 1, total: 2 })
  assert.equal(cycleGoalSummary([]).verdict, 'undecided')
  assert.deepEqual(goalsForCycle([goal({ id: 1, cycle_id: 7 }), goal({ id: 2, cycle_id: null }), goal({ id: 3, cycle_id: 8 })], 7).map(g => g.id), [1, 2])
  assert.deepEqual(goalsForCycle([goal({ id: 1, cycle_id: 7 }), goal({ id: 2, cycle_id: null })], null).map(g => g.id), [2])
  assert.equal(goalLabel(goal(), { label: 'Hematocrit', unit: '%' }), 'Hematocrit seen falling')
  assert.equal(goalLabel(goal({ marker: 'estradiol', comparator: 'below', target: 100, by_date: '2027-03-01' }), { label: 'Estradiol', unit: 'pg/mL' }), 'Estradiol under 100 pg/mL by 2027-03-01')
  assert.equal(goalLabel(goal({ marker: 'x', comparator: 'at_least', target: 45.0 })), 'x at or over 45')
  const line = goalLine(goalVerdict(goal({ note: 'gates Primo', stated: '2026-09-10' }), draws, '2026-11-09'), { label: 'Hematocrit' })
  assert.equal(line, '- Hematocrit seen falling: NOT MET — 51.7 on 2026-09-09 → 51.7 on 2026-10-17 (flat) (gates Primo)')
})
