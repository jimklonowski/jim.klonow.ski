// What a new dose row fills in from the compound's last dose (app/data/journal.ts doseDefaults) —
// audit #43 item 8: the row stayed 'mg', so "hCG 250" saved as 250 mg.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doseDefaults } from '../app/data/journal.ts'

const day = (date, ...peptides) => ({ date, peptides })
const hcg = (site, unit = 'iu') => ({ time: '08:00', compound: 'hCG', dose: 250, unit, site })
const entries = [
  day('2026-10-21', hcg('left_glute')),
  day('2026-10-24', hcg('right_glute'), { compound: 'HGH', dose: 2, unit: 'iu', site: 'abdomen' }),
  day('2026-10-26'),
  day('2026-10-28', hcg('left_glute'))
]

test('the unit the compound was last logged in, and the mirror of its last site', () => {
  assert.deepEqual(doseDefaults(entries, 'hCG', '2026-10-29'), { unit: 'iu', site: 'right_glute' })
  assert.deepEqual(doseDefaults(entries, 'HGH', '2026-10-29'), { unit: 'iu', site: 'abdomen' }, 'an unsided site passes through')
})

test('a back-filled day reads from the dose before it, not the newest', () => {
  assert.deepEqual(doseDefaults(entries, 'hCG', '2026-10-25'), { unit: 'iu', site: 'left_glute' })
  // Nothing before it: the newest is still a better guess than a blank 'mg'.
  assert.deepEqual(doseDefaults(entries, 'hCG', '2026-10-01'), { unit: 'iu', site: 'right_glute' })
})

test('a compound never logged, or no compound, leaves the row alone', () => {
  assert.equal(doseDefaults(entries, 'BPC-157', '2026-10-29'), null)
  assert.equal(doseDefaults(entries, '', '2026-10-29'), null)
  assert.equal(doseDefaults([], 'hCG', '2026-10-29'), null)
})

test('an old row without a site still gives its unit', () => {
  const legacy = [day('2026-01-05', { compound: 'hCG', dose: 300, unit: 'iu' })]
  assert.deepEqual(doseDefaults(legacy, 'hCG', '2026-10-29'), { unit: 'iu', site: '' })
})
