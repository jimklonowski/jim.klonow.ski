// One spelling per compound (app/data/journal.ts compoundSpellings / canonicalCompound) —
// audit #43 item 9: "hcg" saved as its own compound, invisible to adherence, PK and vials.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalCompound, compoundSpellings } from '../app/data/journal.ts'

const dose = compound => ({ compound, dose: 1, unit: 'mg', site: '' })
const entries = [
  { date: '2026-10-01', peptides: [dose('hCG'), dose('Retatrutide X'), dose('retatrutide x')], reconstitutions: [] },
  { date: '2026-10-02', peptides: [dose('Retatrutide X')], reconstitutions: [{ compound: 'My  Blend', vial_amount: 10, vial_unit: 'mg' }] }
]
const spellings = compoundSpellings(entries)

test('a catalogue compound saves under the catalogue spelling, whatever the case or spacing', () => {
  assert.equal(canonicalCompound('hcg', spellings), 'hCG')
  assert.equal(canonicalCompound('  HCG ', spellings), 'hCG')
  assert.equal(canonicalCompound('bpc-157', compoundSpellings([])), 'BPC-157', 'known without ever being logged')
})

test('an off-catalogue compound saves under the spelling the log uses most', () => {
  assert.equal(canonicalCompound('RETATRUTIDE  x', spellings), 'Retatrutide X')
  assert.equal(canonicalCompound('my blend', spellings), 'My Blend', 'reconstitution names count, spacing tidied')
})

test('a new name is kept as typed, only tidied', () => {
  assert.equal(canonicalCompound('  Brand  New ', spellings), 'Brand New')
  assert.equal(canonicalCompound('', spellings), '')
})
