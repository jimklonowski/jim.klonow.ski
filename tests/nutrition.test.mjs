// Unit tests for the meal-figure helpers (shared/utils/nutrition.ts, mealKey.ts, mealLibrary.ts)
// and soda calories (shared/utils/soda.ts). Same node:test + TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dayNutrition, fmtEstimate, fmtKcal, fmtMacros, indexEstimates, knownMeals, lookupEstimate, mealHistory,
  nutritionAverage, resolveMealText, slotForTime, suggestMeal, unestimatedMeals
} from '../shared/utils/nutrition.ts'
import { mealKey, splitQuantity } from '../shared/utils/mealKey.ts'
import { LIBRARY_TEXTS, MEAL_LIBRARY, libraryLookup } from '../shared/utils/mealLibrary.ts'
import { sodaKcal, sodaKcalTotals } from '../shared/utils/soda.ts'

const est = (text, kcal, p, c, f, extra = {}) => ({
  key: mealKey(text), text, kcal, protein_g: p, carbs_g: c, fat_g: f,
  confidence: 'medium', assumptions: null, source: 'ai', model: 'test', created_at: 't', updated_at: 't', ...extra
})

test('the key folds spelling, order, case, punctuation and plurals, but not different meals', () => {
  const shake = mealKey('protein + creatine shake')
  assert.equal(mealKey('Protein shake + Creatine'), shake)
  assert.equal(mealKey('protein and creatine shakes'), shake)
  assert.equal(mealKey('  protein, creatine shake '), shake)
  assert.notEqual(mealKey('protein + creatine'), shake, 'no "shake" is a different string on purpose')
  assert.equal(mealKey('2 x mcdonalds double cheeseburger + fries'), mealKey('2x McDonalds double cheeseburger & fries'))
  assert.notEqual(mealKey('costco pizza'), mealKey('costco cheese pizza'))
  assert.equal(mealKey('Costco Bacon Egg and Cheese'), mealKey('costco bacon, egg & cheese'))
  assert.equal(mealKey(''), '')
  assert.equal(mealKey('   '), '')
  assert.equal(mealKey(null), '')
})

test('a leading quantity splits off and multiplies the whole meal', () => {
  assert.deepEqual(splitQuantity('2 x grilled cheese + guac'), { n: 2, rest: 'grilled cheese + guac' })
  assert.deepEqual(splitQuantity('3x costco pizza'), { n: 3, rest: 'costco pizza' })
  assert.equal(splitQuantity('grilled cheese + guac'), null)
  assert.equal(splitQuantity('2 eggs'), null, 'a count without an x is part of the meal name')
  assert.equal(splitQuantity('99 x pizza'), null, 'a typo-sized quantity is not a quantity')
})

test('lookup goes through the key, so any spelling finds the one cached row', () => {
  // (A fixture meal the library doesn't know — the Costco pizzas all moved into it.)
  const index = indexEstimates([est('Veggie lasagna', 700, 30, 70, 32)])
  assert.equal(lookupEstimate(index, 'veggie lasagna')?.kcal, 700)
  assert.equal(lookupEstimate(index, 'VEGGIE LASAGNA!')?.kcal, 700)
  assert.equal(lookupEstimate(index, 'costco veggie pizza'), null, 'a different meal (and not in the library)')
  assert.equal(lookupEstimate(index, ''), null)
})

test('"N x" multiplies a known meal from any source, re-keyed to the text that asked', () => {
  const index = indexEstimates([est('veggie lasagna', 700, 30, 70, 32.5)])
  const two = lookupEstimate(index, '2 x veggie lasagna')
  assert.equal(two.kcal, 1400)
  assert.equal(two.fat_g, 65)
  assert.equal(two.key, mealKey('2 x veggie lasagna'))
  assert.match(two.assumptions, /^2 × veggie lasagna/)
  // The library, too — two sandwiches AND two guac cups.
  const one = libraryLookup('grilled cheese + guac')
  const twoGc = lookupEstimate(new Map(), '2 x grilled cheese + guac')
  assert.equal(twoGc.kcal, one.kcal * 2)
  assert.equal(twoGc.protein_g, Math.round(one.protein_g * 2 * 10) / 10)
  assert.equal(lookupEstimate(index, '2 x nothing known'), null)
})

