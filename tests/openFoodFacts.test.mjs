// Open Food Facts → figures (shared/utils/openFoodFacts.ts) — audit #43 item 81.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OFF_NAME_MAX, OFF_SERVING_MAX, OFF_USER_AGENT, normalizeBarcode, offFigures, servingFlOz } from '../shared/utils/openFoodFacts.ts'
import { zMealCorrect } from '../shared/utils/schemas.ts'

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
  assert.deepEqual(f, { name: 'Original Beef Stick — Chomps', per: '1 stick (32 g)', basis: 'serving', kcal: 100, protein_g: 10, carbs_g: 0, fat_g: 6, sodium_mg: 380, fiber_g: 0, sugar_g: null, caffeine_mg: null, serving_oz: null, scaled: false })
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

test('junk sodium is no figure, and a record scaled from per-100 g says so (the fairlife shake, 2026-11-12)', () => {
  // The record as Open Food Facts served it: entered per 100 g, sodium a rounding ghost.
  const f = offFigures({
    product_name: 'High Quality Protein', brands: 'fairlife', serving_size: '1 bottle (350 g)', nutrition_data_per: '100g',
    nutriments: { 'energy-kcal_serving': 154, 'proteins_serving': 30.9, 'carbohydrates_serving': 4.13, 'fat_serving': 2.59, 'fiber_serving': 1.01, 'sodium_serving': 6.96e-35, 'salt_serving': 1.74e-34 }
  })
  assert.equal(f.sodium_mg, null, 'not "0 mg": the label says 230')
  assert.equal(f.scaled, true)
  assert.equal(f.kcal, 154)
  // An exact zero is a real figure; a real small figure survives; salt-only junk is junk too.
  assert.equal(offFigures({ nutriments: { 'energy-kcal_serving': 0, 'sodium_serving': 0 } }).sodium_mg, 0)
  assert.equal(offFigures({ nutriments: { 'energy-kcal_serving': 5, 'sodium_serving': 0.005 } }).sodium_mg, 5)
  assert.equal(offFigures({ nutriments: { 'energy-kcal_serving': 5, 'salt_serving': 1e-30 } }).sodium_mg, null)
  assert.equal(offFigures({ nutrition_data_per: 'serving', nutriments: { 'energy-kcal_serving': 5 } }).scaled, false)
  assert.equal(offFigures({ nutrition_data_per: '100g', nutriments: { 'energy-kcal_100g': 5 } }).scaled, false, 'per-100 figures shown as per-100 are not scaled')
})

// Audit #44 item 38: a product name of a few hundred characters made the figures save a 400,
// because the "where these came from" line built from it ran past its bound.
test('a long product name or serving text is cut where it enters, and the saved line is cut rather than refused', () => {
  const f = offFigures({
    product_name: 'Word '.repeat(120), brands: 'Brand', serving_size: 'about one cup '.repeat(20),
    nutriments: { 'energy-kcal_serving': 100 }
  })
  assert.equal(f.name.length, OFF_NAME_MAX)
  assert.ok(f.name.endsWith('…'))
  assert.equal(f.per.length <= OFF_SERVING_MAX, true)
  assert.ok(f.per.endsWith('…'))
  const short = offFigures({ product_name: 'Greek Yogurt', brands: 'Brand, Other', serving_size: '170 g', nutriments: { 'energy-kcal_serving': 100 } })
  assert.deepEqual([short.name, short.per], ['Greek Yogurt — Brand', '170 g'], 'ordinary text is untouched')
  // The line the form builds from them fits the schema with room to spare.
  const from = `Open Food Facts: ${f.name} — 12 × ${f.per}`
  assert.ok(from.length <= 300, String(from.length))
  const figures = { text: 'yogurt', kcal: 100, protein_g: 17, carbs_g: 6, fat_g: 0, barcode: '012345678905' }
  assert.equal(zMealCorrect.parse({ ...figures, from }).from, from)
  // And an older client's over-long line is still a save: cut to 300, not a 400.
  const long = zMealCorrect.safeParse({ ...figures, from: `Open Food Facts: ${'x'.repeat(900)} — 2 × 170 g` })
  assert.equal(long.success, true)
  assert.equal(long.data.from.length, 300)
  assert.ok(long.data.from.endsWith('…'))
  assert.equal(zMealCorrect.safeParse({ ...figures, from: 'x'.repeat(3001) }).success, false, 'still bounded on the way in')
  assert.equal(zMealCorrect.parse({ ...figures, from: '  ' }).from, null)
  assert.equal(zMealCorrect.parse(figures).from, null)
})

// Audit #44 item 39: the lookup named the site in its User-Agent, so every scanned barcode was
// filed under a named personal site in Open Food Facts' logs.
test('the lookup names what it is, never whose: no domain, no address, and the handler sends only that', () => {
  assert.match(OFF_USER_AGENT, /^[a-z-]+\/\d+\.\d+ \([a-z ]+\)$/, 'a client name, a version, a plain description')
  assert.doesNotMatch(OFF_USER_AGENT, /@|https?:|\.[a-z]{2,}\b/i, 'no address, no URL, no domain')
  const handler = readFileSync(new URL('../server/api/journal/meals/barcode.get.ts', import.meta.url), 'utf8')
  const agents = [...handler.matchAll(/'User-Agent':\s*([^,}\n]+)/g)].map(m => m[1].trim())
  assert.deepEqual(agents, ['OFF_USER_AGENT'], 'one User-Agent, and it is the constant')
})
