// Unit tests for the planned-vs-logged scorer (app/utils/adherence.ts), audit #42 item 43. The
// module imports through Nuxt's aliases, resolved for node by tests/_setup/loader.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adherencePctClass, cadenceLabel, computeAdherence, cycleAdherence, effectiveRules } from '../app/utils/adherence.ts'
import { PROTOCOL_RULES } from '../shared/utils/protocolRules.ts'

// Friday 2026-10-23: the weeks in view start on Sundays Oct 11 and Oct 18.
const TODAY = '2026-10-23'
const rule = (compound, weekdays, over = {}) => ({ compound, doseLabel: '1 mg', weekdays, from: '2026-01-01', to: null, ...over })
const dosed = (compound, ...dates) => dates.map(date => ({ date, peptides: [{ compound, dose: 1, unit: 'mg' }] }))

test('the cadence reads Monday-first', () => {
  assert.equal(cadenceLabel(rule('A', [0, 1, 2, 3, 4, 5, 6])), 'DAILY')
  assert.equal(cadenceLabel(rule('A', [4, 1])), 'MON+THU')
  assert.equal(cadenceLabel(rule('A', [0, 6])), 'SAT+SUN')
})

test('the percentage colours: accent from 90, dim from 70, warn below, muted with nothing expected', () => {
  assert.equal(adherencePctClass(null), 'text-muted')
  assert.equal(adherencePctClass(90), 'text-accent')
  assert.equal(adherencePctClass(89), 'text-dim')
  assert.equal(adherencePctClass(70), 'text-dim')
  assert.equal(adherencePctClass(69), 'text-warn')
})

test('a dose slid off its weekday still scores: dose-DAYS against the week\'s expected count, hits capped per week', () => {
  // Mon+Thu. Week 1: Mon 12 dosed, Thu 15 slid to Fri 16. Week 2: Mon 19 dosed, Thu 22 missed, today Fri not due.
  const rows = computeAdherence(dosed('A', '2026-10-12', '2026-10-16', '2026-10-19'), TODAY, 2, [rule('A', [1, 4])])
  assert.equal(rows.length, 1)
  const [a] = rows
  assert.deepEqual(a.weeks.map(w => [w.weekStart, w.expected, w.actual, w.partial]), [
    ['2026-10-11', 2, 2, false],
    ['2026-10-18', 2, 1, true]
  ])
  assert.equal(a.pct, 75)
  assert.deepEqual(a.status, { kind: 'overdue', label: 'THU MISSED' })
  assert.equal(a.cadence, 'MON+THU')

  // The missed Thursday taken today: covered (slid, not skipped), and the next due day is named.
  const caught = computeAdherence(dosed('A', '2026-10-12', '2026-10-16', '2026-10-19', TODAY), TODAY, 2, [rule('A', [1, 4])])[0]
  assert.equal(caught.pct, 100)
  assert.deepEqual(caught.status, { kind: 'next', label: 'NEXT MON' })

  // Three doses in a one-a-week cadence cannot paper over the following week's miss.
  const padded = computeAdherence(dosed('E', '2026-10-12', '2026-10-13', '2026-10-14'), TODAY, 2, [rule('E', [1])])[0]
  assert.deepEqual(padded.weeks.map(w => [w.expected, w.actual]), [[1, 3], [1, 0]])
  assert.equal(padded.pct, 50)
})

test('today is never a miss while it can still be dosed, and the status says what is due', () => {
  // Due today (Fri) and taken: done.
  assert.deepEqual(computeAdherence(dosed('B', TODAY), TODAY, 1, [rule('B', [5])])[0].status, { kind: 'done', label: '✓ TODAY' })
  // Due today, last Friday taken, today not yet: due.
  const due = computeAdherence(dosed('D', '2026-10-16'), TODAY, 2, [rule('D', [5])])[0]
  assert.deepEqual(due.status, { kind: 'due', label: 'DUE TODAY' })
  assert.deepEqual(due.weeks.map(w => [w.expected, w.actual]), [[1, 1], [0, 0]], 'today is not expected until it is logged')
  assert.equal(due.pct, 100)
  // Due today AND last Friday never covered: overdue, worded for today.
  assert.deepEqual(computeAdherence([], TODAY, 2, [rule('C', [5])])[0].status, { kind: 'overdue', label: 'DUE TODAY' })
  // Nothing scheduled in the coming week: the dash.
  assert.deepEqual(computeAdherence([], TODAY, 1, [rule('F', [1], { from: '2026-11-01' })], { includeInactive: true })[0].status, { kind: 'next', label: '—' })
})

test('inactive rules are filtered unless asked for, and a rule with nothing expected has no percentage', () => {
  const over = rule('G', [1], { to: '2026-09-30' })
  assert.equal(computeAdherence([], TODAY, 2, [over]).length, 0)
  const kept = computeAdherence([], TODAY, 2, [over], { includeInactive: true })
  assert.equal(kept.length, 1)
  assert.equal(kept[0].pct, null, 'its window ended before the weeks in view')
  assert.equal(effectiveRules([]), PROTOCOL_RULES, 'no cycles: the standing schedule itself')
  const loaded = [rule('L', [1])]
  assert.equal(effectiveRules([], loaded), loaded, 'the loaded schedule when one is passed (useProtocol)')
})

test('a cycle is scored from its first week through today, finished runs included', () => {
  const cycle = {
    name: 'Daily C',
    start_date: '2026-10-12',
    planned_weeks: 2,
    compounds: [{ compound: 'C', dose: 10, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 1 }]
  }
  const every = dosed('C', ...Array.from({ length: 12 }, (_, i) => `2026-10-${12 + i}`))
  const full = cycleAdherence(every, cycle, TODAY)
  assert.equal(full.rows.length, 1)
  assert.equal(full.rows[0].doseLabel, '10 mg')
  assert.equal(full.rows[0].weeks.length, 2, 'the cycle\'s first week through this one')
  assert.equal(full.pct, 100)
  const oneMiss = cycleAdherence(every.filter(e => e.date !== '2026-10-15'), cycle, TODAY)
  assert.equal(oneMiss.pct, 92, '11 of 12 expected days')
  // A finished cycle still scores (its rules are inactive today).
  const done = cycleAdherence(every, { ...cycle, start_date: '2026-09-01', actual_end: '2026-09-14' }, TODAY)
  assert.equal(done.rows.length, 1)
  assert.equal(done.pct, 0, 'nothing logged in its fortnight')
})