test('a hand entry beats the library, which beats a model estimate', () => {
  const libText = MEAL_LIBRARY[0].text
  const ai = indexEstimates([est(libText, 1, 1, 1, 1)])
  assert.equal(lookupEstimate(ai, libText).source, 'library', 'an AI row for a library meal is ignored')
  const manual = indexEstimates([est(libText, 2, 2, 2, 2, { source: 'manual' })])
  assert.equal(lookupEstimate(manual, libText).source, 'manual')
  assert.equal(lookupEstimate(manual, libText).kcal, 2)
})

test('the library: every entry resolves by its text and aliases, with positive figures and a source', () => {
  assert.ok(MEAL_LIBRARY.length >= 2)
  for (const meal of MEAL_LIBRARY) {
    for (const text of [meal.text, ...(meal.aliases ?? [])]) {
      const e = libraryLookup(text)
      assert.ok(e, `${text} resolves`)
      assert.equal(e.source, 'library')
      assert.ok(e.kcal > 0 && e.protein_g >= 0 && e.carbs_g >= 0 && e.fat_g >= 0, `${text} has figures`)
      assert.ok(e.assumptions, `${text} names its portion`)
    }
  }
  assert.ok(LIBRARY_TEXTS.includes('grilled cheese + guac'))
  assert.equal(libraryLookup('a meal nobody wrote down'), null)
  // The figures are the sum of the parts.
  const gc = libraryLookup('grilled cheese + guac')
  assert.equal(gc.kcal, libraryLookup('lilys grilled cheese').kcal + libraryLookup('kirkland guacamole cup').kcal)
})

test('a day sums its meals with figures, counts the missing ones, and folds soda calories in', () => {
  // (Not the shake: that's a library meal now, and the library would outrank these AI rows.)
  const index = indexEstimates([
    est('oatmeal + berries', 120, 25, 3, 1),
    est('veggie lasagna', 700, 30, 70, 32)
  ])
  const day = dayNutrition({
    food: { breakfast: 'Oatmeal and berries', lunch: 'veggie lasagna', dinner: 'something new', snack: '', snack_pm: '  ' },
    sodas: [{ drink: 'Dr Pepper', size: '12oz can' }, { drink: 'Coke Zero', size: '20oz bottle' }, { drink: 'Sprite', size: 'Fountain' }]
  }, index)
  assert.equal(day.meals.length, 3, 'the blank snack is not a meal')
  assert.equal(day.estimated, 2)
  assert.deepEqual(day.missing, ['something new'])
  assert.equal(day.sodaKcal, 150, 'Dr Pepper 150 per 12 oz, Coke Zero 0, the unsized fountain nothing')
  assert.equal(day.sodaUnsized, 1)
  assert.equal(day.kcal, 120 + 700 + 150)
  assert.equal(day.protein_g, 55)
  assert.equal(day.carbs_g, 73 + 39, 'soda sugar: ~26 g carbs per 100 kcal')
  assert.equal(day.fat_g, 33)
  assert.equal(day.complete, false, 'a missing figure or an unsized soda keeps the total a floor')
  const full = dayNutrition({ food: { lunch: 'veggie lasagna' }, sodas: [] }, index)
  assert.equal(full.complete, true)
  assert.equal(dayNutrition(null, index).meals.length, 0)
  assert.equal(dayNutrition({ food: {} }, index).complete, false, 'nothing logged is not "complete"')
})

test('formatting', () => {
  assert.equal(fmtKcal(1849.6), '1,850')
  assert.equal(fmtMacros({ kcal: 0, protein_g: 94.6, carbs_g: 180.2, fat_g: 70 }), '95P 180C 70F')
  assert.equal(fmtEstimate(est('x', 540, 28, 45, 26)), '≈ 540 kcal · 28P 45C 26F')
})

test('the clock picks the meal: breakfast until 10:30, lunch to 15:00, then dinner', () => {
  assert.equal(slotForTime('06:45'), 'breakfast')
  assert.equal(slotForTime('10:29'), 'breakfast')
  assert.equal(slotForTime('10:30'), 'lunch')
  assert.equal(slotForTime('23:59'), 'dinner')
  assert.equal(slotForTime('garbage'), 'lunch', 'an unreadable clock lands at midday')
})

