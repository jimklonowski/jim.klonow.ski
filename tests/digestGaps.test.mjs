// The "fill gaps" rules (shared/utils/digestGaps.ts): which past days and weeks lack a digest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { digestGaps } from '../shared/utils/digestGaps.ts'

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
