// Unit tests for the stock projections (app/utils/vialInventory.ts), audit #42 item 43: IU doses
// depleting an mg vial through the compound's IU_PER_MG factor, the history-vs-typical daily rate,
// the run-out date and the expiry reads. Aliased imports resolve through tests/_setup/loader.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeRemaining, computeUsedAmount, defaultVialForm, estimateDailyRate, isExpired, isExpiringSoon, projectVial, roundAmount
} from '../app/utils/vialInventory.ts'

const TODAY = '2026-10-23'
const vial = (over = {}) => ({ compound: 'HGH', vial_amount: 10, vial_unit: 'mg', form: 'vial', quantity: 1, status: 'active', opened_date: '2026-10-10', ...over })
const dose = (date, amount, unit, compound = 'HGH') => ({ date, peptides: [{ compound, dose: amount, unit }] })

test('the form picker\'s starting point reads the compound catalogue: capsules, orals, vials', () => {
  assert.equal(defaultVialForm('HGH'), 'vial')
  assert.equal(defaultVialForm('Oxandrolone'), 'tablet', 'an "(Oral)" category')
  assert.equal(defaultVialForm('5-Amino-1MQ'), 'capsule', 'a capsule in the timing note wins')
  assert.equal(defaultVialForm('Something Unlisted'), 'vial')
})

test('IU doses deplete an mg vial through the compound\'s factor; doses before it was opened, of other compounds, or in a unit that cannot convert do not count', () => {
  const entries = [
    dose('2026-10-09', 3, 'iu'), // the day before it was opened
    dose('2026-10-10', 3, 'iu'),
    dose('2026-10-11', 3, 'iu'),
    dose('2026-10-12', 3, 'iu'),
    dose('2026-10-13', 3, 'iu'),
    dose('2026-10-13', 300, 'mcg'), // a mass dose converts directly
    dose('2026-10-13', 250, 'mcg', 'BPC-157') // another vial's
  ]
  assert.equal(roundAmount(computeUsedAmount(vial(), entries)), 4.3, '12 IU at 3 IU/mg plus 0.3 mg')
  assert.equal(computeUsedAmount(vial({ opened_date: null }), entries), 0, 'a sealed vial has lost nothing')
  const bpc = vial({ compound: 'BPC-157', vial_amount: 5 })
  assert.equal(computeUsedAmount(bpc, [dose('2026-10-12', 250, 'mcg', 'BPC-157'), dose('2026-10-13', 250, 'mcg', 'BPC-157'), dose('2026-10-14', 2, 'iu', 'BPC-157')]), 0.5, 'no IU factor: the IU dose is skipped')
})

test('what is left is clamped at zero and read as a share of the vial', () => {
  const four = [dose('2026-10-10', 6, 'iu'), dose('2026-10-11', 6, 'iu')] // 12 IU = 4 mg
  assert.deepEqual(computeRemaining(vial(), four), { used: 4, remaining: 6, pct: 0.6 })
  const over = computeRemaining(vial({ vial_amount: 2 }), four)
  assert.equal(over.remaining, 0)
  assert.equal(over.pct, 0)
  assert.equal(computeRemaining(vial({ vial_amount: 0 }), []).pct, 0)
})

test('the daily rate: logged history once three dosing days are in the last four weeks, else the catalogue\'s typical dose, else nothing', () => {
  const three = [dose('2026-10-10', 3, 'iu'), dose('2026-10-11', 3, 'iu'), dose('2026-10-12', 3, 'iu'), dose('2026-09-01', 30, 'iu')]
  const history = estimateDailyRate(vial(), three, TODAY)
  assert.equal(history.basis, 'history')
  assert.equal(history.dailyAmount, 3 / 14, '3 mg over the 14 days since the first dose in the window; the September dose is outside it')
  const two = estimateDailyRate(vial(), three.slice(0, 2), TODAY)
  assert.deepEqual(two, { dailyAmount: 0.5, basis: 'typical' }, 'HGH\'s typical 1.5 IU a day is 0.5 mg')
  assert.deepEqual(estimateDailyRate(vial({ compound: 'Something Unlisted' }), [], TODAY), { dailyAmount: null, basis: null })
})

test('the projection: days left at the rate, and the run-out date rounded up to a day', () => {
  const p = projectVial(vial(), [dose('2026-10-10', 6, 'iu'), dose('2026-10-11', 6, 'iu')], TODAY)
  assert.equal(p.remaining, 6)
  assert.equal(p.basis, 'typical')
  assert.equal(p.daysLeft, 12)
  assert.equal(p.runOutDate, '2026-11-04')
  const none = projectVial(vial({ compound: 'Something Unlisted' }), [], TODAY)
  assert.equal(none.daysLeft, null)
  assert.equal(none.runOutDate, null)
})

test('expiry: soon within thirty days, expired once past, nothing without a date', () => {
  assert.equal(isExpiringSoon('2026-11-10', TODAY), true)
  assert.equal(isExpiringSoon('2026-12-01', TODAY), false)
  assert.equal(isExpiringSoon('2026-12-01', TODAY, 60), true)
  assert.equal(isExpiringSoon('2026-10-20', TODAY), false, 'already past is not "soon"')
  assert.equal(isExpiringSoon(null, TODAY), false)
  assert.equal(isExpired('2026-10-20', TODAY), true)
  assert.equal(isExpired(TODAY, TODAY), false)
  assert.equal(isExpired(undefined, TODAY), false)
})
