// Unit tests for the schedule math the digest's "Schedule check" fact lines hang off — the
// weekday resolution the model used to be left to guess at. Plain node:test + native TS type
// stripping (Node 23.6+):
//
//   node --test tests/
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextDueDay, PROTOCOL_RULES, ruleDueOn, scheduledFor, tallySchedule
} from '../shared/utils/protocolRules.ts'

// 2026-09-09 is a Wednesday; 2026-09-06 (Sun) through 2026-09-12 (Sat) is one calendar week.
const WED = '2026-09-09'

const rule = name => PROTOCOL_RULES.find(r => r.compound === name)
const doses = (pairs) => {
  const map = new Map()
  for (const [compound, date] of pairs) {
    if (!map.has(compound)) map.set(compound, new Set())
    map.get(compound).add(date)
  }
  return map
}

test('a Wednesday is due HGH and finasteride only — not testosterone or hCG', () => {
  const due = scheduledFor(WED).map(r => r.compound).sort()
  assert.deepEqual(due, ['Finasteride', 'HGH'])
  assert.equal(ruleDueOn(rule('Testosterone Cypionate'), WED), false)
  assert.equal(ruleDueOn(rule('hCG'), WED), false)
})

test('a rule past its `to` date is no longer due', () => {
  assert.equal(ruleDueOn(rule('GHK-Cu'), '2026-09-01'), true)
  assert.equal(ruleDueOn(rule('GHK-Cu'), '2026-09-02'), false)
})

test('nextDueDay walks forward from a Wednesday to Thursday (TC) and Friday (hCG)', () => {
  assert.equal(nextDueDay(rule('Testosterone Cypionate'), WED), '2026-09-10')
  assert.equal(nextDueDay(rule('hCG'), WED), '2026-09-11')
  // Strictly after `date`: a due day never returns itself.
  assert.equal(nextDueDay(rule('hCG'), '2026-09-08'), '2026-09-11')
  assert.equal(nextDueDay(rule('GHK-Cu'), WED), null)
})

test('same-day tally: an unlogged due dose is pending while the day is under way, missed once it is over', () => {
  const logged = doses([['Finasteride', WED]])
  const open = tallySchedule(PROTOCOL_RULES, WED, WED, logged, WED)
  const hgh = open.find(t => t.rule.compound === 'HGH')
  assert.equal(hgh.pending, WED)
  assert.deepEqual(hgh.missed, [])
  assert.deepEqual(open.find(t => t.rule.compound === 'Finasteride').hit, [WED])
  // Rules with nothing due today are still returned, so the prompt can say "not due today".
  assert.ok(open.some(t => t.rule.compound === 'hCG'))
  // Discontinued before the window: not in force, not returned.
  assert.equal(open.some(t => t.rule.compound === 'GHK-Cu'), false)

  const closed = tallySchedule(PROTOCOL_RULES, WED, WED, logged, '2026-09-10')
  const hghClosed = closed.find(t => t.rule.compound === 'HGH')
  assert.equal(hghClosed.pending, null)
  assert.deepEqual(hghClosed.missed, [WED])
})

test('weekly tally separates hits, misses, and a slid dose', () => {
  // Sunday hCG skipped and made up Monday; testosterone on both due days; HGH missed twice.
  const logged = doses([
    ['hCG', '2026-09-07'], ['hCG', '2026-09-08'], ['hCG', '2026-09-11'],
    ['Testosterone Cypionate', '2026-09-07'], ['Testosterone Cypionate', '2026-09-10'],
    ['HGH', '2026-09-08'], ['HGH', '2026-09-09'], ['HGH', '2026-09-10'], ['HGH', '2026-09-11'], ['HGH', '2026-09-12']
  ])
  const week = tallySchedule(PROTOCOL_RULES, '2026-09-06', '2026-09-12', logged, '2026-09-14')
  const hcg = week.find(t => t.rule.compound === 'hCG')
  assert.deepEqual(hcg.hit, ['2026-09-08', '2026-09-11'])
  assert.deepEqual(hcg.missed, ['2026-09-06'])
  assert.deepEqual(hcg.offSchedule, ['2026-09-07'])
  const tc = week.find(t => t.rule.compound === 'Testosterone Cypionate')
  assert.deepEqual(tc.hit, ['2026-09-07', '2026-09-10'])
  assert.deepEqual(tc.missed, [])
  const hgh = week.find(t => t.rule.compound === 'HGH')
  assert.deepEqual(hgh.missed, ['2026-09-06', '2026-09-07'])
  assert.equal(hgh.hit.length, 5)
})

test('a week still under way ignores future days and holds today open', () => {
  const week = tallySchedule(PROTOCOL_RULES, '2026-09-06', '2026-09-12', doses([]), WED)
  const hgh = week.find(t => t.rule.compound === 'HGH')
  assert.deepEqual(hgh.missed, ['2026-09-06', '2026-09-07', '2026-09-08'])
  assert.equal(hgh.pending, WED)
  // Friday's hCG hasn't happened yet — not a miss.
  assert.deepEqual(week.find(t => t.rule.compound === 'hCG').missed, ['2026-09-06', '2026-09-08'])
})

test('off-schedule only counts inside a rule\'s own window', () => {
  // A cycle overriding TC from Sep 7 splits the standing rule around it; a dose on Sep 8
  // belongs to the cycle rule, not to the standing segment that ended Sep 6.
  const standing = { ...rule('Testosterone Cypionate'), to: '2026-09-06' }
  const cycle = { compound: 'Testosterone Cypionate', doseLabel: '200 mg', weekdays: [1, 4], from: '2026-09-07', to: null }
  const logged = doses([['Testosterone Cypionate', '2026-09-08']])
  const week = tallySchedule([standing, cycle], '2026-09-06', '2026-09-12', logged, '2026-09-14')
  const [seg, cyc] = week
  assert.deepEqual(seg.offSchedule, [])
  assert.deepEqual(cyc.offSchedule, ['2026-09-08'])
  assert.deepEqual(cyc.missed, ['2026-09-07', '2026-09-10'])
})