test('meal history: one canonical spelling per key with the combined count, this slot first', () => {
  const entries = [
    { food: { breakfast: 'protein + creatine shake', lunch: 'costco pizza' } },
    { food: { breakfast: 'protein shake + creatine', dinner: 'costco pizza' } },
    { food: { breakfast: 'protein + creatine shake', lunch: 'gyros' } },
    { food: { breakfast: 'protein shake + creatine', dinner: 'Costco Pizza' } },
    { food: { snack: 'watermelon' } }
  ]
  const all = mealHistory(entries)
  const shake = all.find(h => h.key === mealKey('protein + creatine shake'))
  assert.equal(shake.count, 4, 'both spellings count as one meal')
  assert.equal(shake.text, 'protein + creatine shake', 'ties go to the spelling seen first')
  const pizza = all.find(h => h.key === mealKey('costco pizza'))
  assert.equal(pizza.count, 3)
  assert.equal(pizza.text, 'costco pizza', 'the most-used spelling wins over the capitalised one-off')
  assert.deepEqual(all.map(h => h.text), ['protein + creatine shake', 'costco pizza', 'gyros', 'watermelon'])
  assert.equal(mealHistory(entries, 'dinner')[0].text, 'costco pizza')
  assert.equal(mealHistory(entries, 'dinner')[0].slotCount, 2)
  assert.equal(mealHistory(entries, 'breakfast')[0].text, 'protein + creatine shake')
  // The snack slots share a history: a legacy snack suggests itself for an afternoon snack.
  assert.equal(mealHistory(entries, 'snack_pm')[0].text, 'watermelon')
  assert.equal(mealHistory(entries, 'snack_pm')[0].slotCount, 1)
  assert.deepEqual(mealHistory([]), [])
})

test('the clock names a meal, never a snack', () => {
  assert.equal(slotForTime('14:45'), 'lunch')
  assert.equal(slotForTime('15:00'), 'dinner')
})

test('the backfill list is every canonical meal no source has figures for', () => {
  // (california rolls, not gyros: gyros joined the library.)
  const entries = [
    { food: { breakfast: 'protein + creatine shake', lunch: 'veggie lasagna' } },
    { food: { breakfast: 'protein shake + creatine', dinner: 'homemade california rolls' } },
    { food: { lunch: '2 x grilled cheese + guac' } }
  ]
  const index = indexEstimates([est('veggie lasagna', 700, 30, 70, 32)])
  assert.deepEqual(unestimatedMeals(entries, index), ['homemade california rolls'], 'the library covers the shake and the 2 x grilled cheese')
  // Equal counts sort alphabetically.
  assert.deepEqual(unestimatedMeals(entries, indexEstimates([])), ['homemade california rolls', 'veggie lasagna'])
})

test('the weekly average counts only fully covered days inside the window', () => {
  // ("a" alone is a stopword and keys to nothing — a meal name needs a real word.)
  const index = indexEstimates([est('alpha plate', 1000, 50, 100, 30), est('bravo plate', 500, 25, 50, 15)])
  const entries = [
    { date: '2026-10-14', food: { lunch: 'alpha plate' } },
    { date: '2026-10-15', food: { lunch: 'alpha plate', dinner: 'bravo plate' } },
    { date: '2026-10-16', food: { lunch: 'alpha plate', dinner: 'unknown meal' } }, // partial day: skipped
    { date: '2026-10-17', food: {} }, // nothing logged: skipped
    { date: '2026-10-20', food: { lunch: 'bravo plate' } },
    { date: '2026-10-21', food: { lunch: 'alpha plate' } } // after today: skipped
  ]
  const avg = nutritionAverage(entries, index, '2026-10-20', '2026-10-14')
  assert.deepEqual(avg, { days: 3, kcal: Math.round((1000 + 1500 + 500) / 3), protein_g: Math.round((50 + 75 + 25) / 3) })
  assert.deepEqual(nutritionAverage([], index, '2026-10-20', '2026-10-14'), { days: 0, kcal: 0, protein_g: 0 })
})

