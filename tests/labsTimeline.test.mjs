// Unit tests for the /labs time-travel helpers: the as-of cutoff, the ?asof= normalization and
// the per-draw flag counts. Same setup as the other suites:
//
//   node --test tests/
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawFlags, entriesAsOf, resolveAsOf } from '../shared/utils/labsTimeline.ts'

const DATES = ['2026-01-16', '2026-02-27', '2026-04-04', '2026-05-30']
// Reversed on purpose: the API order must not matter.
const entries = [...DATES].reverse().map(date => ({ date }))

test('entriesAsOf sorts ascending and cuts off inclusively', () => {
  assert.deepEqual(entriesAsOf(entries, null).map(e => e.date), DATES)
  assert.deepEqual(entriesAsOf(entries, '2026-04-04').map(e => e.date), DATES.slice(0, 3))
  assert.deepEqual(entriesAsOf(entries, '2026-01-16').map(e => e.date), ['2026-01-16'])
  assert.deepEqual(entriesAsOf([], '2026-04-04'), [])
})

test('resolveAsOf accepts only real, non-latest draw dates', () => {
  assert.equal(resolveAsOf(DATES, '2026-02-27'), '2026-02-27')
  assert.equal(resolveAsOf(DATES, '2026-05-30'), null, 'latest collapses to null')
  assert.equal(resolveAsOf(DATES, '2026-03-01'), null, 'not a draw date')
  assert.equal(resolveAsOf(DATES, undefined), null)
  assert.equal(resolveAsOf(DATES, ['2026-02-27']), null, 'repeated query param')
  assert.equal(resolveAsOf([], '2026-02-27'), null)
})

test('drawFlags counts readings outside the reference range', () => {
  const ranges = { a: { refMin: 10, refMax: 20 }, b: { refMax: 5 }, c: { refMin: 1 } }
  assert.deepEqual(
    drawFlags({ a: 25, b: 3, c: 0.5, d: 99, e: null }, ranges),
    { high: 1, low: 1, count: 4 },
    'd has no range and still counts; e is unread and does not'
  )
  assert.deepEqual(drawFlags({ a: 10, b: 5, c: 1 }, ranges), { high: 0, low: 0, count: 3 }, 'boundaries are in range')
  assert.deepEqual(drawFlags({}, ranges), { high: 0, low: 0, count: 0 })
})
