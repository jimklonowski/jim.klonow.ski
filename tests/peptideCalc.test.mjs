// Unit tests for the reconstitution and syringe math (shared/utils/peptideCalc.ts). This is the
// code that turns "250 mcg" into how far to draw the plunger, so a wrong factor here is a wrong
// dose. It drives the calculator page, the compound pages' units hints, and the vial runway.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  IU_PER_MG, calcConcentration, calcDoseForUnits, calcUnits, convertUnit, convertUnitFor, iuEquivalentLabel
} from '../shared/utils/peptideCalc.ts'

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b))

test('convertUnit handles mass only, and never guesses across to IU', () => {
  assert.equal(convertUnit(2, 'mg', 'mcg'), 2000)
  assert.equal(convertUnit(250, 'mcg', 'mg'), 0.25)
  assert.equal(convertUnit(5, 'iu', 'iu'), 5)
  assert.equal(convertUnit(5, 'iu', 'mg'), null)
  assert.equal(convertUnit(5, 'mg', 'iu'), null)
})

test('convertUnitFor bridges IU and mass only where the compound has a factor', () => {
  // HGH is exact by definition: 1 mg = 3 IU.
  assert.equal(IU_PER_MG.HGH, 3)
  assert.equal(convertUnitFor('HGH', 3, 'iu', 'mg'), 1)
  assert.equal(convertUnitFor('HGH', 1, 'mg', 'iu'), 3)
  assert.ok(close(convertUnitFor('HGH', 2.5, 'iu', 'mcg'), 2500 / 3))
  assert.equal(convertUnitFor('HGH', 500, 'mcg', 'iu'), 1.5)
  // No factor for a peptide dosed by mass.
  assert.equal(convertUnitFor('BPC-157', 250, 'mcg', 'iu'), null)
  // Mass-to-mass still works for any compound.
  assert.equal(convertUnitFor('BPC-157', 250, 'mcg', 'mg'), 0.25)
})

test('iuEquivalentLabel switches to mcg below 0.1 mg', () => {
  assert.equal(iuEquivalentLabel('HGH', 2.5), '≈ 0.83 mg')
  assert.equal(iuEquivalentLabel('hCG', 250), '≈ 26.9 mcg')
  assert.equal(iuEquivalentLabel('BPC-157', 250), null)
  assert.equal(iuEquivalentLabel('HGH', 0), null)
})

test('concentration is amount per mL, and needs both inputs', () => {
  assert.equal(calcConcentration(10, 2), 5)
  assert.equal(calcConcentration(10, 0), null)
  assert.equal(calcConcentration(0, 2), null)
})

test('calcUnits gives U-100 syringe units for a dose', () => {
  // 10 mg in 2 mL = 5 mg/mL. 250 mcg = 0.25 mg = 0.05 mL = 5 units.
  assert.ok(close(calcUnits(250, 'mcg', 10, 'mg', 2), 5))
  // A full 1 mL syringe holds 100 units.
  assert.ok(close(calcUnits(5, 'mg', 10, 'mg', 2), 100))
  // HGH: a 36 IU pen-vial in 3 mL, a 2.5 IU dose, all in IU.
  assert.ok(close(calcUnits(2.5, 'iu', 36, 'iu', 3), 2.5 / 12 * 100))
  // Same vial labeled by mass (12 mg), dose in IU: only works when the compound is named.
  assert.ok(close(calcUnits(2.5, 'iu', 12, 'mg', 3, 'HGH'), 2.5 / 12 * 100))
  assert.equal(calcUnits(2.5, 'iu', 12, 'mg', 3), null)
  // Nothing to draw.
  assert.equal(calcUnits(0, 'mg', 10, 'mg', 2), null)
  assert.equal(calcUnits(250, 'mcg', 10, 'mg', 0), null)
})

test('calcDoseForUnits inverts calcUnits', () => {
  const cases = [
    [250, 'mcg', 10, 'mg', 2, undefined],
    [2.5, 'iu', 12, 'mg', 3, 'HGH'],
    [300, 'iu', 5000, 'iu', 5, 'hCG'],
    [0.5, 'mg', 5, 'mg', 1, 'BPC-157']
  ]
  for (const [dose, doseUnit, vialAmount, vialUnit, water, compound] of cases) {
    const units = calcUnits(dose, doseUnit, vialAmount, vialUnit, water, compound)
    assert.ok(close(calcDoseForUnits(units, vialAmount, vialUnit, water, doseUnit, compound), dose), `${dose} ${doseUnit} ${compound ?? ''}`)
  }
})
