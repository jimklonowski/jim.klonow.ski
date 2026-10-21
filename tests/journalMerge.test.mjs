// Unit tests for the day-save three-way merge (shared/utils/journalMerge.ts), audit #42 item 1.
// Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeDaySave } from '../shared/utils/journalMerge.ts'

const day = (over = {}) => ({
  weight_lbs: null, bp_systolic: null, bp_diastolic: null, rhr: null, hrv: null,
  sodas: [], water: [], food: {}, ...over
})
const pour = (time, oz = 12) => ({ time, oz })
const soda = (time, drink = 'Coke', size = '12oz can') => ({ time, drink, size })

test('no row yet: the form is written as is', () => {
  const form = day({ water: [pour('08:00')], food: { lunch: 'gyros' } })
  assert.deepEqual(mergeDaySave(form, day(), null), { fields: form, kept: [] })
})

test('nothing changed elsewhere: the form decides, removals included', () => {
  const base = day({ water: [pour('08:00'), pour('10:00')], sodas: [soda('12:00')], food: { lunch: 'gyros' } })
  const form = day({ water: [pour('08:00')], sodas: [], food: { lunch: '' } }) // removed a pour, the soda, cleared lunch
  const { fields, kept } = mergeDaySave(form, base, base)
  assert.deepEqual(fields.water, [pour('08:00')])
  assert.deepEqual(fields.sodas, [])
  assert.deepEqual(fields.food, {})
  assert.deepEqual(kept, [])
})

test('a pour tapped elsewhere while the form was open survives the save', () => {
  const base = day({ water: [pour('08:00')] })
  const form = day({ water: [pour('08:00')], food: { dinner: 'rice + beef bowl' } }) // the form only added dinner
  const current = day({ water: [pour('08:00'), pour('11:30')] }) // the phone added a pour
  const { fields, kept } = mergeDaySave(form, base, current)
  assert.deepEqual(fields.water, [pour('08:00'), pour('11:30')])
  assert.deepEqual(fields.food, { dinner: 'rice + beef bowl' })
  assert.deepEqual(kept, ['1 water pour'])
})

test('the form\'s own list edits still apply on top of what arrived elsewhere, in time order', () => {
  const base = day({ sodas: [soda('12:00'), soda('15:00', 'Dr Pepper')] })
  const form = day({ sodas: [soda('15:00', 'Dr Pepper'), soda('18:00', 'Sprite')] }) // removed the 12:00, added an 18:00
  const current = day({ sodas: [soda('12:00'), soda('15:00', 'Dr Pepper'), soda('13:30', 'Coke Zero')] }) // phone added 13:30
  const { fields, kept } = mergeDaySave(form, base, current)
  assert.deepEqual(fields.sodas, [soda('13:30', 'Coke Zero'), soda('15:00', 'Dr Pepper'), soda('18:00', 'Sprite')])
  assert.deepEqual(kept, ['1 soda'])
})

test('duplicate identical items are counted, not collapsed', () => {
  // Two identical 12 oz pours at the same minute are two pours; removing one removes one.
  const base = day({ water: [pour('08:00'), pour('08:00')] })
  const form = day({ water: [pour('08:00')] })
  const current = day({ water: [pour('08:00'), pour('08:00'), pour('09:00')] })
  const { fields } = mergeDaySave(form, base, current)
  assert.deepEqual(fields.water, [pour('08:00'), pour('09:00')])
})

test('food merges per slot: the form\'s edit wins, an untouched slot takes the quick-logged value', () => {
  const base = day({ food: { breakfast: 'protein shake' } })
  const form = day({ food: { breakfast: 'protein + creatine shake', dinner: 'gyros' } }) // edited breakfast, added dinner
  const current = day({ food: { breakfast: 'protein shake', lunch: 'costco pizza', snack_pm: 'almonds' } }) // hub quick-logged lunch + a snack
  const { fields, kept } = mergeDaySave(form, base, current)
  assert.deepEqual(fields.food, { breakfast: 'protein + creatine shake', lunch: 'costco pizza', snack_pm: 'almonds', dinner: 'gyros' })
  assert.deepEqual(kept, ['lunch', 'snack pm'])
})

test('clearing a slot on the form clears it even if it was also changed elsewhere', () => {
  const base = day({ food: { lunch: 'gyros' } })
  const form = day({ food: { lunch: '' } })
  const current = day({ food: { lunch: 'gyros + fries' } })
  assert.deepEqual(mergeDaySave(form, base, current).fields.food, {})
})

test('vitals the form left alone take what the webhook wrote; an edited vital wins', () => {
  const base = day({ weight_lbs: null, rhr: 55 })
  const form = day({ weight_lbs: null, rhr: 57 }) // user corrected RHR, left weight blank
  const current = day({ weight_lbs: 173.8, rhr: 55, hrv: 41 }) // Apple Health landed weight + HRV
  const { fields, kept } = mergeDaySave(form, base, current)
  assert.equal(fields.weight_lbs, 173.8)
  assert.equal(fields.rhr, 57)
  assert.equal(fields.hrv, 41)
  assert.deepEqual(kept, ['weight', 'HRV'])
})

test('a vital the user cleared stays cleared when nothing arrived elsewhere', () => {
  const base = day({ weight_lbs: 170 })
  const form = day({ weight_lbs: null })
  assert.equal(mergeDaySave(form, base, base).fields.weight_lbs, null)
})
