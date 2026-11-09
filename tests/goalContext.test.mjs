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

function fakeDb({ goals = [], cycles = [], labs = [] }) {
  return {
    prepare: (sql) => {
      const stmt = {
        bind: () => stmt,
        all: async () => ({ results: /FROM marker_goals/.test(sql) ? goals : /FROM cycles/.test(sql) ? cycles : /FROM labs_entries/.test(sql) ? labs : [] })
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
