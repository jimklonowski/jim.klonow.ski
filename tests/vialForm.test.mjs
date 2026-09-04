// Unit tests for the pill-bottle ↔ vial_amount translation behind /tools/inventory.
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pillStrength, pillTotal, pillsFromAmount, describeContents, containerNoun, stockNoun, normalizeForm
} from '../shared/utils/vialForm.ts'

const bottle = { form: 'tablet', unit_count: 100, vial_amount: 2500, vial_unit: 'mg' }
const vial = { form: 'vial', unit_count: null, vial_amount: 10, vial_unit: 'mg' }

test('bottle total round-trips to label terms', () => {
  assert.equal(pillTotal(25, 100), 2500)
  assert.equal(pillStrength(bottle), 25)
  assert.equal(pillTotal(0.5, 30), 15)
  assert.equal(pillStrength({ ...bottle, vial_amount: 15, unit_count: 30 }), 0.5)
})

test('vials have no pill strength', () => {
  assert.equal(pillStrength(vial), null)
  assert.equal(pillStrength({ ...bottle, unit_count: null }), null)
  assert.equal(pillsFromAmount(vial, 5), null)
})

test('remaining amount reads back as pills', () => {
  assert.equal(pillsFromAmount(bottle, 2475), 99)
  assert.equal(pillsFromAmount(bottle, 2487.5), 99.5)
  assert.equal(pillsFromAmount(bottle, 0), 0)
})

test('contents label speaks the container language', () => {
  assert.equal(describeContents(vial), '10mg')
  assert.equal(describeContents(bottle), '100 × 25mg tabs')
  assert.equal(describeContents({ ...bottle, form: 'capsule', unit_count: 1, vial_amount: 25 }), '1 × 25mg cap')
  // A pill row missing its count (pre-migration or uncorrected parse) degrades to the raw total.
  assert.equal(describeContents({ ...bottle, unit_count: null }), '2500mg')
})

test('nouns follow the form', () => {
  assert.equal(containerNoun('vial'), 'vial')
  assert.equal(containerNoun('tablet', 3), 'bottles')
  assert.equal(containerNoun(undefined, 2), 'vials')
  assert.equal(stockNoun([vial, vial]), 'vials')
  assert.equal(stockNoun([bottle]), 'bottles')
  assert.equal(stockNoun([vial, bottle]), 'units')
  assert.equal(stockNoun([vial, bottle], 'stock'), 'stock')
  assert.equal(stockNoun([]), 'vials')
})

test('normalizeForm tolerates a missing column and junk', () => {
  assert.equal(normalizeForm(undefined), 'vial')
  assert.equal(normalizeForm('pen'), 'vial')
  assert.equal(normalizeForm('capsule'), 'capsule')
})
