// The isotretinoin course as prompt context (server/utils/accutaneContext.ts) — audit #43
// item 97: the page's own arithmetic, rendered for the model, with the lipid window and targets.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// loadPlannedDraws maps rows through parsePlannedDrawRow, a Nitro auto-import (server/utils/db.ts)
// that plain node doesn't provide; without it the loader's try/catch quietly returned no plans.
globalThis.parsePlannedDrawRow = row => ({ ...row, fasting: !!row.fasting })
const { accutaneContext } = await import('../server/utils/accutaneContext.ts')

const course = { id: 4, name: 'Isotretinoin Course', start_date: '2026-11-07', start_precision: 'day', planned_weeks: 41, planned_days: null, actual_end: null, goal: null, notes: null, compounds: JSON.stringify([{ compound: 'Isotretinoin', dose: 40, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 1, toWeek: 41 }]) }
const capsule = (date, mg = 40) => ({ date, peptides: JSON.stringify([{ compound: 'Isotretinoin', dose: mg, unit: 'mg' }]) })
const labs = [{ date: '2026-10-17', markers: JSON.stringify({ triglycerides: 71, ldl: 102, alt: 22 }), qualitative: null }]

function fakeDb({ cycles = [], journal = [], weight = null, labs: labRows = [], plans = [] }) {
  return {
    prepare: (sql) => {
      const stmt = {
        bind: () => stmt,
        all: async () => ({ results: /FROM cycles/.test(sql) ? cycles : /peptides IS NOT NULL/.test(sql) ? journal : /FROM labs_entries/.test(sql) ? labRows : /FROM planned_draws/.test(sql) ? plans : [] }),
        first: async () => (/weight_lbs IS NOT NULL/.test(sql) ? weight : null)
      }
      return stmt
    }
  }
}

test('no dated course → nothing; a running course → day, dose, cumulative vs targets, baseline, recheck, the lipid window', async () => {
  assert.equal(await accutaneContext(fakeDb({})), '')
  assert.equal(await accutaneContext(fakeDb({ cycles: [{ ...course, start_precision: 'quarter' }] }), '2026-11-20'), '', 'a tentative course has no dates')
  const journal = ['07', '08', '09', '10', '11', '12', '13', '14'].map(d => capsule(`2026-11-${d}`))
  const text = await accutaneContext(fakeDb({ cycles: [course], journal, weight: { date: '2026-11-10', weight_lbs: 170.5 }, labs }), '2026-11-14')
  assert.match(text, /^ISOTRETINOIN COURSE — DAY 8, WEEK 2 \(started 2026-11-07, planned through 2027-08-20\)\./)
  assert.match(text, /Dose: 40 mg a day as last logged \(2026-11-14\); pace 40 mg a day over the last 8 days; 8 of 8 days dosed\./)
  assert.match(text, /Cumulative: 320 mg = 4\.1 mg\/kg at 77\.3 kg\. Targets: 150 mg\/kg = 11595 mg \(2\.8 % there, at this pace reached 2027-08-\d\d\); 220 mg\/kg = 17006 mg \(at this pace 2028-\d\d-\d\d\)\./)
  assert.match(text, /Baseline lipids and liver: the 2026-10-17 draw\./)
  assert.match(text, /First recheck .* due in course days 14–70 \(2026-11-21 to 2027-01-16\); none is on file or booked\./)
  assert.match(text, /Lipid\/liver window: weeks 4–8 \(2026-11-28 to 2027-01-01\), still ahead\./)
  assert.match(text, /no clean baseline for the Primobolan decision while the course runs/)
  assert.match(text, /No blood donation during the course or for 30 days after the last capsule \(2027-09-19\)/)
})

test('inside the window it says open; a booked recheck is named; an upcoming course says when; a long-finished one is silent', async () => {
  const journal = Array.from({ length: 40 }, (_, i) => capsule(new Date(Date.UTC(2026, 10, 7 + i)).toISOString().slice(0, 10)))
  const open = await accutaneContext(fakeDb({ cycles: [course], journal, weight: { date: '2026-11-10', weight_lbs: 170.5 }, labs, plans: [{ id: 1, date: '2026-12-15', lab: 'Quest', panel: null, fasting: 1, purpose: null, cycle_id: 4, checkpoint_key: null, labs_date: null, created_at: '2026-11-01T00:00:00Z' }] }), '2026-12-16')
  assert.match(open, /DAY 40, WEEK 6/)
  assert.match(open, /First recheck: booked for 2026-12-15 \(overdue\)\./)
  assert.match(open, /Lipid\/liver window: .* open now\./)
  const ahead = await accutaneContext(fakeDb({ cycles: [course], labs }), '2026-11-01')
  assert.match(ahead, /^ISOTRETINOIN COURSE — STARTS 2026-11-07 \(6 days away\), planned 40 mg a day\./)
  assert.match(ahead, /Baseline lipids and liver: the 2026-10-17 draw\./)
  assert.doesNotMatch(ahead, /Cumulative/)
  const done = { ...course, start_date: '2025-01-05' }
  assert.equal(await accutaneContext(fakeDb({ cycles: [done] }), '2026-11-14'), '')
})