test('"did you mean": same key pairs silently, close wording asks, a different meal is left alone', () => {
  const index = indexEstimates([
    est('costco cheese pizza', 700, 30, 70, 32),
    est('steak n shake bacon double cheeseburger + tots', 980, 45, 70, 55, { source: 'manual' }),
    est('sweet potato + chicken + broccoli bowl', 650, 40, 70, 20, { source: 'manual' })
  ])
  const entries = [
    { food: { lunch: 'costco cheese pizza', dinner: 'sweet potato + chicken + broccoli bowl' } },
    { food: { lunch: 'steak n shake bacon double cheeseburger + tots' } },
    { food: { lunch: 'costco cheese pizza' } }
  ]
  const known = knownMeals(entries, index)
  assert.ok(known.some(k => k.text === 'grilled cheese + guac'), 'library meals are candidates even if never logged')
  assert.equal(known.find(k => k.text === 'costco cheese pizza').count, 2)

  // Same key, other spelling → exact, canonical spelling returned.
  assert.deepEqual(suggestMeal('Costco Cheese Pizzas', known), { text: 'costco cheese pizza', strength: 'exact', score: 1 })
  // Already the canonical spelling → nothing to suggest.
  assert.equal(suggestMeal('costco cheese pizza', known), null)
  // A library alias is an exact match too, answered with the library's canonical spelling.
  assert.deepEqual(suggestMeal('mcdonalds double cheeseburger + small fries', known), { text: 'mcdonalds double cheeseburger + fries', strength: 'exact', score: 1 })
  // Strong: one extra word on a seven-word meal (88%) pairs on its own.
  const strong = suggestMeal('steak n shake bacon double cheeseburger + small tots', known)
  assert.equal(strong.text, 'steak n shake bacon double cheeseburger + tots')
  assert.equal(strong.strength, 'strong')
  // Prefix tolerance: "mcd" reads as "mcdonalds".
  assert.equal(suggestMeal('mcd double cheeseburger fries', known)?.text, 'mcdonalds double cheeseburger + fries')
  // Maybe: a missing ingredient (4 of 5 words, 80%) is a question, not a silent pairing.
  const maybe = suggestMeal('sweet potato + chicken bowl', known)
  assert.equal(maybe.text, 'sweet potato + chicken + broccoli bowl')
  assert.equal(maybe.strength, 'maybe')
  assert.equal(maybe.score, 0.8)
  assert.equal(suggestMeal('costco veggie pizza', known).strength, 'maybe', 'two of four words shared with the cheese pizza')
  // Nothing close.
  assert.equal(suggestMeal('watermelon', known), null)
  assert.equal(suggestMeal('', known), null)
  // The quantity rides along: matched on the meal, offered back with the count.
  const two = suggestMeal('2 x Costco Cheese Pizza', known)
  assert.equal(two.text, '2 x costco cheese pizza')
  assert.equal(two.strength, 'exact')
  assert.equal(suggestMeal('2 x costco cheese pizza', known), null, 'already canonical, quantity and all')
  // A quantity never pairs with a different quantity of the same meal.
  const twoKnown = knownMeals([{ food: { lunch: '2 x costco cheese pizza' } }], index)
  assert.equal(suggestMeal('costco cheese pizza', twoKnown), null)

  // What gets saved.
  assert.deepEqual(resolveMealText(' Costco Cheese Pizzas ', known), { text: 'costco cheese pizza', changed: true })
  assert.deepEqual(resolveMealText('steak n shake bacon double cheeseburger + small tots', known), { text: 'steak n shake bacon double cheeseburger + tots', changed: true })
  assert.deepEqual(resolveMealText('sweet potato + chicken bowl', known), { text: 'sweet potato + chicken bowl', changed: false }, 'a maybe is asked, never applied')
  assert.deepEqual(resolveMealText('watermelon', known), { text: 'watermelon', changed: false })
})

test('soda calories: label figures per 12 oz, zero for diet, a regular default for unknown drinks, null when unsized', () => {
  assert.equal(sodaKcal('Dr Pepper', '12oz can'), 150)
  assert.equal(sodaKcal('Dr Pepper', '20oz bottle'), 250)
  assert.equal(sodaKcal('Mountain Dew', '7.5oz mini can'), 106)
  assert.equal(sodaKcal('Coke Zero', '20oz bottle'), 0)
  assert.equal(sodaKcal('Pepsi Zero Sugar', '12oz can'), 0, 'an unlisted diet drink reads as diet')
  assert.equal(sodaKcal('Big Red', '12oz can'), 150, 'an unlisted regular drink gets the regular default')
  assert.equal(sodaKcal('Coke', 'Fountain - medium'), 245, 'fountain sizes carry a typical pour')
  assert.equal(sodaKcal('Coke', 'Fountain'), null)
  assert.equal(sodaKcal(undefined, undefined), null)
  assert.deepEqual(sodaKcalTotals([{ drink: 'Coke', size: '12oz can' }, { drink: 'Sprite', size: 'Fountain' }]), { kcal: 140, unsized: 1 })
})
