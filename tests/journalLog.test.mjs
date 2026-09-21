// Unit tests for the logged-day predicate and streak walk (shared/utils/journalLog.ts).
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLoggedDay, loggedStreak } from '../shared/utils/journalLog.ts'

const vitalsOnly = date => ({ date, weight_lbs: 190.2, rhr: 52, hrv: 61, peptides: [], reconstitutions: [], food: {}, sodas: [], notes: '' })
const dosed = date => ({ ...vitalsOnly(date), peptides: [{ compound: 'HGH', dose: 2.5, unit: 'iu' }] })

test('a day with nothing but watch vitals is not a logged day', () => {
  assert.equal(isLoggedDay(vitalsOnly('2026-09-20')), false)
  // Missing JSON columns (a bare server row) read the same as empty ones.
  assert.equal(isLoggedDay({ date: '2026-09-20' }), false)
  assert.equal(isLoggedDay({ peptides: null, food: null, notes: null }), false)
})

test('any hand-entered field makes the day logged', () => {
  assert.equal(isLoggedDay(dosed('2026-09-20')), true)
  assert.equal(isLoggedDay({ reconstitutions: [{ compound: 'BPC-157' }] }), true)
  assert.equal(isLoggedDay({ sodas: [{ time: '14:00' }] }), true)
  assert.equal(isLoggedDay({ food: { breakfast: '', lunch: 'eggs' } }), true)
  assert.equal(isLoggedDay({ notes: 'slept badly' }), true)
})

test('whitespace-only food and notes do not count', () => {
  assert.equal(isLoggedDay({ food: { breakfast: '  ', dinner: '\n' }, notes: '   ' }), false)
})

test('streak counts back from today when today is logged', () => {
  const entries = ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'].map(dosed)
  assert.equal(loggedStreak(entries, '2026-09-21'), 5)
})

test('an unlogged today falls back to yesterday instead of reading 0 all morning', () => {
  const entries = [dosed('2026-09-19'), dosed('2026-09-20'), vitalsOnly('2026-09-21')]
  assert.equal(loggedStreak(entries, '2026-09-21'), 2)
  // …but a gap before yesterday is a broken streak.
  assert.equal(loggedStreak([dosed('2026-09-19')], '2026-09-21'), 0)
})

test('vitals-only days break the streak rather than extending it', () => {
  const entries = [dosed('2026-09-18'), vitalsOnly('2026-09-19'), dosed('2026-09-20'), dosed('2026-09-21')]
  assert.equal(loggedStreak(entries, '2026-09-21'), 2)
})

test('month boundaries and empty input', () => {
  const entries = ['2026-08-30', '2026-08-31', '2026-09-01'].map(dosed)
  assert.equal(loggedStreak(entries, '2026-09-01'), 3)
  assert.equal(loggedStreak([], '2026-09-01'), 0)
})
