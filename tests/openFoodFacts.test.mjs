// Open Food Facts → figures (shared/utils/openFoodFacts.ts) — audit #43 item 81.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBarcode, offFigures, servingFlOz } from '../shared/utils/openFoodFacts.ts'

test('a barcode is 8, 12, 13 or 14 digits; spaces and dashes are tolerated', () => {
  assert.equal(normalizeBarcode('0 85000-23104 6'), '085000231046')
  assert.equal(normalizeBarcode('5449000000996'), '5449000000996')
  assert.equal(normalizeBarcode('12345678'), '12345678')
  assert.equal(normalizeBarcode('1234567'), null)
  assert.equal(normalizeBarcode('12345678901'), null, '11 digits is no code')
  assert.equal(normalizeBarcode('abc'), null)
  assert.equal(normalizeBarcode(null), null)
})

test('per-serving figures when the product has them: sodium from grams, the name with its brand', () => {
  const f = offFigures({
    code: '085000231046',
    product_name: 'Original Beef Stick',
    brands: 'Chomps, Chomps Snacks',
    serving_size: '1 stick (32 g)',
    nutriments: { 'energy-kcal_serving': 100, 'proteins_serving': 10, 'carbohydrates_serving': 0, 'fat_serving': 6, 'sodium_serving': 0.38, 'fiber_serving': 0, 'energy-kcal_100g': 312 }
  })
  assert.deepEqual(f, { name: 'Original Beef Stick — Chomps', per: '1 stick (32 g)', basis: 'serving', kcal: 100, protein_g: 10, carbs_g: 0, fat_g: 6, sodium_mg: 380, fiber_g: 0, sugar_g: null, caffeine_mg: null, serving_oz: null })
})

test('a drink: sugar, caffeine from grams, and the serving as fluid ounces', () => {
  const f = offFigures({
    product_name: 'Cola',
    serving_size: '12 FL OZ (355 mL)',
    nutriments: { 'energy-kcal_serving': 150, 'carbohydrates_serving': 41, 'sugars_serving': 40, 'sodium_serving': 0.055, 'caffeine_serving': 0.041 }
  })
  assert.equal(f.sugar_g, 40)
  assert.equal(f.caffeine_mg, 41)
  assert.equal(f.sodium_mg, 55)
  assert.equal(f.serving_oz, 12)
  assert.equal(servingFlOz({ serving_size: '355 ml' }), 12)
  assert.equal(servingFlOz({ serving_size: '0.5 L' }), 16.9)
  assert.equal(servingFlOz({ serving_size: '1 can', serving_quantity: 591, serving_quantity_unit: 'ml' }), 20)
  assert.equal(servingFlOz({ serving_size: '1 stick (32 g)', serving_quantity: 32, serving_quantity_unit: 'g' }), null, 'a weight is no volume')
  assert.equal(servingFlOz({ serving_size: '1 oz (28 g)' }), null, 'a bare oz is not read as fluid')
  assert.equal(offFigures({ serving_size: '355 ml', nutriments: { 'energy-kcal_100g': 42 } }).serving_oz, null, 'per-100 figures carry no serving')
})

test('per 100 g when there is no serving data; salt stands in for sodium; missing extras stay null', () => {
  const f = offFigures({ product_name: 'Some Cracker', nutriments: { 'energy-kcal_100g': '480', 'proteins_100g': 9.5, 'carbohydrates_100g': 66, 'fat_100g': 19, 'salt_100g': 1.5 } })
  assert.equal(f.basis, '100g')
  assert.equal(f.per, '100 g')
  assert.equal(f.kcal, 480)
  assert.equal(f.sodium_mg, 600, '1.5 g salt ÷ 2.5 = 0.6 g sodium')
  assert.equal(f.fiber_g, null)
  assert.equal(f.name, 'Some Cracker')
  assert.equal(offFigures({ product_name: 'Name only', nutriments: {} }), null, 'no energy figure → nothing to prefill')
  assert.equal(offFigures(null), null)
  assert.equal(offFigures({ code: '123', nutriments: { 'energy-kcal_serving': 50 } }).name, 'barcode 123')
})
