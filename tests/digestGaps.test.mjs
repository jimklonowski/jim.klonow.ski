// The "fill gaps" rules (shared/utils/digestGaps.ts): which past days and weeks lack a digest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cronFiringAt, digestGaps, pendingDigests } from '../shared/utils/digestGaps.ts'

// 2026-09-28 is a Monday; the week before ran Sun Sep 20 – Sat Sep 26.
const TODAY = '2026-09-28'

test('a past day with data and no daily digest is a gap; today is not', () => {
  const g = digestGaps(['2026-09-25', '2026-09-26', '2026-09-27', TODAY], [{ type: 'daily', period_end: '2026-09-26' }], TODAY, 30)
  assert.deepEqual(g.daily, ['2026-09-25', '2026-09-27'])
})

test('days without any data are never gaps', () => {
  assert.deepEqual(digestGaps([], [], TODAY, 30), { daily: [], weekly: [] })
})

test('weeks are Sunday–Saturday, and only finished ones count', () => {
  // Data in the week ending Sat Sep 26, and in the current (unfinished) week.
  const g = digestGaps(['2026-09-22', '2026-09-27'], [], TODAY, 30)
  assert.deepEqual(g.weekly, ['2026-09-26'])
  // Once that week has its digest, nothing is missing.
  assert.deepEqual(digestGaps(['2026-09-22'], [{ type: 'weekly', period_end: '2026-09-26' }], TODAY, 30).weekly, [])
})

test('on a Saturday, the week ending that day is still under way', () => {
  assert.deepEqual(digestGaps(['2026-09-22'], [], '2026-09-26', 30).weekly, [])
  assert.deepEqual(digestGaps(['2026-09-15'], [], '2026-09-26', 30).weekly, ['2026-09-19'])
})

test('the window bounds how far back it looks', () => {
  assert.deepEqual(digestGaps(['2026-07-01', '2026-09-20'], [], TODAY, 30).daily, ['2026-09-20'])
})

test('a period whose digest cron has not fired yet is pending, not a gap', () => {
  // Before 14:00 UTC, yesterday belongs to the daily job — offering it would double-generate.
  const g = digestGaps(['2026-09-26', '2026-09-27'], [], TODAY, 30, { daily: '2026-09-27' })
  assert.deepEqual(g.daily, ['2026-09-26'])
  // Sunday morning before the weekly cron: the week that ended Saturday is pending…
  assert.deepEqual(digestGaps(['2026-09-22'], [], '2026-09-27', 30, { weekly: '2026-09-26' }).weekly, [])
  // …and once the hour has passed (no pending), it is a gap like any other.
  assert.deepEqual(digestGaps(['2026-09-22'], [], '2026-09-27', 30).weekly, ['2026-09-26'])
})

test('a period is pending only until its own cron run has fired (audit #43 item 24)', () => {
  const DAILY = '0 14 * * *'
  const WEEKLY = '0 15 * * SUN'
  assert.equal(cronFiringAt(DAILY, '2026-10-30'), Date.parse('2026-10-30T14:00:00Z'))
  assert.equal(cronFiringAt('*/5 * * * *', '2026-10-30'), null)
  // Thu Oct 29 is written by Fri Oct 30's 14:00 UTC run (09:00 CDT).
  const at = iso => pendingDigests(Date.parse(iso), '2026-10-30', DAILY, WEEKLY)
  assert.equal(at('2026-10-30T12:00:00Z').daily, '2026-10-29', '07:00 CDT: the run is still ahead')
  assert.equal(at('2026-10-30T14:30:00Z').daily, null, 'after the run')
  // 20:00 CDT is 01:00 UTC the next day — the old UTC-hour check read 1 < 14 and hid the gap.
  assert.equal(at('2026-10-31T01:00:00Z').daily, null, '20:00 CDT: the run fired this morning')
  // Weekly: Sun Nov 1's 15:00 UTC run writes the week ending Sat Oct 31.
  const sun = iso => pendingDigests(Date.parse(iso), '2026-11-01', DAILY, WEEKLY)
  assert.equal(sun('2026-11-01T13:00:00Z').weekly, '2026-10-31', 'Sunday morning, before the run')
  assert.equal(sun('2026-11-02T01:00:00Z').weekly, null, 'Sunday 19:00 CST: the run fired at 09:00')
  assert.equal(pendingDigests(Date.parse('2026-11-04T15:00:00Z'), '2026-11-04', DAILY, WEEKLY).weekly, null, 'midweek: the last week is long written')
  // CST (after Nov 1): 14:00 UTC is 08:00 — still the same home date.
  assert.equal(pendingDigests(Date.parse('2026-11-04T13:59:00Z'), '2026-11-04', DAILY, WEEKLY).daily, '2026-11-03')
})
