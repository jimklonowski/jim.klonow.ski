// Unit tests for the vaccine catalogue matching and booster math behind /journal/vaccines and
// the AI prompt context. Plain node:test + native TS type stripping, same as the other suites:
//
//   node --test tests/
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addYears, recentVaccinations, vaccineCoverage, vaccineFamily, vaccineInfo
} from '../shared/utils/vaccines.ts'

test('vaccineInfo: exact catalogue names and freehand variants land on one family', () => {
  assert.equal(vaccineInfo('Tetanus (Td/Tdap)')?.family, 'tetanus')
  assert.equal(vaccineInfo('tetanus booster')?.family, 'tetanus')
  assert.equal(vaccineInfo('Tdap')?.family, 'tetanus')
  assert.equal(vaccineInfo('Boostrix')?.family, 'tetanus')
  assert.equal(vaccineInfo('flu shot')?.family, 'influenza')
  assert.equal(vaccineInfo('COVID booster 2026-27')?.family, 'covid')
  assert.equal(vaccineInfo('Spikevax')?.family, 'covid')
})

test('vaccineInfo: word boundaries keep short tokens from matching inside other words', () => {
  // "td" must not fire on "tdap-adjacent" words or on random text containing the letters.
  assert.equal(vaccineInfo('standard dose'), null)
  assert.equal(vaccineInfo('Rotavirus'), null)
  assert.equal(vaccineInfo(''), null)
  assert.equal(vaccineInfo(null), null)
})

test('vaccineFamily: falls back to the product, then to the normalized freehand name', () => {
  assert.equal(vaccineFamily({ vaccine: 'booster', product: 'Adacel' }), 'tetanus')
  assert.equal(vaccineFamily({ vaccine: '  Dengue   vaccine ', product: null }), 'dengue vaccine')
})

test('addYears: calendar years, Feb 29 rolls forward in a non-leap year', () => {
  assert.equal(addYears('2026-09-09', 10), '2036-09-09')
  assert.equal(addYears('2024-02-29', 1), '2025-03-01')
})

test('vaccineCoverage: one row per family, latest dose wins, next-due from the interval', () => {
  const rows = [
    { date: '2026-09-09', vaccine: 'COVID-19', product: null },
    { date: '2026-09-09', vaccine: 'Influenza (flu)', product: null },
    { date: '2026-09-09', vaccine: 'Tetanus (Td/Tdap)', product: null },
    { date: '2025-10-02', vaccine: 'flu', product: 'Fluzone' },
    { date: '2024-03-15', vaccine: 'Shingrix', product: null },
    { date: '2024-05-20', vaccine: 'Shingrix', product: null }
  ]
  const cov = vaccineCoverage(rows, '2026-09-10')
  const byFamily = Object.fromEntries(cov.map(c => [c.family, c]))

  assert.equal(cov.length, 4)
  assert.equal(byFamily.influenza.lastDate, '2026-09-09')
  assert.equal(byFamily.influenza.doses, 2)
  assert.equal(byFamily.influenza.nextDue, '2027-09-09')
  assert.equal(byFamily.influenza.status, 'current')
  assert.equal(byFamily.influenza.label, 'Influenza (flu)')

  assert.equal(byFamily.tetanus.nextDue, '2036-09-09')
  assert.equal(byFamily.tetanus.intervalYears, 10)

  // A series with no routine booster has no due date and sorts last.
  assert.equal(byFamily.shingles.nextDue, null)
  assert.equal(byFamily.shingles.status, 'unscheduled')
  assert.equal(byFamily.shingles.doses, 2)
  assert.equal(cov.at(-1).family, 'shingles')
})

test('vaccineCoverage: due-soon and overdue statuses, urgency-first ordering', () => {
  const rows = [
    { date: '2025-09-20', vaccine: 'Influenza (flu)', product: null }, // due 2026-09-20 → within 60d
    { date: '2015-01-01', vaccine: 'Tetanus (Td/Tdap)', product: null }, // due 2025-01-01 → overdue
    { date: '2026-08-01', vaccine: 'COVID-19', product: null } // due 2027-08-01 → current
  ]
  const cov = vaccineCoverage(rows, '2026-09-10')
  assert.deepEqual(cov.map(c => c.status), ['overdue', 'due', 'current'])
  assert.deepEqual(cov.map(c => c.family), ['tetanus', 'influenza', 'covid'])
})

test('vaccineCoverage: doses after asOf are invisible (historical regeneration)', () => {
  const rows = [
    { date: '2026-09-09', vaccine: 'Tetanus (Td/Tdap)', product: null },
    { date: '2016-06-01', vaccine: 'Td', product: null }
  ]
  const cov = vaccineCoverage(rows, '2026-08-15')
  assert.equal(cov.length, 1)
  assert.equal(cov[0].lastDate, '2016-06-01')
  // 2016-06-01 + 10y = 2026-06-01, already past on 2026-08-15 — and the 09-09 booster that
  // fixes it hasn't happened yet as of that date.
  assert.equal(cov[0].status, 'overdue')
  assert.equal(cov[0].nextDue, '2026-06-01')
})

test('recentVaccinations: inclusive 21-day window, nothing from the future', () => {
  const rows = [
    { date: '2026-09-09', vaccine: 'COVID-19', product: null },
    { date: '2026-08-19', vaccine: 'Influenza (flu)', product: null }, // exactly 21 days before 09-09
    { date: '2026-08-18', vaccine: 'RSV', product: null }, // 22 days — out
    { date: '2026-09-12', vaccine: 'HPV', product: null } // future — out
  ]
  const recent = recentVaccinations(rows, '2026-09-09')
  assert.deepEqual(recent.map(r => r.vaccine), ['Influenza (flu)', 'COVID-19'])
})
