// The home page's readiness cue (shared/utils/readiness.ts) — audit #43 item 74.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hrvBaseline, loadRatio, readiness } from '../shared/utils/readiness.ts'
import { shiftDays } from '../shared/utils/dates.ts'

const TODAY = '2026-11-12'
/** `days` days ending the day before TODAY, with `value(n)` for the n-th day back (1 = yesterday). */
const back = (days, value) => Array.from({ length: days }, (_, i) => ({ date: shiftDays(TODAY, -(i + 1)), ...value(i + 1) }))
// A month of strain at 10, the last week at `recent`.
const strain = recent => back(28, n => ({ strain: n <= 7 ? recent : 10 }))
// A month of HRV alternating 48/52 (mean 50, SD ≈ 2.04), then today's reading.
const hrv = today => [...back(28, n => ({ hrv: n % 2 ? 48 : 52 })), { date: TODAY, hrv: today }]

test('the load ratio is the last 7 days against the last 28, both ending yesterday', () => {
  const l = loadRatio([...strain(16), { date: TODAY, strain: 21 }], TODAY)
  assert.equal(l.acute, 16)
  assert.equal(l.chronic, (7 * 16 + 21 * 10) / 28)
  assert.equal(l.ratio.toFixed(2), '1.39', 'today\'s 21, still being earned, is not in it')
  assert.deepEqual([l.acuteDays, l.chronicDays], [7, 28])
  assert.equal(loadRatio(back(13, () => ({ strain: 10 })), TODAY), null, 'thirteen days is not a month')
  assert.equal(loadRatio(back(28, n => ({ strain: n > 4 ? 10 : null })), TODAY), null, 'three recent days is not a week')
  assert.equal(loadRatio([], TODAY), null)
})

test('HRV is read against the 28 days before the reading', () => {
  const h = hrvBaseline(hrv(44), TODAY)
  assert.equal(h.value, 44)
  assert.equal(h.mean, 50)
  assert.equal(h.n, 28)
  assert.ok(h.z < -2.9 && h.z > -3, `${h.z}`)
  assert.equal(hrvBaseline(hrv(44).filter(e => e.date !== TODAY), TODAY).date, shiftDays(TODAY, -1), 'no reading today → yesterday\'s')
  assert.equal(hrvBaseline(hrv(44).filter(e => e.date < shiftDays(TODAY, -1)), TODAY), null, 'two days old is not this morning')
  assert.equal(hrvBaseline([...back(9, () => ({ hrv: 50 })), { date: TODAY, hrv: 44 }], TODAY), null, 'nine readings are no baseline')
  assert.equal(hrvBaseline([...back(28, () => ({ hrv: 50 })), { date: TODAY, hrv: 44 }], TODAY).z, 0, 'a flat baseline has no SD to divide by')
})

test('the verdict: either signal can call an easy day', () => {
  const v = (h, s) => readiness(h, s, TODAY)
  assert.equal(v(hrv(50), strain(10)).verdict, 'go')
  assert.equal(v(hrv(50), strain(10)).headline, 'good to train')
  assert.equal(v(hrv(51), strain(5)).headline, 'room to push', 'the week ran under the month')
  assert.equal(v(hrv(44), strain(10)).verdict, 'easy', 'HRV three SD down, load normal')
  assert.equal(v(hrv(50), strain(30)).verdict, 'easy', 'a load spike on a normal HRV')
  assert.equal(v(hrv(48.5), strain(10)).verdict, 'steady', 'HRV soft (−0.7 SD)')
  assert.equal(v(hrv(50), strain(16)).verdict, 'steady', 'load building (1.39×)')
  assert.equal(v(hrv(48.5), strain(16)).verdict, 'easy', 'soft HRV on a building load')
  assert.equal(v([], []), null, 'no history, no cue')
  assert.equal(v(hrv(44), []).verdict, 'easy', 'HRV alone is enough')
  assert.equal(v([], strain(10)).verdict, 'go', 'load alone is enough')
})

test('the reasons read as plain clauses', () => {
  const r = readiness(hrv(44), strain(16), TODAY)
  assert.equal(r.headline, 'easy day')
  assert.deepEqual(r.reasons, ['HRV 44 ms is 2.9 SD under your 28-day 50', '7-day strain 16.0 is 1.39× your 4-week 11.5'])
  assert.deepEqual(readiness(hrv(50), [], TODAY).reasons, ['HRV 50 ms is at your 28-day 50'])
  assert.match(readiness(hrv(56), [], TODAY).reasons[0], /^HRV 56 ms is 2\.9 SD over your 28-day 50$/)
})
