// Injection-relative draw timing as shown (shared/utils/drawTimingView.ts) — audit #43 item 61.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawTimingChips, plannedTimingRows, scheduledDaysBefore, usualDrawDates } from '../shared/utils/drawTimingView.ts'

// T on Mondays and Thursdays at 07:30, hCG Tue/Fri, through September 2026.
const shot = (date, compound, dose, unit, time = '07:30') => ({ date, peptides: [{ compound, dose, unit, time }] })
const journal = []
for (let d = new Date('2026-08-03T12:00:00Z'); d <= new Date('2026-10-20T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
  const iso = d.toISOString().slice(0, 10)
  const dow = d.getUTCDay()
  if (dow === 1 || dow === 4) journal.push(shot(iso, 'Testosterone Cypionate', 75, 'mg'))
  if (dow === 2 || dow === 5) journal.push(shot(iso, 'hCG', 250, 'iu'))
}
const rules = [
  { compound: 'Testosterone Cypionate', doseLabel: '75 mg', weekdays: [1, 4], from: '2026-08-01' },
  { compound: 'hCG', doseLabel: '250 IU', weekdays: [2, 5], from: '2026-08-01' }
]

test('a draw gets one chip per modeled compound: hours since the shot and % of the recent peak', () => {
  // Wed 2026-09-09: T on Mon 7 07:30 → ~48.5 h; hCG on Tue 8 → ~24.5 h.
  const chips = drawTimingChips(journal, '2026-09-09')
  const t = chips.find(c => c.short === 'T')
  const hcg = chips.find(c => c.short === 'hCG')
  assert.equal(t.hours, 48)
  assert.match(t.text, /^48 h after T · ≈\d+ % of peak$/)
  assert.equal(hcg.hours, 24)
  assert.ok(hcg.timing.pctOfRecentPeak > 50, 'a day after a 33 h-half-life peptide is still high')
  assert.equal(chips.length, 2)
  // Nothing logged → nothing to say.
  assert.deepEqual(drawTimingChips([], '2026-09-09'), [])
})

test('the last scheduled shot before a morning draw: a same-day shot comes after the draw', () => {
  assert.deepEqual(scheduledDaysBefore([1, 4], '2026-09-09'), { days: 2, weekday: 'Mon' }) // Wed
  assert.deepEqual(scheduledDaysBefore([1, 4], '2026-09-10'), { days: 3, weekday: 'Mon' }) // Thu: the Thu shot is after the draw
  assert.deepEqual(scheduledDaysBefore([1, 4], '2026-09-11'), { days: 1, weekday: 'Thu' }) // Fri
  assert.deepEqual(scheduledDaysBefore([1], '2026-09-14'), { days: 7, weekday: 'Mon' }) // Mon, weekly
  assert.equal(scheduledDaysBefore([], '2026-09-09'), null)
})

test('a planned date is compared with past draws: usual day, or earlier/later with the direction it skews', () => {
  const drawDates = ['2026-08-19', '2026-09-09', '2026-10-14'] // all Wednesdays: ~2 d after Monday's T
  // Another Wednesday: like past draws.
  const wed = plannedTimingRows(rules, journal, drawDates, '2026-10-21')
  const t = wed.find(r => r.short === 'T')
  assert.deepEqual(t.projected, { days: 2, weekday: 'Mon' })
  assert.deepEqual(t.past, [2, 2, 2])
  assert.equal(t.match, 'matches')
  assert.equal(t.text, 'T: 2 d after the Mon shot — past draws 2–2 d → like past draws')
  // A Friday: one day after Thursday's shot — earlier than the usual two, so T reads higher.
  const fri = plannedTimingRows(rules, journal, drawDates, '2026-10-23').find(r => r.short === 'T')
  assert.equal(fri.match, 'earlier')
  assert.match(fri.text, /1 d after the Thu shot — past draws 2–2 d → earlier than usual, so expect higher T$/)
  // A Monday: seven days out from the last T — later, lower.
  const mon = plannedTimingRows(rules, journal, drawDates, '2026-10-26').find(r => r.short === 'T')
  assert.equal(mon.projected.days, 4, 'Thursday\'s shot, not the same-day Monday one')
  assert.equal(mon.match, 'later')
  // hCG rides along; with no draw history it says so.
  assert.equal(plannedTimingRows(rules, journal, [], '2026-10-21').find(r => r.short === 'hCG').match, 'no history')
  // A compound with no rule on that date is not a row.
  assert.deepEqual(plannedTimingRows([], journal, drawDates, '2026-10-21'), [])
  // The nearest dates that land on the usual day for every compound, nearest first: Saturday
  // (2 d after Thu's T, 1 d after Fri's hCG — the Wednesday pattern exactly) beats Wednesday 21.
  const usual = usualDrawDates(rules, journal, drawDates, '2026-10-23')
  assert.equal(usual[0], '2026-10-24')
  assert.ok(usual.includes('2026-10-21'))
  assert.ok(!usual.includes('2026-10-23'), 'never the date itself')
})
