// The phlebotomy prompt block (server/utils/phlebotomyContext.ts) and its isotretinoin donation
// deferral line — audit #43 item 85: the ask chat and the labs summary must not suggest donating
// mid-course.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deferralLine, phlebotomyContext } from '../server/utils/phlebotomyContext.ts'

const course = {
  id: 4,
  name: 'Isotretinoin Course',
  start_date: '2026-11-07',
  start_precision: 'day',
  planned_weeks: 41,
  planned_days: null,
  actual_end: null,
  goal: null,
  notes: null,
  compounds: JSON.stringify([{ compound: 'Isotretinoin', dose: 40, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 1, toWeek: 41 }])
}

/** A D1 stand-in answering the two reads phlebotomyContext makes. */
function fakeDb({ cycles = [], phlebotomies = [] }) {
  return {
    prepare: sql => ({
      all: async () => ({ results: /FROM cycles/.test(sql) ? cycles : /FROM phlebotomies/.test(sql) ? phlebotomies : [] })
    })
  }
}

test('the deferral line: active names the end, a course within 60 days is announced, else nothing', () => {
  assert.equal(deferralLine(null, '2026-11-10'), '')
  const active = deferralLine({ start: '2026-11-07', until: '2027-09-19', active: true }, '2026-12-15')
  assert.match(active, /^Blood donation is deferred until 2027-09-19: an isotretinoin course started 2026-11-07/)
  assert.match(active, /therapeutic phlebotomy on a prescriber's order/)
  assert.match(active, /never suggest donating/)
  assert.match(deferralLine({ start: '2026-11-07', until: '2027-09-19', active: false }, '2026-11-01'), /^An isotretinoin course starts 2026-11-07; from then until 2027-09-19/)
  assert.equal(deferralLine({ start: '2027-06-01', until: '2027-12-01', active: false }, '2026-11-01'), '', 'too far ahead to matter')
})

test('the block carries the deferral with or without visits on file, as of the draw', async () => {
  const visit = { id: 1, date: '2026-09-01', kind: 'donation', ml: 500, pre_hgb: null, notes: null, created_at: 'x' }
  const onlyDeferral = await phlebotomyContext(fakeDb({ cycles: [course] }), '2026-12-15')
  assert.match(onlyDeferral, /^Blood donation is deferred until 2027-09-19/)
  const both = await phlebotomyContext(fakeDb({ cycles: [course], phlebotomies: [visit] }), '2026-12-15')
  assert.match(both, /^Phlebotomies on file/)
  assert.match(both, /2026-09-01: blood donation, 500 mL/)
  assert.match(both, /\nBlood donation is deferred until 2027-09-19/)
  // A summary regenerated for a summer draw: the course was months away, so no line.
  assert.doesNotMatch(await phlebotomyContext(fakeDb({ cycles: [course], phlebotomies: [visit] }), '2026-08-15'), /deferred/)
  assert.equal(await phlebotomyContext(fakeDb({}), '2026-12-15'), '')
})
