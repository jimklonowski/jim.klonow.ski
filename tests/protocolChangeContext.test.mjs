// The protocol-change watch as prompt context (server/utils/protocolChangeContext.ts) — audit
// #43 item 67.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { protocolChangeContext } from '../server/utils/protocolChangeContext.ts'
import { shiftDays } from '../shared/utils/dates.ts'

const rule = (compound, from, to, doseLabel, weekdays = [1, 4]) => ({ compound, doseLabel, weekdays, from, to })
const rules = [
  rule('hCG', '2026-01-01', '2026-10-23', '300 IU', [0, 2, 5]),
  rule('hCG', '2026-10-24', null, '250 IU', [2, 5])
]
const journal = [
  ...Array.from({ length: 28 }, (_, i) => ({ date: shiftDays('2026-09-26', i), bp_systolic: 130, weight_lbs: 170, rhr: null, hrv: null })),
  ...Array.from({ length: 14 }, (_, i) => ({ date: shiftDays('2026-10-28', i), bp_systolic: 138, weight_lbs: 173.5, rhr: null, hrv: null }))
]
function fakeDb(j = journal, h = []) {
  return {
    prepare: (sql) => {
      const stmt = { bind: () => stmt, all: async () => ({ results: /FROM journal_entries/.test(sql) ? j : h }) }
      return stmt
    }
  }
}

test('one line: the change, how long ago, flagged/watch moves with direction, the steady ones', async () => {
  const text = await protocolChangeContext(fakeDb(), '2026-11-10', rules)
  assert.match(text, /^PROTOCOL CHANGE WATCH — since hCG 300→250 IU Tue\+Fri \(2026-10-24, 17 days ago\): /)
  assert.match(text, /(watch|FLAGGED): Systolic BP \+8 mmHg/)
  assert.match(text, /(watch|FLAGGED): Weight \+3\.5 lbs/)
  assert.match(text, /noise-thresholded/)
  assert.equal(await protocolChangeContext(fakeDb(), '2026-11-10', []), '', 'no dated change')
  assert.equal(await protocolChangeContext(fakeDb([], []), '2026-11-10', rules), '', 'nothing measured on either side')
})
