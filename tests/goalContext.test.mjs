// The marker-goals prompt block (server/utils/goalContext.ts) — audit #43 item 60: the verdicts
// the pages compute, rendered for the model, with a course-confounded reading marked as such.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markerGoalsContext } from '../server/utils/goalContext.ts'

const primo = { id: 7, name: 'Primo spring', start_date: '2027-04-05', start_precision: 'day', planned_weeks: 16, planned_days: null, actual_end: null, goal: null, notes: null, compounds: '[]' }
const goals = [
  { id: 1, marker: 'hematocrit', comparator: 'falling', target: null, by_date: null, cycle_id: 7, stated: '2026-10-23', note: 'the decision waits on this', created_at: 'x' },
  { id: 2, marker: 'estradiol', comparator: 'below', target: 100, by_date: '2027-03-01', cycle_id: 7, stated: '2026-10-23', note: null, created_at: 'x' },
  { id: 3, marker: 'hdl', comparator: 'at_least', target: 45, by_date: null, cycle_id: null, stated: '2026-10-23', note: null, created_at: 'x' }
]
const labs = [
  { date: '2026-09-09', markers: JSON.stringify({ hematocrit: 51.7, hdl: 48 }), qualitative: null },
  { date: '2026-10-17', markers: JSON.stringify({ hematocrit: 51.7, estradiol: 126 }), qualitative: null },
  { date: '2026-12-15', markers: JSON.stringify({ hdl: 41, triglycerides: 140 }), qualitative: null }
]
// The protocol: isotretinoin running from Nov 7 (a logged rule), nothing else of note.
const protocol = { rules: [{ compound: 'Isotretinoin', doseLabel: '40 mg', weekdays: [0, 1, 2, 3, 4, 5, 6], from: '2026-11-07' }], standing: [], asNeeded: [], supplements: [], source: 'tables' }

function fakeDb({ goals = [], cycles = [], labs = [], phlebotomies = [] }) {
  return {
    prepare: (sql) => {
      const stmt = {
        bind: () => stmt,
        all: async () => ({ results: /FROM marker_goals/.test(sql) ? goals : /FROM cycles/.test(sql) ? cycles : /FROM labs_entries/.test(sql) ? labs : /FROM phlebotomies/.test(sql) ? phlebotomies : [] })
      }
      return stmt
    }
  }
}

test('no goals → nothing; goals → each verdict, the cycle roll-up, and the standing list', async () => {
  assert.equal(await markerGoalsContext(fakeDb({}), '2026-11-09', protocol), '')
  const text = await markerGoalsContext(fakeDb({ goals, cycles: [primo], labs }), '2026-11-09', protocol)
  // The trend goal was stated Oct 23, after the last draw: undecided until the next one lands.
  // Sep 9's HDL 48 meets the standing goal; E2 misses; the Hct trend waits on a new draw.
  assert.match(text, /^Gating goals for the planned cycle "Primo spring" \(start 2027-04-05\) — verdict as of 2026-11-09: NO-GO \(1 met, 1 not met, 1 undecided\):/)
  assert.match(text, /- Hematocrit seen falling: INSUFFICIENT — no draw since the goal was set on 2026-10-23 \(the decision waits on this\)/)
  assert.match(text, /- Estradiol under 100 pg\/mL by 2027-03-01: NOT MET — 126 on 2026-10-17 against under 100/)
  // The standing HDL goal rides with the cycle (it gates every cycle) and lists on its own too.
  assert.match(text, /- HDL at or over 45 mg\/dL: MET — 48 on 2026-09-09 against at or over 45/)
  assert.match(text, /Standing marker goals, verdict as of 2026-11-09:\n- HDL/)
  assert.match(text, /report them as given/)
})

