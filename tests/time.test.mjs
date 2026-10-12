// Unit tests for the home-timezone clock helpers (shared/utils/time.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isIsoDate, localClockOf, localDayOf, localDaysAgo, localTimeNow, localToday, workoutStartMs } from '../shared/utils/time.ts'

test('workoutStartMs reads both stored start_time formats to the same instant', () => {
  // The Oct 11 2026 ride as Health Auto Export (local + offset) and Whoop (ISO UTC) stored it.
  const apple = workoutStartMs('2026-10-11 19:36:13 -0500')
  const whoop = workoutStartMs('2026-10-12T00:36:13.000Z')
  assert.equal(apple, Date.UTC(2026, 9, 12, 0, 36, 13))
  assert.equal(whoop, apple)
  assert.equal(workoutStartMs('2026-10-11 19:36 -05:00'), Date.UTC(2026, 9, 12, 0, 36), 'seconds optional, colon offset')
  assert.equal(workoutStartMs(null), null)
  assert.equal(workoutStartMs(undefined), null)
  assert.equal(workoutStartMs(''), null)
  assert.equal(workoutStartMs('last night'), null)
})

test('localClockOf renders the HOME_TZ wall clock whichever format the start came in', () => {
  assert.equal(localClockOf(workoutStartMs('2026-10-12T00:36:13.000Z')), '19:36')
  assert.equal(localClockOf(workoutStartMs('2026-10-11 19:36:13 -0500')), '19:36')
  // Winter (CST, UTC-6).
  assert.equal(localClockOf('2026-01-15T01:08:00.000Z'), '19:08')
  assert.equal(localClockOf('2026-01-15T06:05:00.000Z'), '00:05', 'h23: midnight is 00, never 24')
})

test('localDayOf: the HOME_TZ calendar day of a timestamp, not the UTC one', () => {
  // 03:30 UTC is 22:30 the previous evening in Chicago (CDT).
  assert.equal(localDayOf('2026-09-30T03:30:00.000Z'), '2026-09-29')
  assert.equal(localDayOf('2026-09-30T14:00:00.000Z'), '2026-09-30')
  // Winter (CST, UTC-6): 05:30 UTC is still the previous day.
  assert.equal(localDayOf('2026-01-15T05:30:00.000Z'), '2026-01-14')
  assert.equal(localDayOf('2026-01-15T06:30:00.000Z'), '2026-01-15')
})

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
