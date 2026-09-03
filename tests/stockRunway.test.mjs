// Unit tests for the cycle stock-coverage math behind /tools/inventory's runway panel.
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cycleCoverage } from '../shared/utils/stockRunway.ts'

// 2026-09-14 is a Monday. Primo Mon+Thu 200mg for 16 weeks = 32 doses = 6400mg.
// Anavar daily 25mg weeks 12-16 (5 weeks) = 35 doses = 875mg.
const primo = { compound: 'Methenolone Enanthate', dose: 200, unit: 'mg', weekdays: [1, 4], fromWeek: 1, toWeek: null }
const anavar = { compound: 'Oxandrolone', dose: 25, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 12, toWeek: 16 }

function run(overrides = {}) {
  return {
    id: 1,
    name: 'Primo Run 1',
    start_date: '2026-09-14',
    planned_weeks: 16,
    actual_end: null,
    compounds: [primo, anavar],
    ...overrides
  }
}

const stock = amounts => (compound, unit) => {
  assert.equal(unit, 'mg')
  return amounts[compound] ?? null
}

test('upcoming cycle needs the whole plan', () => {
  const rows = cycleCoverage(run(), '2026-09-01', stock({ 'Methenolone Enanthate': 8000, 'Oxandrolone': 875 }))
  const primoRow = rows.find(r => r.compound === 'Methenolone Enanthate')
  const anavarRow = rows.find(r => r.compound === 'Oxandrolone')
  assert.equal(primoRow.needed, 6400)
  assert.equal(primoRow.short, 0)
  assert.equal(primoRow.pct, 1)
  assert.equal(anavarRow.needed, 875)
  assert.equal(anavarRow.short, 0)
})

test('mid-cycle coverage only counts doses still ahead', () => {
  // asOf Monday of week 3: weeks 1-2 (4 doses, 800mg) are behind — Monday week 3 itself counts.
  const rows = cycleCoverage(run(), '2026-09-28', stock({ 'Methenolone Enanthate': 1000 }))
  const primoRow = rows.find(r => r.compound === 'Methenolone Enanthate')
  assert.equal(primoRow.needed, 6400 - 800)
  assert.equal(primoRow.short, 4600)
  assert.ok(primoRow.pct > 0 && primoRow.pct < 1)
})

test('unstocked compound reports null onHand and full shortfall', () => {
  const rows = cycleCoverage(run(), '2026-09-01', stock({ 'Methenolone Enanthate': 6400 }))
  const anavarRow = rows.find(r => r.compound === 'Oxandrolone')
  assert.equal(anavarRow.onHand, null)
  assert.equal(anavarRow.short, 875)
  assert.equal(anavarRow.pct, 0)
})

test('an early actual_end shrinks the need', () => {
  // Cut at end of week 8: 16 Mon+Thu primo doses, anavar's week-12 window never arrives.
  const rows = cycleCoverage(run({ actual_end: '2026-11-08' }), '2026-09-01', stock({}))
  const primoRow = rows.find(r => r.compound === 'Methenolone Enanthate')
  const anavarRow = rows.find(r => r.compound === 'Oxandrolone')
  assert.equal(primoRow.needed, 3200)
  assert.equal(anavarRow.needed, 0)
  assert.equal(anavarRow.pct, 1)
})

test('a finished cycle has no coverage rows', () => {
  assert.deepEqual(cycleCoverage(run(), '2027-02-01', stock({})), [])
})

test('a tentative cycle needs its whole plan, whenever you ask', () => {
  const tentative = run({ start_precision: 'month', start_date: '2026-10-01' })
  const whole = asOf => cycleCoverage(tentative, asOf, stock({}))
    .find(r => r.compound === 'Methenolone Enanthate').needed

  // Stocking for an unscheduled run is the whole point of asking, so the requirement is the
  // full plan — before the anchor month, inside it, and long after it slid by without a start.
  assert.equal(whole('2026-09-01'), 6400)
  assert.equal(whole('2026-10-15'), 6400)
  assert.equal(whole('2027-06-01'), 6400)
  // A committed cycle still discounts what's behind it, and still retires when it's over.
  assert.equal(cycleCoverage(run({ start_date: '2026-10-01' }), '2027-06-01', stock({})).length, 0)
})