test('a reading drawn on the course is CONFOUNDED, and a done cycle\'s goals are not narrated', async () => {
  const text = await markerGoalsContext(fakeDb({ goals, cycles: [primo], labs }), '2026-12-16', protocol)
  assert.match(text, /- HDL at or over 45 mg\/dL: CONFOUNDED — 41 on 2026-12-15 was drawn on Isotretinoin, which moves this marker — it decides nothing/)
  assert.match(text, /NO-GO \(0 met, 1 not met, 2 undecided\)/, 'confounded counts as undecided, never as a miss')
  const done = { ...primo, start_date: '2025-01-05' }
  const old = await markerGoalsContext(fakeDb({ goals: goals.slice(0, 2), cycles: [done], labs }), '2026-11-09', protocol)
  assert.equal(old, '', 'goals of a finished cycle, and no standing ones: nothing to say')
})

test('a red-cell reading inside a turnover window or after a phlebotomy is TOO EARLY, by the pages\' own windows (audit #44 item 16)', async () => {
  // The schedule with its two cuts: T on Aug 24, hCG on Oct 24.
  const rule = (compound, from, to, doseLabel, weekdays = [1, 4]) => ({ compound, doseLabel, weekdays, from, to })
  const cuts = {
    ...protocol,
    rules: [
      rule('Testosterone Cypionate', '2026-01-01', '2026-08-23', '100 mg'),
      rule('Testosterone Cypionate', '2026-08-24', undefined, '75 mg'),
      rule('hCG', '2026-01-01', '2026-10-23', '300 IU', [0, 2, 5]),
      rule('hCG', '2026-10-24', undefined, '250 IU', [2, 5])
    ]
  }
  const hct = [goals[0]]
  const withDec = [...labs.slice(0, 2), { date: '2026-12-28', markers: JSON.stringify({ hematocrit: 50.2 }), qualitative: null }]
  const text = await markerGoalsContext(fakeDb({ goals: hct, cycles: [primo], labs: withDec }), '2026-12-29', cuts)
  assert.match(text, /verdict as of 2026-12-29: UNDECIDED \(0 met, 0 not met, 1 undecided\)/)
  assert.match(text, /- Hematocrit seen falling: TOO EARLY — 50\.2 on 2026-12-28: 65 days after hCG 300→250 IU Tue\+Fri — .* — it decides nothing; first clean read from 2027-02-21 \(the decision waits on this\)/)
  assert.match(text, /MET \/ NOT MET \/ INSUFFICIENT \/ CONFOUNDED \/ TOO EARLY/)
  assert.match(text, /a draw before that date will not decide the goal/)

  // Before that draw lands, the waiting goal already says when a draw would count.
  const before = await markerGoalsContext(fakeDb({ goals: hct, cycles: [primo], labs: labs.slice(0, 2) }), '2026-11-09', cuts)
  assert.match(before, /- Hematocrit seen falling: INSUFFICIENT — no draw since the goal was set on 2026-10-23 — next clean read from 2027-02-21/)

  // Past the windows, a visit on file still holds a reading taken soon after it; one logged
  // after `asOf` is not known to a summary written for that day.
  const spring = [...withDec, { date: '2027-02-25', markers: JSON.stringify({ hematocrit: 49.8 }), qualitative: null }, { date: '2027-03-20', markers: JSON.stringify({ hematocrit: 47 }), qualitative: null }]
  const visits = [{ id: 1, date: '2027-03-01', kind: 'therapeutic', ml: 500, pre_hgb: null, notes: null, created_at: 'x' }]
  const after = await markerGoalsContext(fakeDb({ goals: hct, cycles: [primo], labs: spring, phlebotomies: visits }), '2027-03-21', cuts)
  assert.match(after, /TOO EARLY — 47 on 2027-03-20: 19 days after the 2027-03-01 therapeutic phlebotomy/)
  const asOfFeb = await markerGoalsContext(fakeDb({ goals: hct, cycles: [primo], labs: spring, phlebotomies: visits }), '2027-02-26', cuts)
  assert.match(asOfFeb, /- Hematocrit seen falling: MET — 50\.2 on 2026-12-28 → 49\.8 on 2027-02-25 \(-0\.4\)/)
})
