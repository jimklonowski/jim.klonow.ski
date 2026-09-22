// Unit tests for shared/utils/dates.ts — the one copy of the calendar-day helpers that the
// cycle math, adherence scoring, trend engine, digests, and PK windows all sit on. Same plain
// node:test + native TS type-stripping setup as the others:
//
//   node --test tests/
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { diffDays, eachDay, roundTo, shiftDays, weekStartOf, weekdayOf } from '../shared/utils/dates.ts'

test('shiftDays crosses month, year, and leap-day boundaries', () => {
  assert.equal(shiftDays('2026-09-14', 7), '2026-09-21')
  assert.equal(shiftDays('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDays('2028-02-28', 1), '2028-02-29')
  assert.equal(shiftDays('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftDays('2026-09-14', 0), '2026-09-14')
})

test('diffDays is b − a, in whole days, across DST changes', () => {
  assert.equal(diffDays('2026-09-14', '2026-09-21'), 7)
  assert.equal(diffDays('2026-09-21', '2026-09-14'), -7)
  // US spring-forward (Mar 8) and fall-back (Nov 1) 2026.
  assert.equal(diffDays('2026-03-07', '2026-03-09'), 2)
  assert.equal(diffDays('2026-10-31', '2026-11-02'), 2)
  assert.equal(diffDays('2026-01-01', '2027-01-01'), 365)
})

test('shiftDays and diffDays invert each other', () => {
  for (const n of [-400, -30, -1, 0, 1, 13, 90, 366]) {
    assert.equal(diffDays('2026-06-15', shiftDays('2026-06-15', n)), n, `n = ${n}`)
  }
})

test('weekdayOf resolves ISO dates to 0 = Sun … 6 = Sat', () => {
  assert.equal(weekdayOf('2026-09-06'), 0)
  assert.equal(weekdayOf('2026-09-09'), 3)
  assert.equal(weekdayOf('2026-09-12'), 6)
})

test('weekStartOf is the Sunday on or before the date', () => {
  assert.equal(weekStartOf('2026-09-06'), '2026-09-06')
  assert.equal(weekStartOf('2026-09-12'), '2026-09-06')
  assert.equal(weekStartOf('2026-09-13'), '2026-09-13')
  // A week that straddles a month.
  assert.equal(weekStartOf('2026-10-02'), '2026-09-27')
})

test('eachDay is inclusive and empty when reversed', () => {
  assert.deepEqual(eachDay('2026-02-27', '2026-03-02'), ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
  assert.deepEqual(eachDay('2026-09-14', '2026-09-14'), ['2026-09-14'])
  assert.deepEqual(eachDay('2026-09-15', '2026-09-14'), [])
  assert.deepEqual(eachDay('2026-09-06', '2026-09-27', 7), ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'])
})

test('roundTo defaults to one decimal', () => {
  assert.equal(roundTo(2.345), 2.3)
  assert.equal(roundTo(2.346, 2), 2.35)
  assert.equal(roundTo(-1.25, 0), -1)
  assert.equal(roundTo(187.66, 0), 188)
})

// The point of the UTC anchoring: the same answers in any zone. The browser runs in the user's
// zone and the Worker in UTC, so run the DST-sensitive cases in a zone far from both.
test('results do not depend on the process timezone', () => {
  const script = `
    import { diffDays, shiftDays, weekStartOf } from ${JSON.stringify(new URL('../shared/utils/dates.ts', import.meta.url).href)}
    console.log(JSON.stringify([
      shiftDays('2026-03-07', 2), diffDays('2026-10-31', '2026-11-02'), weekStartOf('2026-11-03')
    ]))`
  for (const tz of ['Pacific/Kiritimati', 'America/Chicago', 'Pacific/Pago_Pago']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: tz }, encoding: 'utf8'
    })
    assert.deepEqual(JSON.parse(out), ['2026-03-09', 2, '2026-11-01'], tz)
  }
})
