// Unit tests for the meal-figure helpers (shared/utils/nutrition.ts, mealKey.ts, mealLibrary.ts)
// and soda calories (shared/utils/soda.ts). Same node:test + TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dayNutrition, fmtEstimate, fmtKcal, fmtMacros, indexEstimates, isDayDone, knownMeals, lookupEstimate, mealHistory,
  mealParts, nutritionAverage, nutritionWindow, resolveMealText, slotForTime, splitParts, suggestMeal, unestimatedMeals
} from '../shared/utils/nutrition.ts'
import { mealKey, splitQuantity } from '../shared/utils/mealKey.ts'
import { LIBRARY_TEXTS, MEAL_LIBRARY, libraryLookup } from '../shared/utils/mealLibrary.ts'
import { sodaKcal, sodaKcalTotals } from '../shared/utils/soda.ts'

/** The auto-pair bar in nutrition.ts (STRONG_MATCH) — a prefix hit can never reach it. */
const STRONG = 0.85

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
  // An x that starts a word is not a multiplier: "2 xl pizza" keeps "xl", and is not "2x l pizza".
  assert.equal(mealKey('2 xl pizza'), '2 pizza xl')
  assert.notEqual(mealKey('2 xl pizza'), mealKey('2 x l pizza'))
  assert.equal(mealKey('2x pizza'), mealKey('2 × pizza'))
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

