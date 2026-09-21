// Unit tests for the home-timezone clock helpers (shared/utils/time.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isIsoDate, localDaysAgo, localTimeNow, localToday } from '../shared/utils/time.ts'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Whole days between two YYYY-MM-DD strings, UTC-noon anchored. */
function dayDiff(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
}

test('localToday is an ISO date regardless of the process timezone', () => {
  assert.match(localToday(), ISO)
  assert.equal(isIsoDate(localToday()), true)
})

test('localDaysAgo walks whole calendar days from today, both directions', () => {
  const today = localToday()
  assert.equal(localDaysAgo(0), today)
  assert.equal(dayDiff(localDaysAgo(1), today), 1)
  assert.equal(dayDiff(localDaysAgo(90), today), 90)
  assert.equal(dayDiff(today, localDaysAgo(-7)), 7)
  // Across the whole year the step is always exactly one day — the ms-subtraction version
  // this replaced was off by an hour around each DST change.
  for (let n = 1; n <= 400; n++) {
    assert.equal(dayDiff(localDaysAgo(n), localDaysAgo(n - 1)), 1, `day ${n}`)
  }
})

test('localTimeNow is a 24-hour HH:MM clock', () => {
  const t = localTimeNow()
  assert.match(t, /^\d{2}:\d{2}$/)
  const [h, m] = t.split(':').map(Number)
  assert.ok(h >= 0 && h <= 23, 'hour in 00–23 (h23, never 24:xx)')
  assert.ok(m >= 0 && m <= 59)
})

test('isIsoDate accepts real calendar days only', () => {
  assert.equal(isIsoDate('2026-09-21'), true)
  assert.equal(isIsoDate('2024-02-29'), true, 'leap day in a leap year')
  assert.equal(isIsoDate('2026-02-29'), false, 'no leap day in 2026')
  assert.equal(isIsoDate('2026-13-40'), false, 'Date would roll this into the next year')
  assert.equal(isIsoDate('2026-04-31'), false)
  assert.equal(isIsoDate('2026-9-1'), false, 'zero padding required — it has to sort')
  assert.equal(isIsoDate('2026-09-21T12:00:00'), false)
  assert.equal(isIsoDate(''), false)
  assert.equal(isIsoDate(null), false)
  assert.equal(isIsoDate(20260921), false)
})