test('"N x": label figures for the meal beat a cached model row for the "N x" text itself', () => {
  const one = libraryLookup('grilled cheese + guac')
  // A model guess for the multiplied text, cached before the library knew the meal, is shadowed.
  const stale = indexEstimates([est('2 x grilled cheese + guac', 700, 20, 60, 35)])
  const two = lookupEstimate(stale, '2 x grilled cheese + guac')
  assert.equal(two.source, 'library')
  assert.equal(two.kcal, one.kcal * 2)
  // A hand entry for the multiplied text is the most recent intent and still wins outright.
  const manual = indexEstimates([est('2 x grilled cheese + guac', 900, 40, 80, 40, { source: 'manual' })])
  assert.equal(lookupEstimate(manual, '2 x grilled cheese + guac').kcal, 900)
  // A hand entry for the BASE beats a model row for the multiplied text too.
  const manualBase = indexEstimates([est('veggie lasagna', 600, 30, 60, 25, { source: 'manual' }), est('2 x veggie lasagna', 999, 1, 1, 1)])
  const scaled = lookupEstimate(manualBase, '2 x veggie lasagna')
  assert.equal(scaled.kcal, 1200)
  assert.equal(scaled.source, 'manual')
  // No label source at either level: the model row for the exact text beats scaling the base's.
  const aiBoth = indexEstimates([est('veggie lasagna', 600, 30, 60, 25), est('2 x veggie lasagna', 1100, 1, 1, 1)])
  assert.equal(lookupEstimate(aiBoth, '2 x veggie lasagna').kcal, 1100)
  const aiBase = indexEstimates([est('veggie lasagna', 600, 30, 60, 25)])
  assert.equal(lookupEstimate(aiBase, '2 x veggie lasagna').kcal, 1200)
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

test('a day is done once dinner is logged; every past day is done', () => {
  assert.equal(isDayDone({ date: '2026-10-19', food: { lunch: 'alpha plate' } }, '2026-10-20'), true, 'yesterday, no dinner: done')
  assert.equal(isDayDone({ date: '2026-10-20', food: { breakfast: 'x', lunch: 'alpha plate' } }, '2026-10-20'), false, 'today, dinner not in: running')
  assert.equal(isDayDone({ date: '2026-10-20', food: { lunch: 'alpha plate', dinner: ' bravo plate ' } }, '2026-10-20'), true)
  assert.equal(isDayDone(null, '2026-10-20'), false)
})

test('the weekly window ends yesterday until today’s dinner is logged, then today — seven days either way', () => {
  const running = [{ date: '2026-10-20', food: { lunch: 'bravo plate' } }]
  assert.deepEqual(nutritionWindow(running, '2026-10-20'), { from: '2026-10-13', to: '2026-10-19' })
  assert.deepEqual(nutritionWindow([], '2026-10-20'), { from: '2026-10-13', to: '2026-10-19' }, 'nothing logged today: still running')
  const done = [{ date: '2026-10-20', food: { lunch: 'bravo plate', dinner: 'alpha plate' } }]
  assert.deepEqual(nutritionWindow(done, '2026-10-20'), { from: '2026-10-14', to: '2026-10-20' })
  assert.deepEqual(nutritionWindow(done, '2026-10-20', 30), { from: '2026-09-21', to: '2026-10-20' })
})

test('the weekly average counts only fully covered, finished days inside the window', () => {
  // ("a" alone is a stopword and keys to nothing — a meal name needs a real word.)
  const index = indexEstimates([est('alpha plate', 1000, 50, 100, 30), est('bravo plate', 500, 25, 50, 15)])
  const entries = [
    { date: '2026-10-12', food: { lunch: 'alpha plate', dinner: 'alpha plate' } }, // before the window: skipped
    { date: '2026-10-14', food: { lunch: 'alpha plate' } },
    { date: '2026-10-15', food: { lunch: 'alpha plate', dinner: 'bravo plate' } },
    { date: '2026-10-16', food: { lunch: 'alpha plate', dinner: 'unknown meal' } }, // partial figures: skipped
    { date: '2026-10-17', food: {} }, // nothing logged: skipped
    { date: '2026-10-20', food: { lunch: 'bravo plate' } }, // today, dinner not in: a running total, not a day
    { date: '2026-10-21', food: { lunch: 'alpha plate' } } // after today: skipped
  ]
  // Oct 13–19: the 14th and 15th. The half-logged 20th used to count as a 500 kcal day.
  assert.deepEqual(nutritionAverage(entries, index, '2026-10-20'), { days: 2, kcal: 1250, protein_g: 63, estimated: true })
  // Dinner logged → the window slides to Oct 14–20 and today joins.
  const withDinner = entries.map(e => (e.date === '2026-10-20' ? { ...e, food: { ...e.food, dinner: 'bravo plate' } } : e))
  assert.deepEqual(nutritionAverage(withDinner, index, '2026-10-20'), { days: 3, kcal: Math.round((1000 + 1500 + 1000) / 3), protein_g: Math.round((50 + 75 + 50) / 3), estimated: true })
  assert.deepEqual(nutritionAverage([], index, '2026-10-20'), { days: 0, kcal: 0, protein_g: 0, estimated: false })
  // Label figures only (a hand entry) → not "est.".
  const manual = indexEstimates([est('alpha plate', 1000, 50, 100, 30, { source: 'manual' })])
  assert.equal(nutritionAverage([{ date: '2026-10-19', food: { lunch: 'alpha plate' } }], manual, '2026-10-20').estimated, false)
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
  // Prefix tolerance: "mcd" reads as "mcdonalds" — offered, never applied on its own.
  const abbrev = suggestMeal('mcd double cheeseburger fries', known)
  assert.equal(abbrev?.text, 'mcdonalds double cheeseburger + fries')
  assert.equal(abbrev?.strength, 'maybe', 'a prefix hit is half a hit and blocks strong')
  // "chips" folds to "chip", a prefix of "chipotle": at full weight this scored 1.0 against the
  // library's "chipotle chicken quesadilla" alias and was silently saved as the quesadilla.
  const chips = suggestMeal('chicken quesadilla + chips', known)
  assert.equal(chips?.text, 'chicken quesadilla')
  assert.equal(chips?.strength, 'maybe')
  assert.ok(chips.score < STRONG, `scored ${chips.score}`)
  assert.deepEqual(resolveMealText('chicken quesadilla + chips', known), { text: 'chicken quesadilla + chips', changed: false })
  assert.deepEqual(resolveMealText('chicken tacos + chips', known), { text: 'chicken tacos + chips', changed: false })
  // Even a near-total overlap stays a question when one of the hits was a prefix.
  const doub = suggestMeal('steak n shake bacon doub cheeseburger + small tots', known)
  assert.equal(doub?.text, 'steak n shake bacon double cheeseburger + tots')
  assert.equal(doub?.strength, 'maybe')
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

test('a meal known only under a quantity is a candidate by its core, so another quantity never stacks on it', () => {
  // Not in the library — the "2 x costco cheese pizza" case above passed only because the
  // library supplies the quantity-free canonical (audit #42 item 43).
  const index = indexEstimates([est('2 x alpha dinner plate', 1200, 60, 100, 50, { source: 'manual' })])
  const known = knownMeals([{ food: { dinner: '2 x alpha dinner plate' } }, { food: { dinner: '2 x Alpha Dinner Plate' } }], index)
  const core = known.find(k => k.key === 'alpha dinner plate')
  assert.ok(core, 'the core is the known meal')
  assert.equal(core.text, 'alpha dinner plate', 'spelled without the quantity')
  assert.equal(core.count, 2, 'both loggings count for it')
  // (The library's own "2 x mcdonalds …" meal is a deliberate entry with its own figures and stays a candidate.)
  assert.ok(!known.some(k => /^\d+ x alpha/i.test(k.text)), 'no quantity-bearing candidate for it')
  assert.equal(suggestMeal('3 x alpha dinner plate', known), null, 'already canonical under its own quantity')
  assert.equal(suggestMeal('alpha dinner plate', known), null)
  assert.deepEqual(suggestMeal('3 x Alpha Dinner Plates', known), { text: '3 x alpha dinner plate', strength: 'exact', score: 1 })
  assert.deepEqual(resolveMealText('3 x alpha dinner plate', known), { text: '3 x alpha dinner plate', changed: false })
  // The base logged in its own right keeps its most common spelling and the quantity loggings add to its count.
  const both = knownMeals([{ food: { lunch: 'Alpha Dinner Plate' } }, { food: { dinner: '2 x alpha dinner plate' } }, { food: { dinner: 'Alpha Dinner Plate' } }], indexEstimates([est('alpha dinner plate', 600, 30, 50, 25, { source: 'manual' })]))
  assert.deepEqual(both.find(k => k.key === 'alpha dinner plate'), { text: 'Alpha Dinner Plate', key: 'alpha dinner plate', count: 3 })
})

test('alias-collision guard: no two library meals answer to the same key', () => {
  const owners = new Map()
  for (const meal of MEAL_LIBRARY) {
    for (const spelling of [meal.text, ...(meal.aliases ?? [])]) {
      const key = mealKey(spelling)
      assert.ok(key, `"${spelling}" has a key`)
      const owner = owners.get(key)
      assert.ok(!owner || owner === meal.text, `"${spelling}" of "${meal.text}" collides with "${owner}" on the key "${key}"`)
      owners.set(key, meal.text)
    }
  }
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

// --- plus-joined texts: several snacks in one slot (2026-10-26) ---

test('a plus-joined text is the sum of its parts when every part is known', () => {
  const sticks = libraryLookup('beef sticks')
  const index = indexEstimates([est('apple', 100, 0, 25, 0)])
  const both = lookupEstimate(index, 'beef sticks + apple')
  assert.ok(both)
  assert.equal(both.kcal, sticks.kcal + 100)
  assert.equal(both.carbs_g, Math.round((sticks.carbs_g + 25) * 10) / 10)
  assert.equal(both.source, 'ai', 'one model part makes the sum a model figure')
  assert.equal(both.parts.length, 2)
  assert.equal(both.parts[1].estimate.kcal, 100)
  assert.match(both.assumptions, /^beef sticks \d+ \+ apple 100$/)
  // Order and spacing don't matter; "and" and a bare + do not split.
  assert.equal(lookupEstimate(index, 'apple  +  beef sticks').kcal, both.kcal)
  assert.equal(lookupEstimate(index, 'apple and beef sticks'), null)
  assert.equal(splitParts('beef sticks+apple'), null)
  assert.deepEqual(splitParts('a + b + c'), ['a', 'b', 'c'])
  assert.equal(splitParts('just one'), null)
})

test('a part nobody knows leaves the whole without figures, and names itself as the gap', () => {
  const index = indexEstimates([])
  assert.equal(lookupEstimate(index, 'beef sticks + mystery bar'), null)
  const parts = mealParts(index, 'beef sticks + mystery bar')
  assert.equal(parts[0].estimate.source, 'library')
  assert.equal(parts[1].estimate, null)
  assert.equal(mealParts(index, 'beef sticks'), null, 'a single meal has no parts')
  // The backfill list asks about the unknown part only, once, however many combos it is in.
  const entries = [
    { food: { snack_pm: 'beef sticks + mystery bar' } },
    { food: { snack_eve: 'mystery bar + watermelon' } },
    { food: { lunch: 'veggie lasagna' } }
  ]
  assert.deepEqual(unestimatedMeals(entries, index), ['mystery bar', 'veggie lasagna'])
})

test('whole-text figures beat composition, and "N x" multiplies the composed sum', () => {
  // The library prices this combo as one meal; its parts would not be looked up separately.
  const combo = libraryLookup('grilled cheese + guac')
  assert.equal(lookupEstimate(new Map(), 'grilled cheese + guac').kcal, combo.kcal)
  assert.equal(lookupEstimate(new Map(), 'grilled cheese + guac').parts, undefined)
  // A hand entry for the whole wins over the parts' sum.
  const manual = indexEstimates([est('beef sticks + apple', 999, 1, 1, 1, { source: 'manual' }), est('apple', 100, 0, 25, 0)])
  assert.equal(lookupEstimate(manual, 'beef sticks + apple').kcal, 999)
  // "2 x beef sticks + apple" = two of everything, per Jim's convention.
  const index = indexEstimates([est('apple', 100, 0, 25, 0)])
  const one = lookupEstimate(index, 'beef sticks + apple')
  const two = lookupEstimate(index, '2 x beef sticks + apple')
  assert.equal(two.kcal, one.kcal * 2)
  assert.equal(two.key, mealKey('2 x beef sticks + apple'))
  // The day total and the home floor marker follow the composed figure.
  const day = dayNutrition({ food: { snack_pm: 'beef sticks + apple' } }, index)
  assert.equal(day.kcal, one.kcal)
  assert.equal(day.missing.length, 0)
})
